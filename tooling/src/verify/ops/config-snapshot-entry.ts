// Private process boundary for synchronous config readers. Keep this entry narrow: routing through the
// public verify CLI eagerly loads every verify operation before the native config loader can start.
import process from "node:process";
import { runTool } from "../../_shared/run-tool.ts";
import { runConfigSnapshot } from "./config-snapshot.ts";

await runTool(async () => await runConfigSnapshot(process.cwd(), process.argv.slice(2)));
