/** Creates an actual browser long frame; a frozen clock cannot bound a synchronous main-thread block. */
export function blockMainThread(durationMs: number): void {
  // @orb-waive test-determinism(performance.now): The browser stimulus must start a real elapsed-time block; remove with the long-frame stimulus.
  const until = performance.now() + durationMs;
  // @orb-waive test-determinism(performance.now): Only actual elapsed time can end this synchronous browser block; remove with the long-frame stimulus.
  while (performance.now() < until) {
    // The synchronous block is the behavior under test.
  }
}
