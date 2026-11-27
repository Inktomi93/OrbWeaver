// A warm `--dirty` stage runs its server under `node --watch`, so a re-sync that changes a watched source file
// restarts the server while the caller is already navigating: the stage's vite answers every /api read with 502
// until the new process listens. The decision of whether a re-sync restarts the server, and the wait for the new
// process, are pure over injected probes so a test drives every outcome without a box.
import { relative } from "node:path";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** Quiet-box time the watcher gets to notice a change and take the old process down before the re-sync is judged not to have restarted anything. */
export const RESTART_DETECT_BASE_MS = 5000;
/** How often the wait reads the server port's owner. */
export const RESTART_POLL_MS = 250;

/** What the wait saw: a new process listening, no restart started, or no new process within the ceiling. */
const SERVER_RESTARTS = ["restarted", "unchanged", "timeout"] as const;
type ServerRestart = (typeof SERVER_RESTARTS)[number];

/** Whether any re-synced path sits under a directory the server's `node --watch` watches. `changed` is relative to `root`;
 *  `watchRoots` are absolute, from the same plan `pnpm dev` spawns the watcher with. */
export function changesRestartServer(root: string, changed: readonly string[], watchRoots: readonly string[]): boolean {
  const relativeRoots = watchRoots.map((watchRoot) => `${relative(root, watchRoot)}/`);
  return changed.some((path) => relativeRoots.some((watchRoot) => path.startsWith(watchRoot)));
}

/** The probes one wait reads. `serverPid` is the process listening on the stage's server port, or null when none is. */
export interface RestartProbe {
  readonly serverPid: () => number | null;
  readonly sleep: (ms: number) => void;
}

/** Wait for the restart a re-sync caused. `before` is the listener's pid read before the sync.
 *
 *  Phase one watches for the old process going away (no listener, or another pid): a watcher that never fires
 *  leaves the same pid in place for `detectMs`, and that is `unchanged`. Phase two waits up to `bootMs` for a listener
 *  that is not `before`. A stage whose server was down before the sync skips phase one. Counted in polls, never read
 *  off a wall clock. */
export function awaitServerRestart(input: {
  readonly before: number | null;
  readonly probe: RestartProbe;
  readonly detectMs: number;
  readonly bootMs: number;
}): ServerRestart {
  const { before, probe } = input;
  const polls = (ms: number): number => Math.max(1, Math.ceil(ms / RESTART_POLL_MS));
  let down = before === null;
  for (let poll = 0; !down && poll < polls(input.detectMs); poll += 1) {
    const pid = probe.serverPid();
    down = pid !== before;
    if (!down) {
      probe.sleep(RESTART_POLL_MS);
    }
  }
  if (!down) {
    return "unchanged";
  }
  for (let poll = 0; poll < polls(input.bootMs); poll += 1) {
    const pid = probe.serverPid();
    if (pid !== null && pid !== before) {
      return "restarted";
    }
    probe.sleep(RESTART_POLL_MS);
  }
  return "timeout";
}
