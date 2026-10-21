// A library cannot restart its caller; configured limits and the unconfigured safety floor are distinct.

import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { inheritedProcessEnv, withProcessEnv } from "@orb/tooling/floor/process/process-env";
import { describe } from "vitest";
import { assertHeapFloor, CODEMOD_RUN_SPELLING, WORKSPACE_HEAP_FLOOR_MB } from "../../../../tooling/src/codemod/lib/heap-floor.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BYTES_PER_MIB = 1_048_576;
const repoRoot = process.cwd();

describe("assertHeapFloor", () => {
  test("refuses an unconfigured process below the floor and names the sanctioned spelling", async () => {
    await withProcessEnv("NODE_OPTIONS", "", () => {
      expect(() => assertHeapFloor(() => 4192 * BYTES_PER_MIB)).toThrow(CODEMOD_RUN_SPELLING);
      expect(() => assertHeapFloor(() => 4192 * BYTES_PER_MIB)).toThrow("4192 MiB");
      return Promise.resolve();
    });
  });

  test("an unconfigured process already at the workspace floor is accepted", async () => {
    await withProcessEnv("NODE_OPTIONS", "", () => {
      expect(() => assertHeapFloor(() => WORKSPACE_HEAP_FLOOR_MB * BYTES_PER_MIB)).not.toThrow();
      return Promise.resolve();
    });
  });

  test("the floor constant is the one pnpm-workspace.yaml states", () => {
    // COUPLED SITE. If someone raises the workspace `nodeOptions`, the kit's refusal must move with it.
    const workspace = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf-8");
    const declared = /--max-old-space-size=(\d+)/u.exec(workspace);
    expect(declared?.[1]).toBe(String(WORKSPACE_HEAP_FLOOR_MB));
  });
});

describe("the operator surface: runCodemod refuses a floorless process", () => {
  /** A minimal real codemod tree: a tsconfig, one source file, and a script that calls runCodemod. */
  function withScriptTree(fn: (paths: { readonly root: string; readonly script: string }) => void): void {
    const root = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-heap-"));
    try {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true, types: [] },
          files: ["src/a.ts"],
        }),
      );
      writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
      const script = join(root, "probe.mjs");
      writeFileSync(
        script,
        `import { runCodemod } from ${JSON.stringify(join(repoRoot, "tooling/src/codemod/index.ts"))};\n` +
          `await runCodemod("heap-floor-probe", () => {}, { argv: [], setup: { replaceGlobs: [${JSON.stringify(`${root}/src/**/*.ts`)}] } });\n`,
      );
      execFixtureGit(root, ["init", "--quiet", "--template="]);
      execFixtureGit(root, ["add", "."]);
      fn({ root, script });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("an unconfigured node refuses; explicit lower and workspace limits both complete", () => {
    withScriptTree(({ root, script }) => {
      const spawnAt = (heapMb?: number): SpawnSyncReturns<string> =>
        spawnSync(process.execPath, [...(heapMb === undefined ? [] : [`--max-old-space-size=${heapMb}`]), script], {
          cwd: root,
          encoding: "utf8",
          env: inheritedProcessEnv({ ["NODE_OPTIONS"]: "", ["PNPM_CONFIG_NODE_OPTIONS"]: "" }),
          timeout: scaledBudget(120_000),
        });

      const refused = spawnAt();
      expect(refused.status).not.toBe(0);
      expect(`${refused.stderr}${refused.stdout}`).toContain(CODEMOD_RUN_SPELLING);

      const explicit = spawnAt(WORKSPACE_HEAP_FLOOR_MB / 2);
      expect(explicit.status, `${explicit.stderr}${explicit.stdout}`).toBe(0);
      const allowed = spawnAt(WORKSPACE_HEAP_FLOOR_MB);
      expect(`${allowed.stderr}${allowed.stdout}`).not.toContain(CODEMOD_RUN_SPELLING);
      expect(allowed.status).toBe(0);
    });
  });
});
