// Isolated qualification of the exact maintained plugin patch; installed dependencies are never changed.
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect } from "@orb/testkit/node/tool-fixtures.ts";
import type tseslint from "typescript-eslint";
import { runNicedSync } from "../../../../../tooling/src/floor/process/proc.ts";

/** Load only an invocation-owned package copy with the exact versioned patch. */
export function nativeFabricationPlugin(root: string, repoRoot: string): typeof tseslint.plugin {
  mkdirSync(root, { recursive: true });
  const require = createRequire(import.meta.url);
  const vendor = createRequire(require.resolve("typescript-eslint"));
  const packagePath = vendor.resolve("@typescript-eslint/eslint-plugin/package.json");
  expect(JSON.parse(readFileSync(packagePath, "utf8"))).toMatchObject({ version: "8.70.1" });
  const candidate = join(root, "plugin");
  cpSync(dirname(packagePath), candidate, { recursive: true });
  rmSync(join(candidate, "node_modules"), { recursive: true, force: true });
  symlinkSync(resolve(dirname(packagePath), "../.."), join(candidate, "node_modules"), "dir");
  const patch = join(repoRoot, "patches/@typescript-eslint__eslint-plugin@8.70.1.patch");
  const applied = runNicedSync("git", ["apply", "--reverse", "--check", patch], { cwd: candidate });
  if (applied.status !== 0) {
    const result = runNicedSync("git", ["apply", patch], { cwd: candidate });
    if (result.status !== 0) {
      throw new Error(`native plugin candidate patch refused: ${result.stderr}`);
    }
  }
  return require(join(candidate, "dist/index.js"));
}
