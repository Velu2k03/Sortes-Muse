// Chart interpretation pricing, pure and testable. One rule, no I/O:
// first chart per system free, then 1 credit per full chart reading.
// The free flag itself lives in localStorage (see storage.ts
// chartFreeUsed / markChartFreeUsed, same pattern as tarot's
// freeReadingUsed); this file only decides the cost from that flag, so
// the rule is asserted in scripts/charts-check.mjs and cannot drift
// silently between the page label and the spend call.
export function chartInterpretationCost(freeAlreadyUsed: boolean): 0 | 1 {
  return freeAlreadyUsed ? 1 : 0;
}
