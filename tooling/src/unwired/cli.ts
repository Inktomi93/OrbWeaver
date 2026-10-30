// unwired: the type-aware scan for members no production code reaches. Argv and dispatch only; the surface is ./index.ts.
import process from "node:process";
import { runTool } from "../floor/cli/run-tool.ts";
import { runUnwired } from "./index.ts";

await runTool(async () => await runUnwired(process.argv.slice(2)));
