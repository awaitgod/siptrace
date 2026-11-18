import { SchematicProject, SpiceSimResult } from '../../core/types';
import { extractSchematicNetlist } from '../netlist/netlistExtractor';
import { Complex, solveComplexSystem } from './complexSolver';
import { solveLinearSystem } from './linearSolver';
import { parseMetricValue } from './metricParser';
import { exportSpiceNetlist } from './spiceNetlistExporter';

export interface SpiceSimulationOptions {
  mode?: 'DC' | 'Transient' | 'AC';
  stopTimeMs?: number;
  stepTimeMs?: number;
  fStartHz?: number;
  fStopHz?: number;
  pointsPerDecade?: number;
  temperatureC?: number;
}

interface Res { n1: number; n2: number; r: number; refDes: string; }
interface Cap { n1: number; n2: number; c: number; vPrev: number; refDes: string; }
interface Ind { n1: number; n2: number; l: number; iPrev: number; refDes: string; }
interface Diode { n1: number; n2: number; vf: number; refDes: string; }
interface ActiveStage {
  nCtrlPos: number;
  nCtrlNeg: number;
  nOut: number;
  nRef: number;
  gm: number;
  rOut: number;
  kind: 'BJT' | 'MOSFET' | 'OPAMP' | 'LOGIC';
  refDes: string;
}
interface VSource {
  nPos: number;
  nNeg: number;
  v: number;
  acAmp?: number;
  isSignalStimulus?: boolean;
  name: string;
}

interface MnaCircuit {
  netListArr: string[];
  resistors: Res[];
  caps: Cap[];
  inds: Ind[];
  diodes: Diode[];
  activeStages: ActiveStage[];
  vsources: VSource[];
}

function parsePowerRailVoltage(net: string): number | null {
  const up = net.trim().toUpperCase();
  if (up === 'VCC' || up === 'VDD' || up === 'VIN') return 5.0;
  if (up === 'VCC_3V3' || up === 'VDD_3V3' || up === '+3V3' || up === '3V3') return 3.3;
  if (up === 'VCC_1V8' || up === '+1V8' || up === '1V8') return 1.8;
  if (up === 'VCC_12V' || up === '+12V' || up === '12V') return 12.0;
  if (up === 'VEE' || up === '-12V') return -12.0;
  if (up === '-5V') return -5.0;
  const m = /^([+-]?)(\d+(?:[.,Vv]\d+)?)[Vv]?$/.exec(net.trim());
  if (!m) return null;
  const numStr = m[2].replace(',', '.').replace(/[Vv]/, '.');
  const val = parseFloat(numStr);
  if (!Number.isFinite(val)) return null;
  return m[1] === '-' ? -val : val;
}

