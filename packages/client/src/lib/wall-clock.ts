// The client's one wall clock, in epoch ms. The dev rings, the bug-report capture and the browser-constructed
// clients that have no injection seam all stamp with it, so their instants compare on one clock.

/** The current wall-clock instant in epoch ms. */
export function wallClockMs(): number {
  return performance.timeOrigin + performance.now();
}
