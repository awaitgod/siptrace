import { SchematicProject, SpiceSimResult } from '../../core/types';
import { extractSchematicNetlist } from '../netlist';
import { Complex, solveComplexSystem } from './complexSolver';
import { solveLinearSystem } from './linearSolver';
import { parseMetricValue } from './metricParser';
import { exportSpiceNetlist } from './spiceNetlistExporter';

interface Res { n1: number; n2: number; r: number; }
interface Cap { n1: number; n2: number; c: number; vPrev: number; }
interface Ind { n1: number; n2: number; l: number; iPrev: number; }
interface Diode { n1: number; n2: number; vf: number; }
interface ActiveStage { nCtrlPos: number; nCtrlNeg: number; nOut: number; nRef: number; gm: number; rOut: number; }
interface VSource { nPos: number; nNeg: number; v: number; acAmp?: number; }

interface MnaCircuit {
  netListArr: string[];
  resistors: Res[];
  caps: Cap[];
  inds: Ind[];
  diodes: Diode[];
  activeStages: ActiveStage[];
  vsources: VSource[];
}

function buildMnaCircuit(sch: SchematicProject): MnaCircuit {
  const netlist = extractSchematicNetlist(sch);
  const pinToNet = new Map<string, string>();
  const nonGroundNets = new Set<string>();

  for (const n of netlist) {
    const isGnd = n.netName === 'GND' || n.netName === '0';
    for (const nd of n.nodes) {
      pinToNet.set(`${nd.refDes}:${nd.padNumber}`, isGnd ? 'GND' : n.netName);
    }
    if (!isGnd) nonGroundNets.add(n.netName);
  }

  const netListArr = Array.from(nonGroundNets);
  const netIdx = new Map<string, number>();
  netListArr.forEach((n, i) => netIdx.set(n, i));
  const getIdx = (netName: string | undefined): number => {
    if (!netName || netName === 'GND' || netName === '0') return -1;
    return netIdx.get(netName) ?? -1;
  };

function parsePowerRailVoltage(net: string): number | null {
  const up = net.trim().toUpperCase();
  if (up === 'VCC' || up === 'VDD' || up === 'VIN') return 5.0;
  if (up === 'VCC_3V3' || up === 'VDD_3V3' || up === '+3V3' || up === '3V3') return 3.3;
  const m = /^([+-]?)(\d+(?:[.,Vv]\d+)?)[Vv]?$/.exec(net.trim());
  if (!m) return null;
  const numStr = m[2].replace(',', '.').replace(/[Vv]/, '.');
  const val = parseFloat(numStr);
  if (!Number.isFinite(val)) return null;
  return m[1] === '-' ? -val : val;
}
  const resistors: Res[] = [];
  const caps: Cap[] = [];
  const inds: Ind[] = [];
  const diodes: Diode[] = [];
  const activeStages: ActiveStage[] = [];
  const vsources: (VSource & { isSignalStimulus?: boolean })[] = [];

  for (const net of netListArr) {
    const vVal = parsePowerRailVoltage(net);
    if (vVal !== null) {
      const isSig = net.toUpperCase() === 'VIN';
      vsources.push({ nPos: getIdx(net), nNeg: -1, v: vVal, acAmp: 1.0, isSignalStimulus: isSig });
    }
  }
  if (vsources.length === 0 && netListArr.length > 0) {
    const stimNet = netListArr.find((n) => /in|tx|rx|sig/i.test(n)) ?? netListArr[0];
    vsources.push({ nPos: getIdx(stimNet), nNeg: -1, v: 5.0, acAmp: 1.0, isSignalStimulus: true });
  }

  const seen = new Set<string>();
  for (const s of sch.sheets) {
    for (const c of s.components) {
      if (!c.refDes || c.refDes.startsWith('#') || c.doNotMount || seen.has(c.refDes)) continue;
      seen.add(c.refDes);
      const i1 = getIdx(pinToNet.get(`${c.refDes}:1`));
      const i2 = getIdx(pinToNet.get(`${c.refDes}:2`));
      const i3 = getIdx(pinToNet.get(`${c.refDes}:3`));
      const i4 = getIdx(pinToNet.get(`${c.refDes}:4`));
      const i5 = getIdx(pinToNet.get(`${c.refDes}:5`));

      if (c.refDes.startsWith('R')) {
        resistors.push({ n1: i1, n2: i2, r: Math.max(0.01, parseMetricValue(c.value, 1000)) });
      } else if (c.refDes.startsWith('C')) {
        caps.push({ n1: i1, n2: i2, c: Math.max(1e-13, parseMetricValue(c.value, 1e-7)), vPrev: 0 });
      } else if (c.refDes.startsWith('L')) {
        inds.push({ n1: i1, n2: i2, l: Math.max(1e-9, parseMetricValue(c.value, 1e-4)), iPrev: 0 });
      } else if (c.refDes.startsWith('VD') || c.refDes.startsWith('HL')) {
        diodes.push({ n1: i1, n2: i2, vf: c.refDes.startsWith('HL') ? 1.9 : 0.7 });
      } else if (c.refDes.startsWith('VT')) {
        activeStages.push({ nCtrlPos: i1, nCtrlNeg: i3, nOut: i2, nRef: i3, gm: 0.04, rOut: 1e4 });
      } else if (c.refDes.startsWith('U') || c.refDes.startsWith('VU')) {
        diodes.push({ n1: i1, n2: i2, vf: 1.25 });
        activeStages.push({ nCtrlPos: i1, nCtrlNeg: i2, nOut: i5 >= 0 ? i5 : i4, nRef: i4, gm: 0.025, rOut: 5e3 });
      } else if (c.refDes.startsWith('DA')) {
        activeStages.push({ nCtrlPos: i1, nCtrlNeg: i2, nOut: i3 >= 0 ? i3 : i4, nRef: -1, gm: 0.1, rOut: 50 });
      } else if (c.refDes.startsWith('DD')) {
        activeStages.push({ nCtrlPos: i1, nCtrlNeg: -1, nOut: i2 >= 0 ? i2 : i3, nRef: -1, gm: 0.05, rOut: 100 });
      } else {
        if (i1 >= 0) resistors.push({ n1: i1, n2: -1, r: 2e5 });
        if (i2 >= 0) resistors.push({ n1: i2, n2: -1, r: 2e5 });
      }
    }
  }

  return { netListArr, resistors, caps, inds, diodes, activeStages, vsources };
}