function buildMnaCircuit(sch: SchematicProject): MnaCircuit {
  const netlist = extractSchematicNetlist(sch);
  const pinToNet = new Map<string, string>();
  const nonGroundNets = new Set<string>();
  const compPinsMap = new Map<string, Map<string, string>>();

  for (const n of netlist) {
    const isGnd = n.netName === 'GND' || n.netName === '0' || n.netName === 'VSS' || n.netName === 'AGND' || n.netName === 'DGND';
    const cleanNet = isGnd ? 'GND' : n.netName;
    for (const nd of n.nodes) {
      pinToNet.set(`${nd.refDes}:${nd.padNumber}`, cleanNet);
      if (!compPinsMap.has(nd.refDes)) compPinsMap.set(nd.refDes, new Map());
      compPinsMap.get(nd.refDes)!.set(String(nd.padNumber), cleanNet);
    }
    if (!isGnd) nonGroundNets.add(n.netName);
  }

  const netListArr = Array.from(nonGroundNets);
  const netIdx = new Map<string, number>();
  netListArr.forEach((n, i) => netIdx.set(n, i));
  const getIdx = (netName: string | undefined): number => {
    if (!netName || netName === 'GND' || netName === '0' || netName === 'VSS' || netName === 'AGND' || netName === 'DGND') return -1;
    return netIdx.get(netName) ?? -1;
  };

  const getPin = (refDes: string, ...keys: string[]): number => {
    for (const k of keys) {
      const net = pinToNet.get(`${refDes}:${k}`);
      if (net !== undefined) return getIdx(net);
    }
    const map = compPinsMap.get(refDes);
    if (map) {
      for (const k of keys) {
        const net = map.get(k);
        if (net !== undefined) return getIdx(net);
      }
      const vals = Array.from(map.values());
      const idx = parseInt(keys[0], 10);
      if (Number.isFinite(idx) && idx >= 1 && idx <= vals.length) {
        return getIdx(vals[idx - 1]);
      }
    }
    return -1;
  };

  const resistors: Res[] = [];
  const caps: Cap[] = [];
  const inds: Ind[] = [];
  const diodes: Diode[] = [];
  const activeStages: ActiveStage[] = [];
  const vsources: VSource[] = [];

  for (const net of netListArr) {
    const vVal = parsePowerRailVoltage(net);
    if (vVal !== null) {
      const isSig = /^(VIN|IN|SIG)/i.test(net.trim());
      vsources.push({
        nPos: getIdx(net),
        nNeg: -1,
        v: vVal,
        acAmp: 1.0,
        isSignalStimulus: isSig,
        name: `V_${net}`
      });
    }
  }

  if (vsources.length === 0 && netListArr.length > 0) {
    const stimNet = netListArr.find((n) => /in|tx|rx|sig|clk/i.test(n)) ?? netListArr[0];
    vsources.push({
      nPos: getIdx(stimNet),
      nNeg: -1,
      v: 5.0,
      acAmp: 1.0,
      isSignalStimulus: true,
      name: `V_STIM`
    });
  }

  const seen = new Set<string>();
  for (const s of sch.sheets) {
    for (const c of s.components) {
      if (!c.refDes || c.refDes.startsWith('#') || c.doNotMount || seen.has(c.refDes)) continue;
      seen.add(c.refDes);

      const up = c.refDes.toUpperCase();
      const typeHint = `${c.typeName} ${c.value}`.toUpperCase();

      const i1 = getPin(c.refDes, '1', 'A', 'ANODE', 'B', 'BASE', 'G', 'GATE', 'IN');
      const i2 = getPin(c.refDes, '2', 'K', 'CATHODE', 'C', 'COLLECTOR', 'D', 'DRAIN', 'OUT');
      const i3 = getPin(c.refDes, '3', 'E', 'EMITTER', 'S', 'SOURCE', 'GND', 'REF');
      const i4 = getPin(c.refDes, '4', 'VCC', 'VDD');
      const i5 = getPin(c.refDes, '5', 'OUT2');

      if (up.startsWith('R')) {
        resistors.push({ n1: i1, n2: i2, r: Math.max(0.01, parseMetricValue(c.value, 1000)), refDes: c.refDes });
      } else if (up.startsWith('C')) {
        caps.push({ n1: i1, n2: i2, c: Math.max(1e-13, parseMetricValue(c.value, 1e-7)), vPrev: 0, refDes: c.refDes });
      } else if (up.startsWith('L')) {
        inds.push({ n1: i1, n2: i2, l: Math.max(1e-9, parseMetricValue(c.value, 1e-4)), iPrev: 0, refDes: c.refDes });
      } else if (up.startsWith('VD') || up.startsWith('HL') || up.startsWith('D') || up.startsWith('LED')) {
        const isLed = up.startsWith('HL') || /LED|СВЕТОДИОД/i.test(typeHint);
        const isSchottky = /BAT|SS|SK|1N58|ШОТТКИ/i.test(typeHint);
        const vf = isLed ? 1.9 : isSchottky ? 0.35 : 0.7;
        diodes.push({ n1: i1, n2: i2, vf, refDes: c.refDes });
      } else if (up.startsWith('VT') || up.startsWith('Q') || up.startsWith('M')) {
        const isMosfet = up.startsWith('M') || /MOS|FET|IRF|FDN|AO34|BS170|2N700|КП50/i.test(typeHint);
        if (isMosfet) {
          activeStages.push({
            nCtrlPos: i1,
            nCtrlNeg: i3,
            nOut: i2,
            nRef: i3,
            gm: 0.08,
            rOut: 2e4,
            kind: 'MOSFET',
            refDes: c.refDes
          });
        } else {
          activeStages.push({
            nCtrlPos: i1,
            nCtrlNeg: i3,
            nOut: i2,
            nRef: i3,
            gm: 0.05,
            rOut: 1.5e4,
            kind: 'BJT',
            refDes: c.refDes
          });
        }
      } else if (up.startsWith('DA') || up.startsWith('OP')) {
        // Operational amplifier / Analog stage
        activeStages.push({
          nCtrlPos: i1,
          nCtrlNeg: i2,
          nOut: i3 >= 0 ? i3 : i4,
          nRef: -1,
          gm: 0.2,
          rOut: 50,
          kind: 'OPAMP',
          refDes: c.refDes
        });
      } else if (up.startsWith('DD')) {
        // Digital logic gate
        activeStages.push({
          nCtrlPos: i1,
          nCtrlNeg: -1,
          nOut: i2 >= 0 ? i2 : i3,
          nRef: -1,
          gm: 0.06,
          rOut: 75,
          kind: 'LOGIC',
          refDes: c.refDes
        });
      } else if (up.startsWith('U') || up.startsWith('VU') || up.startsWith('IC')) {
        // General IC
        diodes.push({ n1: i1, n2: i2, vf: 1.25, refDes: c.refDes });
        activeStages.push({
          nCtrlPos: i1,
          nCtrlNeg: i2,
          nOut: i5 >= 0 ? i5 : i4 >= 0 ? i4 : i3,
          nRef: i4 >= 0 ? i4 : -1,
          gm: 0.03,
          rOut: 5e3,
          kind: 'OPAMP',
          refDes: c.refDes
        });
      } else {
        if (i1 >= 0) resistors.push({ n1: i1, n2: -1, r: 2e5, refDes: c.refDes });
        if (i2 >= 0) resistors.push({ n1: i2, n2: -1, r: 2e5, refDes: c.refDes });
      }
    }
  }

  return { netListArr, resistors, caps, inds, diodes, activeStages, vsources };
}

