/** Browser-only timing seam for tests that must create a real long frame. Kept under support so the
 * determinism gate does not mistake an intentionally measured browser duration for application logic. */
export function blockMainThread(durationMs: number): void {
  const until = performance.now() + durationMs;
  while (performance.now() < until) {
    // The synchronous block is the behavior under test.
  }
}
