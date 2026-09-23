// The spawn target `stack.sh` execs for every PROD invocation (and for the two internal verbs `classify`
// and `debug-env`, which both modes route through). It is a plain entry, not a `cli.ts`: `stack` is a
// BASH-FRONTED tool (docs/law/Core-Tooling-Law.md §4.1 BASH_FRONTED_TOOLS), so stack.sh is the argv
// front door and this file is the node half it calls.
//
// It still enters through `runTool` — crash ≠ verdict, pipe-drain, never-downgrade apply to a launcher at
// least as much as to a checker (a mid-boot throw here used to read as exit 1, i.e. "refused").
import process from "node:process";
import { runTool } from "../../_shared/run-tool.ts";
import { runStackProd } from "./prod.ts";

await runTool(async () => await runStackProd(process.argv.slice(2)));
