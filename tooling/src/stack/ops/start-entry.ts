// The spawn target the root `start` script runs — `pnpm start`. It is a plain entry, not a `cli.ts`:
// `stack` is a BASH-FRONTED tool (docs/architecture/core/Core-Tooling-Law.md §4.1 BASH_FRONTED_TOOLS) and
// owns no argv door of its own, so this file is the front door for the one verb a non-Linux operator can
// actually run. It is deliberately NOT reached through stack.sh — the whole point is that no bash, no
// setsid and no `ss` stand between a stranger and the app (reviewed grant
// `tooling-argv-front-door:stack-start-entry`).
//
// It enters through `runTool` like every other program here — crash ≠ verdict, pipe-drain,
// never-downgrade. The one twist a launcher adds: `runStart` may return 128+signal (Ctrl-C ⇒ 130), so a
// caller reading `$?` sees exactly what a bare `node <entry>.ts` would have reported.
import process from "node:process";
import { runTool } from "../../_shared/run-tool.ts";
import { runStart } from "./start.ts";

await runTool(async () => await runStart(process.argv.slice(2)));
