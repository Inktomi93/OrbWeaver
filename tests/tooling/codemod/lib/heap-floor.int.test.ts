// The codemod kit's heap-floor refusal (#1775).
//
// The defect: `pnpm codemod recipes` printed `node scripts/codemods/<name>.ts` as the one-shot
// spelling. A bare `node` carries NO heap floor — `pnpm-workspace.yaml`'s
// `nodeOptions: --max-old-space-size=16384` reaches `pnpm run` / `pnpm exec` children only — so a
// whole-project ts-morph run died at node's ~4GB self-cap six minutes in, with a V8 abort (exit 134)
// for an error message. A loud refusal at second zero beats that.
//
// Asserted through the operator surface: a REAL codemod script spawned under a below-floor heap exits
// non-zero naming the sanctioned spelling, and the SAME script at the floor runs clean (the positive
// control — without it "it refused" would be indistinguishable from "it is broken").

import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe } from "vitest";
import { assertHeapFloor, CODEMOD_RUN_SPELLING, WORKSPACE_HEAP_FLOOR_MB } from "../../../../tooling/src/codemod/lib/heap-floor.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BYTES_PER_MIB = 1_048_576;
const repoRoot = process.cwd();

describe("assertHeapFloor", () => {
  test("refuses below the floor and names the sanctioned spelling", () => {
    expect(() => {
      assertHeapFloor(() => 4192 * BYTES_PER_MIB);
    }).toThrow(CODEMOD_RUN_SPELLING);
    expect(() => {
      assertHeapFloor(() => 4192 * BYTES_PER_MIB);
    }).toThrow("4192 MiB");
  });

  test("passes AT the floor and above it — the refusal is a threshold, not a blanket", () => {
    expect(() => {
      assertHeapFloor(() => WORKSPACE_HEAP_FLOOR_MB * BYTES_PER_MIB);
    }).not.toThrow();
    // What `--max-old-space-size=16384` actually reports (measured): the young generation rides on top.
    expect(() => {
      assertHeapFloor(() => 16_480 * BYTES_PER_MIB);
    }).not.toThrow();
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
        JSON.stringify({ compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler", strict: true, noEmit: true } }),
      );
      writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
      const script = join(root, "probe.ts");
      writeFileSync(
        script,
        `import { runCodemod } from ${JSON.stringify(join(repoRoot, "tooling/src/codemod/index.ts"))};\n` +
          `await runCodemod("heap-floor-probe", () => {}, { argv: [], setup: { replaceGlobs: [${JSON.stringify(`${root}/src/**/*.ts`)}] } });\n`,
      );
      fn({ root, script });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("a floorless node refuses immediately; the same script at the floor completes", () => {
    // The heap ceiling is set on the COMMAND LINE, not through the env: a `--max-old-space-size` flag
    // overrides an inherited NODE_OPTIONS, so this arm is deterministic whether or not the suite itself
    // was started under the workspace floor (and it needs no env plumbing to say so).
    withScriptTree(({ root, script }) => {
      const spawnAt = (heapMb: number): SpawnSyncReturns<string> =>
        spawnSync("node", [`--max-old-space-size=${heapMb}`, script], { cwd: root, encoding: "utf8", timeout: scaledBudget(120_000) });

      const refused = spawnAt(WORKSPACE_HEAP_FLOOR_MB / 4);
      expect(refused.status).not.toBe(0);
      expect(`${refused.stderr}${refused.stdout}`).toContain(CODEMOD_RUN_SPELLING);

      // POSITIVE CONTROL: without it, "the script exited non-zero" would not distinguish the refusal
      // from a broken probe script.
      const allowed = spawnAt(WORKSPACE_HEAP_FLOOR_MB);
      expect(`${allowed.stderr}${allowed.stdout}`).not.toContain(CODEMOD_RUN_SPELLING);
      expect(allowed.status).toBe(0);
    });
  });
});
