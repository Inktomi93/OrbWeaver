import process from "node:process";
import { fileURLToPath } from "node:url";
import { runTool, UsageError } from "../floor/cli/run-tool.ts";
import { buildRouterDeclarations } from "./index.ts";

await runTool(() => {
  if (process.argv.length > 2) {
    throw new UsageError("usage: pnpm build:router-types (no arguments)");
  }
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const declarations = buildRouterDeclarations(root);
  process.stdout.write(`router-types: emitted ${String(declarations)} native server declarations\n`);
  return 0;
});
