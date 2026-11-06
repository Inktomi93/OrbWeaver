// migrate-owner: argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { runMigrateOwner } from "./index.ts";

await runTool(() => runMigrateOwner(process.argv.slice(2)));
