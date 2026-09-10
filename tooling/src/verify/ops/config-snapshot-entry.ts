// Private process boundary for synchronous config readers and ESLint's discovery-only filename pass.
// Keep this entry narrow: routing through the public verify CLI eagerly loads every verify operation.
import process from "node:process";
import { runTool } from "../../_shared/run-tool.ts";
import { runConfigSnapshot } from "./config-snapshot.ts";
import { runEslintDiscovery } from "./eslint-discovery.ts";

await runTool(async () => {
  const args = process.argv.slice(2);
  return args[0] === "eslint-discovery" && args.length === 1 ? await runEslintDiscovery(process.cwd()) : await runConfigSnapshot(process.cwd(), args);
});
