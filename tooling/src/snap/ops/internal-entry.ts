// The internal-flag dispatch cli.ts carves out to stay under its own cap (Core-Tooling-Law.md §4.3):
// `--session-daemon` and `--stage-keeper` are snap's OWN re-exec of itself as a detached child (the
// per-session daemon; the band idle timer, #1163 arm b) — neither opens a run slot, neither touches the
// help/misuse/argv-error legs, and both must resolve BEFORE the ordinary stage/slot machinery so a
// daemon boot never waits on a browser it will never launch.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";
import { runSessionDaemon } from "./session-daemon.ts";
import { runStageKeeper } from "./stage-keeper.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session-daemon <name> | pnpm snap --stage-keeper <band>");

/** The exit code for an internal-entry flag, or `null` when `opts` names neither — the caller falls
 *  through to the ordinary CLI legs. */
export async function runInternalEntry(opts: Args, argv: readonly string[]): Promise<number | null> {
  if (opts.sessionDaemon !== null) {
    return await runSessionDaemon(opts, argv);
  }
  if (opts.stageKeeper !== null) {
    return await runStageKeeper(opts.stageKeeper);
  }
  return null;
}
