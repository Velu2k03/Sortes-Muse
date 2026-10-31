// Ziwei ring geometry, pure functions, no DOM. Testable in Node.
// Ring order is iztro's palace array order, clockwise from the top.
// This is a modern circle reading of the same 12 palaces, not the
// traditional 4x4 square layout; the detail panel below the ring keeps
// every palace field readable, so the ring never has to carry it all.
export const RING_CENTRE = 360;
export const RING_OUTER = 340;
export const RING_INNER = 150;

export function polar(cx: number, cy: number, radius: number, clockDeg: number): { x: number; y: number } {
  const rad = (clockDeg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

export function sectorStart(index: number): number {
  return index * 30;
}

export function sectorEnd(index: number): number {
  return index * 30 + 30;
}

export function wedgePath(cx: number, cy: number, inner: number, outer: number, startDeg: number, endDeg: number): string {
  const os = polar(cx, cy, outer, startDeg);
  const oe = polar(cx, cy, outer, endDeg);
  const ie = polar(cx, cy, inner, endDeg);
  const is = polar(cx, cy, inner, startDeg);
  const f = (n: number) => n.toFixed(2);
  return `M ${f(os.x)} ${f(os.y)} A ${outer} ${outer} 0 0 1 ${f(oe.x)} ${f(oe.y)} L ${f(ie.x)} ${f(ie.y)} A ${inner} ${inner} 0 0 0 ${f(is.x)} ${f(is.y)} Z`;
}