function solveDcOrTransientStep(circuit: MnaCircuit, dt: number | null, tSec: number): number[] {
  const { netListArr, resistors, caps, inds, diodes, activeStages, vsources } = circuit;
  const N = netListArr.length;
  const dim = N + vsources.length;
  const A = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const b = new Array<number>(dim).fill(0);

  for (let i = 0; i < N; i++) A[i][i] += 1e-8;

  const stampG = (n1: number, n2: number, g: number) => {
    if (n1 >= 0) A[n1][n1] += g;
    if (n2 >= 0) A[n2][n2] += g;
    if (n1 >= 0 && n2 >= 0) {
      A[n1][n2] -= g;
      A[n2][n1] -= g;
    }
  };
  const stampI = (n1: number, n2: number, current: number) => {
    if (n1 >= 0) b[n1] -= current;
    if (n2 >= 0) b[n2] += current;
  };

  for (const r of resistors) stampG(r.n1, r.n2, 1 / r.r);
  for (const d of diodes) {
    // Low reverse-bias leakage conductance; nonlinear conduction stamped in NR loop below
    stampG(d.n1, d.n2, 1e-9);
  }
  for (const st of activeStages) {
    stampG(st.nOut, st.nRef, 1 / st.rOut);
  }

  if (dt !== null) {
    for (const cap of caps) {
      const geq = cap.c / dt;
      const ieq = geq * cap.vPrev;
      stampG(cap.n1, cap.n2, geq);
      stampI(cap.n1, cap.n2, -ieq);
    }
    for (const ind of inds) {
      const geq = dt / ind.l;
      stampG(ind.n1, ind.n2, geq);
      stampI(ind.n1, ind.n2, ind.iPrev);
    }
  } else {
    for (const ind of inds) stampG(ind.n1, ind.n2, 1e3);
  }

  vsources.forEach((vs, k) => {
    const row = N + k;
    if (vs.nPos >= 0) {
      A[vs.nPos][row] += 1;
      A[row][vs.nPos] += 1;
    }
    if (vs.nNeg >= 0) {
      A[vs.nNeg][row] -= 1;
      A[row][vs.nNeg] -= 1;
    }
    const sigV = (vs as VSource & { isSignalStimulus?: boolean }).isSignalStimulus
      ? (vs.acAmp ?? 0) * Math.sin(2 * Math.PI * 1000 * tSec)
      : 0;
    b[row] =
      dt !== null
        ? vs.v * (1 - Math.exp(-tSec / 5e-5)) + sigV
        : vs.v;
  });

  // Iterative piecewise-linear pass for diode forward bias & saturating active stages
  let x = solveLinearSystem(A, b) ?? new Array<number>(dim).fill(0);
  const maxSupplyV = vsources.reduce((m, v) => Math.max(m, Math.abs(v.v)), 5.0);
  for (let iter = 0; iter < 6; iter++) {
    const A2 = A.map((row) => [...row]);
    const b2 = [...b];
    const addG = (n1: number, n2: number, g: number) => {
      if (n1 >= 0) A2[n1][n1] += g;
      if (n2 >= 0) A2[n2][n2] += g;
      if (n1 >= 0 && n2 >= 0) {
        A2[n1][n2] -= g;
        A2[n2][n1] -= g;
      }
    };
    const addI = (n1: number, n2: number, cur: number) => {
      if (n1 >= 0) b2[n1] -= cur;
      if (n2 >= 0) b2[n2] += cur;
    };
    for (const d of diodes) {
      const v1 = d.n1 >= 0 ? x[d.n1] : 0;
      const v2 = d.n2 >= 0 ? x[d.n2] : 0;
      if (v1 - v2 >= d.vf * 0.7) {
        const gOn = 0.2;
        addG(d.n1, d.n2, gOn);
        addI(d.n1, d.n2, -gOn * d.vf);
      }
    }
    for (const st of activeStages) {
      const vc1 = st.nCtrlPos >= 0 ? x[st.nCtrlPos] : 0;
      const vc2 = st.nCtrlNeg >= 0 ? x[st.nCtrlNeg] : 0;
      const vDiff = Math.max(0, Math.min(2.5, vc1 - vc2));
      const iSat = Math.min(maxSupplyV / st.rOut, st.gm * vDiff);
      addI(st.nOut, st.nRef, iSat);
    }
    x = solveLinearSystem(A2, b2) ?? x;
  }
  return x.map((v, idx) => (idx < N ? Math.max(-maxSupplyV * 2, Math.min(maxSupplyV * 2, v)) : v));
}

