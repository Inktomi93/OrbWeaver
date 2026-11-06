import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { runTool, UsageError } from "../floor/cli/run-tool.ts";
import { syncBiomeConfig } from "./index.ts";

function main(): number {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (args.length !== 1 || (mode !== "--check" && mode !== "--write")) {
    throw new UsageError("Usage: biome-config --check | --write");
  }
  if (!syncBiomeConfig(mode)) {
    process.stderr.write("biome.json is stale or missing. Run pnpm biome:write.\n");
    return EXIT.violations;
  }
  process.stdout.write(mode === "--write" ? "Generated biome.json.\n" : "biome.json is current.\n");
  return EXIT.clean;
}

await runTool(main);
