// ui-facts: argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { runUiFacts } from "./index.ts";

await runTool(() => runUiFacts(process.argv.slice(2)));