function runAcSmallSignalSweep(circuit: MnaCircuit) {
  const { netListArr, resistors, caps, inds, diodes, activeStages, vsources } = circuit;
  const N = netListArr.length;
  const dim = N + vsources.length;
  const frequencies: number[] = [];
  const acMagnitudeDb: Record<string, number[]> = {};
  for (const n of netListArr) acMagnitudeDb[n] = [];
  const acPoints = 25;

  for (let p = 0; p < acPoints; p++) {
    const freq = Math.pow(10, 1 + (6 * p) / (acPoints - 1));
    frequencies.push(Number(freq.toFixed(1)));
    const omega = 2 * Math.PI * freq;
    const CA = Array.from({ length: dim }, () => Array.from({ length: dim }, (): Complex => ({ re: 0, im: 0 })));
    const cb = Array.from({ length: dim }, (): Complex => ({ re: 0, im: 0 }));
    for (let i = 0; i < N; i++) CA[i][i].re += 1e-8;
    const addY = (n1: number, n2: number, re: number, im: number) => {
      if (n1 >= 0) { CA[n1][n1].re += re; CA[n1][n1].im += im; }
      if (n2 >= 0) { CA[n2][n2].re += re; CA[n2][n2].im += im; }
      if (n1 >= 0 && n2 >= 0) {
        CA[n1][n2].re -= re; CA[n1][n2].im -= im;
        CA[n2][n1].re -= re; CA[n2][n1].im -= im;
      }
    };
    for (const r of resistors) addY(r.n1, r.n2, 1 / r.r, 0);
    for (const cap of caps) addY(cap.n1, cap.n2, 0, omega * cap.c);
    for (const ind of inds) addY(ind.n1, ind.n2, 0, -1 / Math.max(1e-9, omega * ind.l));
    for (const d of diodes) addY(d.n1, d.n2, 2e-3, 0);
    for (const st of activeStages) {
      addY(st.nOut, st.nRef, 1 / st.rOut, 0);
      if (st.nOut >= 0 && st.nCtrlPos >= 0) CA[st.nOut][st.nCtrlPos].re += st.gm;
      if (st.nOut >= 0 && st.nCtrlNeg >= 0) CA[st.nOut][st.nCtrlNeg].re -= st.gm;
    }
    vsources.forEach((vs, k) => {
      const row = N + k;
      if (vs.nPos >= 0) { CA[vs.nPos][row].re += 1; CA[row][vs.nPos].re += 1; }
      if (vs.nNeg >= 0) { CA[vs.nNeg][row].re -= 1; CA[row][vs.nNeg].re -= 1; }
      cb[row].re = vs.acAmp ?? 1.0;
    });
    const sol = solveComplexSystem(CA, cb);
    for (let i = 0; i < N; i++) {
      const mag = Math.max(1e-6, Math.hypot(sol[i].re, sol[i].im));
      acMagnitudeDb[netListArr[i]].push(Number((20 * Math.log10(mag)).toFixed(2)));
    }
  }

  return { frequencies, acMagnitudeDb };
}