function solveDcOrTransientStep(
  circuit: MnaCircuit,
  dt: number | null,
  tSec: number
): { x: number[]; currents: Record<string, number>; converged: boolean } {
  const { netListArr, resistors, caps, inds, diodes, activeStages, vsources } = circuit;
  const N = netListArr.length;
  const dim = N + vsources.length;
  const A = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const b = new Array<number>(dim).fill(0);

  // GMIN conductance to ground on every node to guarantee non-singular matrix for floating subnets
  for (let i = 0; i < N; i++) A[i][i] += 1e-9;

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
  for (const d of diodes) stampG(d.n1, d.n2, 1e-9);
  for (const st of activeStages) stampG(st.nOut, st.nRef, 1 / st.rOut);

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
    // DC analysis: Inductors have small DC series resistance (1 mOhm)
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
    const sigV = vs.isSignalStimulus
      ? (vs.acAmp ?? 1.0) * Math.sin(2 * Math.PI * 1000 * tSec)
      : 0;
    b[row] =
      dt !== null
        ? vs.v * (1 - Math.exp(-tSec / 5e-5)) + sigV
        : vs.v;
  });

  // Initial linear solve
  let x = solveLinearSystem(A, b) ?? new Array<number>(dim).fill(0);
  const maxSupplyV = vsources.reduce((m, v) => Math.max(m, Math.abs(v.v)), 5.0);

  // Newton-Raphson iteration for non-linear Shockley diodes and saturating active stages
  let converged = true;
  for (let iter = 0; iter < 12; iter++) {
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
      const vd = v1 - v2;
      const vt = 0.02585 * (d.vf > 1.5 ? 1.75 : 1.2);
      const is = 1e-12;

      let id: number;
      let gd: number;
      if (vd < -5 * vt) {
        id = -is;
        gd = 1e-12;
      } else if (vd <= d.vf) {
        const ev = Math.exp(Math.min(30, vd / vt));
        id = is * (ev - 1);
        gd = Math.max(1e-9, Math.min(10, (is / vt) * ev));
      } else {
        const ev = Math.exp(Math.min(30, d.vf / vt));
        const idAtVf = is * (ev - 1);
        const gdAtVf = Math.max(0.1, Math.min(2.0, (is / vt) * ev));
        gd = gdAtVf;
        id = idAtVf + gd * (vd - d.vf);
      }
      const ieq = id - gd * vd;
      addG(d.n1, d.n2, gd);
      addI(d.n1, d.n2, ieq);
    }

    for (const st of activeStages) {
      const vc1 = st.nCtrlPos >= 0 ? x[st.nCtrlPos] : 0;
      const vc2 = st.nCtrlNeg >= 0 ? x[st.nCtrlNeg] : 0;
      const vDiff = Math.max(0, Math.min(3.5, vc1 - vc2));
      const iSat = Math.min(maxSupplyV / st.rOut, st.gm * vDiff);
      addI(st.nOut, st.nRef, iSat);
    }

    const xNext = solveLinearSystem(A2, b2);
    if (!xNext) {
      converged = false;
      break;
    }

    let maxDiff = 0;
    for (let i = 0; i < N; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(xNext[i] - x[i]));
    }
    x = xNext;
    if (maxDiff < 1e-4) {
      converged = true;
      break;
    }
  }

  // Branch currents calculation
  const currents: Record<string, number> = {};
  vsources.forEach((vs, k) => {
    // Current exiting positive terminal of source
    const iSrc = x[N + k];
    currents[vs.name] = Number((iSrc * 1000).toFixed(4)); // mA
  });
  for (const r of resistors) {
    const v1 = r.n1 >= 0 ? x[r.n1] : 0;
    const v2 = r.n2 >= 0 ? x[r.n2] : 0;
    currents[`I(${r.refDes})`] = Number((((v1 - v2) / r.r) * 1000).toFixed(4)); // mA
  }

  const boundedX = x.map((v, idx) =>
    idx < N ? Math.max(-maxSupplyV * 2.5, Math.min(maxSupplyV * 2.5, v)) : v
  );

  return { x: boundedX, currents, converged };
}

