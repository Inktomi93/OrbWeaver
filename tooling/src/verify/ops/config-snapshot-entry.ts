// Private process boundary for synchronous config readers and ESLint's discovery-only filename pass.
// Keep this entry narrow: routing through the public verify CLI eagerly loads every verify operation.

import process from "node:process";
import { runTool } from "../../floor/cli/run-tool.ts";
import { runConfigSnapshot } from "./config-snapshot.ts";
import { runEslintDiscovery } from "./eslint-discovery.ts";

await runTool(async () => {
  const args = process.argv.slice(2);
  if (args[0] === "eslint-discovery") {
    return await runEslintDiscovery(process.cwd(), args.length === 1 ? undefined : args.slice(1));
  }
  return await runConfigSnapshot(process.cwd(), args);
});
