import { PcbCopperPour } from '../../core/types';
import { WorldPad } from '../drc';

/** Checks whether a sample point falls inside an anti-pad clearance envelope for any pad shape. */
export function isPointNearAntiPad(px: number, py: number, ap: WorldPad, clearance: number): boolean {
  const rad = (-ap.padAngleDeg * Math.PI) / 180;
  const dx = px - ap.x;
  const dy = py - ap.y;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  const hw = ap.pad.width * 0.5 + clearance;
  const hh = ap.pad.height * 0.5 + clearance;

  if (ap.pad.shape === 'Round') {
    const r = Math.max(ap.pad.width, ap.pad.height) * 0.5 + clearance;
    return lx * lx + ly * ly <= r * r;
  }
  if (ap.pad.shape === 'Oval') {
    return (lx * lx) / Math.max(1e-6, hw * hw) + (ly * ly) / Math.max(1e-6, hh * hh) <= 1.0;
  }
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
}

/** Checks whether thermal relief gap cutouts block a point around same-net pads. */
export function isBlockedByThermalRelief(
  px: number,
  py: number,
  pour: PcbCopperPour,
  thermalPads: WorldPad[],
  gridStep = 0.25
): boolean {
  if (pour.thermalType === 'Direct') return false;
  for (const tp of thermalPads) {
    const rad = (-tp.padAngleDeg * Math.PI) / 180;
    const dpx = px - tp.x;
    const dpy = py - tp.y;
    const lx = Math.abs(dpx * Math.cos(rad) - dpy * Math.sin(rad));
    const ly = Math.abs(dpx * Math.sin(rad) + dpy * Math.cos(rad));
    const padHalfW = tp.pad.width * 0.5;
    const padHalfH = tp.pad.height * 0.5;
    let inThermalZone = false;
    if (tp.pad.shape === 'Round') {
      const rPad = Math.max(padHalfW, padHalfH);
      const rDist = Math.hypot(lx, ly);
      inThermalZone = rDist < rPad + pour.thermalGap && rDist > rPad * 0.9;
    } else {
      const outerW = padHalfW + pour.thermalGap;
      const outerH = padHalfH + pour.thermalGap;
      inThermalZone = lx < outerW && ly < outerH && (lx > padHalfW * 0.9 || ly > padHalfH * 0.9);
    }
    if (inThermalZone) {
      if (pour.thermalType === 'None') return true;
      // Ensure spokes are never thinner than half the sampling grid step so they remain rasterizable
      const spokeHalf = Math.max(pour.thermalSpokeWidth * 0.5, gridStep * 0.6);
      const keepSpoke =
        pour.thermalType === '4Spoke' ? ly <= spokeHalf || lx <= spokeHalf : ly <= spokeHalf;
      if (!keepSpoke) return true;
    }
  }
  return false;
}
