import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Mutable fixture code never shares an inode with the authored implementation or installed dependencies. */
export function copyNativeInventoryImplementation(scratch: string, repoRoot: string): string {
  const implementation = join(scratch, "implementation");
  const source = fileURLToPath(new URL("../../../../tooling/src", import.meta.url));
  const owner = dirname(dirname(source));
  mkdirSync(join(implementation, "tooling"), { recursive: true });
  cpSync(source, join(implementation, "tooling/src"), { recursive: true });
  cpSync(join(owner, "tooling/package.json"), join(implementation, "tooling/package.json"));
  cpSync(join(owner, "pnpm-lock.yaml"), join(implementation, "pnpm-lock.yaml"));
  writeFileSync(join(implementation, "package.json"), JSON.stringify({ type: "module" }));
  symlinkSync(join(repoRoot, "node_modules"), join(implementation, "node_modules"), "dir");
  symlinkSync(join(repoRoot, "tooling/node_modules"), join(implementation, "tooling/node_modules"), "dir");
  return implementation;
}

/** Loading the factory module in a worker must not stand in for its parent's conditional execution dependencies. */
export function plantNativeControllerDependency(implementation: string, helper: string): void {
  const factory = join(implementation, "tooling/src/floor/code-facts/semantic-inventory.ts");
  const signature = "export function createSemanticInventory(rawOptions: SemanticInventoryOptions): SemanticInventory {";
  const original = readFileSync(factory, "utf8");
  if (original.split(signature).length !== 2) {
    throw new Error("native controller fixture entry differs from its maintained factory");
  }
  writeFileSync(
    factory,
    `import {createRequire as fixtureRequire} from 'node:module';\n${original.replace(
      signature,
      `${signature}\nif(fixtureRequire(import.meta.url)(${JSON.stringify(helper)})!==1) throw new Error('controller fixture execution');`,
    )}`,
  );
}
