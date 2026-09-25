// The ordered boot's one decision: the server answers `/healthz` before vite starts, so a client that
// answers means the whole stack answers. Counted in polls, never read off a wall clock.
import type { ServerBootOutcome } from "../contract/types.ts";

/** Quiet-box ceiling for the server's `/healthz` gate, sized for a boot that may include a model cold-load;
 *  a warm boot never reaches it. Load-scaled by the caller through the one budget policy. */
export const SERVER_HEALTHZ_BASE_MS = 900_000;
export const HEALTHZ_POLL_MS = 500;

/** Wait for the server to answer, exit, or exhaust the ceiling. Every probe is injected, so a test drives
 *  all three outcomes without a socket. */
export async function awaitServerReady(opts: {
  readonly healthy: () => Promise<boolean>;
  readonly exited: () => boolean;
  readonly ceilingMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly pollMs?: number;
}): Promise<ServerBootOutcome> {
  const pollMs = opts.pollMs ?? HEALTHZ_POLL_MS;
  const polls = Math.max(1, Math.ceil(opts.ceilingMs / pollMs));
  for (let poll = 0; poll < polls; poll += 1) {
    if (opts.exited()) {
      return "exited";
    }
    if (await opts.healthy()) {
      return "ready";
    }
    await opts.sleep(pollMs);
  }
  return opts.exited() ? "exited" : "timeout";
}
