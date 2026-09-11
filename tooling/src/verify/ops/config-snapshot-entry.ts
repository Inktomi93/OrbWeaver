// Private process boundary for synchronous config readers and ESLint's discovery-only filename pass.
// Keep this entry narrow: routing through the public verify CLI eagerly loads every verify operation.

import { readFileSync } from "node:fs";
import process from "node:process";
import { runTool } from "../../_shared/run-tool.ts";
import { runConfigSnapshot } from "./config-snapshot.ts";
import { runEslintDiscovery } from "./eslint-discovery.ts";

const PRIVATE_REQUEST_ARGC = 4;

await runTool(async () => {
  const args = process.argv.slice(2);
  if (args[0] === "eslint-discovery" && args.length === 1) {
    return await runEslintDiscovery(process.cwd());
  }
  const marker = args[2];
  if (marker === undefined) {
    return await runConfigSnapshot(process.cwd(), args);
  }
  if (args[0] !== "eslint" || marker !== "--eslint-population" || args[3] === undefined || args.length !== PRIVATE_REQUEST_ARGC) {
    throw new Error("config-snapshot private population manifest is valid only for ESLint");
  }
  const population: unknown = JSON.parse(readFileSync(args[3], "utf8"));
  if (!(Array.isArray(population) && population.every((path): path is string => typeof path === "string"))) {
    throw new Error("config-snapshot ESLint population manifest must be a string array");
  }
  return await runConfigSnapshot(process.cwd(), args.slice(0, 2), population);
});