function runAcSmallSignalSweep(
  circuit: MnaCircuit,
  fStartHz = 10,
  fStopHz = 10e6,
  points = 30
) {
  const { netListArr, resistors, caps, inds, diodes, activeStages, vsources } = circuit;
  const N = netListArr.length;
  const dim = N + vsources.length;
  const frequencies: number[] = [];
  const acMagnitudeDb: Record<string, number[]> = {};
  const acPhaseDeg: Record<string, number[]> = {};
  for (const n of netListArr) {
    acMagnitudeDb[n] = [];
    acPhaseDeg[n] = [];
  }

  const logStart = Math.log10(Math.max(1, fStartHz));
  const logStop = Math.log10(Math.max(10, fStopHz));
  const span = Math.max(0.1, logStop - logStart);

  for (let p = 0; p < points; p++) {
    const logF = logStart + (p / (points - 1)) * span;
    const freq = Math.pow(10, logF);
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
      const phase = (Math.atan2(sol[i].im, sol[i].re) * 180) / Math.PI;
      acMagnitudeDb[netListArr[i]].push(Number((20 * Math.log10(mag)).toFixed(2)));
      acPhaseDeg[netListArr[i]].push(Number(phase.toFixed(1)));
    }
  }

  return { frequencies, acMagnitudeDb, acPhaseDeg };
}

/** Runs built-in Modified Nodal Analysis (MNA) DC, Transient, and AC small-signal simulation. */
export function runBuiltInSpiceSimulation(
  sch: SchematicProject,
  modeOrOptions: 'DC' | 'Transient' | 'AC' | SpiceSimulationOptions = 'Transient',
  legacyStopTimeMs = 2.0
): SpiceSimResult {
  const options: SpiceSimulationOptions =
    typeof modeOrOptions === 'string'
      ? { mode: modeOrOptions, stopTimeMs: legacyStopTimeMs }
      : { mode: 'Transient', stopTimeMs: 2.0, ...modeOrOptions };

  const mode = options.mode ?? 'Transient';
  const stopTimeMs = Math.max(0.01, options.stopTimeMs ?? legacyStopTimeMs);

  const netlistText = exportSpiceNetlist(sch);
  const circuit = buildMnaCircuit(sch);
  const N = circuit.netListArr.length;

  const dcRes = solveDcOrTransientStep(circuit, null, 0);
  const dcNodes = circuit.netListArr.map((netName, i) => ({
    netName,
    dcVoltage: Number(dcRes.x[i].toFixed(4))
  }));

  const steps = options.stepTimeMs
    ? Math.max(10, Math.min(1000, Math.round(stopTimeMs / options.stepTimeMs)))
    : 80;
  const dt = (stopTimeMs * 1e-3) / steps;
  const timePoints: number[] = [];
  const waveforms: Record<string, number[]> = {};
  for (const n of circuit.netListArr) waveforms[n] = [];

  let simConverged = dcRes.converged;

  if (mode === 'Transient' || mode === 'DC') {
    for (let step = 0; step <= steps; step++) {
      const tSec = step * dt;
      timePoints.push(Number((tSec * 1000).toFixed(4)));
      const sol = solveDcOrTransientStep(circuit, dt, tSec);
      if (!sol.converged) simConverged = false;
      for (let i = 0; i < N; i++) {
        waveforms[circuit.netListArr[i]].push(Number(sol.x[i].toFixed(4)));
      }
      for (const cap of circuit.caps) {
        const v1 = cap.n1 >= 0 ? sol.x[cap.n1] : 0;
        const v2 = cap.n2 >= 0 ? sol.x[cap.n2] : 0;
        cap.vPrev = v1 - v2;
      }
      for (const ind of circuit.inds) {
        const v1 = ind.n1 >= 0 ? sol.x[ind.n1] : 0;
        const v2 = ind.n2 >= 0 ? sol.x[ind.n2] : 0;
        ind.iPrev += (dt / ind.l) * (v1 - v2);
      }
    }
  }

  const { frequencies, acMagnitudeDb, acPhaseDeg } = runAcSmallSignalSweep(
    circuit,
    options.fStartHz ?? 10,
    options.fStopHz ?? 10e6,
    options.pointsPerDecade ? Math.round(options.pointsPerDecade * 6) : 30
  );

  return {
    mode,
    converged: simConverged,
    message: `Симуляция MNA (${mode}) завершена: ${N} узлов, ${circuit.resistors.length} R, ${circuit.caps.length} C, ${circuit.inds.length} L, ${circuit.diodes.length} диодов, ${circuit.activeStages.length} акт. каскадов, ${circuit.vsources.length} источников.`,
    dcNodes,
    timePoints,
    waveforms,
    frequencies,
    acMagnitudeDb,
    acPhaseDeg,
    branchCurrents: dcRes.currents,
    spiceNetlist: netlistText
  };
}
