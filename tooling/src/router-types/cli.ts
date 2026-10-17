import "../floor/compiler/semantic-inventory-runtime.ts";
import process from "node:process";
import { fileURLToPath } from "node:url";

const { runTool, UsageError } = await import("../floor/cli/run-tool.ts");
const { buildRouterDeclarations } = await import("./index.ts");

await runTool(async () => {
  if (process.argv.length > 2) {
    throw new UsageError("usage: pnpm build:router-types (no arguments)");
  }
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const declarations = await buildRouterDeclarations(root, [import.meta.url]);
  process.stdout.write(`router-types: emitted ${String(declarations)} native server declarations\n`);
  return 0;
});