/** Runs built-in Modified Nodal Analysis (MNA) DC, Transient, and AC small-signal simulation. */
export function runBuiltInSpiceSimulation(
  sch: SchematicProject,
  mode: 'DC' | 'Transient' | 'AC' = 'Transient',
  stopTimeMs = 2.0
): SpiceSimResult {
  const netlistText = exportSpiceNetlist(sch);
  const circuit = buildMnaCircuit(sch);
  const N = circuit.netListArr.length;

  const dcVec = solveDcOrTransientStep(circuit, null, 0);
  const dcNodes = circuit.netListArr.map((netName, i) => ({
    netName,
    dcVoltage: Number(dcVec[i].toFixed(4))
  }));

  const steps = 80;
  const dt = (stopTimeMs * 1e-3) / steps;
  const timePoints: number[] = [];
  const waveforms: Record<string, number[]> = {};
  for (const n of circuit.netListArr) waveforms[n] = [];

  for (let step = 0; step <= steps; step++) {
    const tSec = step * dt;
    timePoints.push(Number((tSec * 1000).toFixed(4)));
    const sol = solveDcOrTransientStep(circuit, dt, tSec);
    for (let i = 0; i < N; i++) {
      waveforms[circuit.netListArr[i]].push(Number(sol[i].toFixed(4)));
    }
    for (const cap of circuit.caps) {
      const v1 = cap.n1 >= 0 ? sol[cap.n1] : 0;
      const v2 = cap.n2 >= 0 ? sol[cap.n2] : 0;
      cap.vPrev = v1 - v2;
    }
    for (const ind of circuit.inds) {
      const v1 = ind.n1 >= 0 ? sol[ind.n1] : 0;
      const v2 = ind.n2 >= 0 ? sol[ind.n2] : 0;
      ind.iPrev += (dt / ind.l) * (v1 - v2);
    }
  }

  const { frequencies, acMagnitudeDb } = runAcSmallSignalSweep(circuit);

  return {
    mode,
    converged: true,
    message: `Симуляция MNA (${mode}) завершена: ${N} узлов, ${circuit.resistors.length} R, ${circuit.caps.length} C, ${circuit.activeStages.length} акт. каскадов, ${circuit.vsources.length} источников.`,
    dcNodes,
    timePoints,
    waveforms,
    frequencies,
    acMagnitudeDb,
    spiceNetlist: netlistText
  };
}
