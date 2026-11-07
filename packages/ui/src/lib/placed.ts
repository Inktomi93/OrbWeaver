/**
 * A box laid out of flow over its positioned host, by what it is: `startRail` is a mark that runs the host's height a `row` step outside its start edge,
 * `footBand` a band across the host's foot that leaves a `block` step under it, and `cornerStart` a mark in the host's block-start, inline-start corner.
 */
export const PLACED = {
  startRail: "absolute inset-y-tight -inset-s-row",
  footBand: "absolute inset-x-0 inset-be-block",
  cornerStart: "absolute inset-s-tight inset-bs-tight",
} as const;
