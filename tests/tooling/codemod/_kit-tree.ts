// The codemod kit's fixture harness: a REAL temp tree + a real ts-morph Project + the real
// `runCodemod` harness, rooted OUTSIDE the repo so `test-layout`/`knip` never see the fixtures.
//
// Extracted from `index.int.test.ts` (which was its only caller) when the move-primitive pins
// (#1778/#1781) needed the same tree with the pre-emit diagnostics check ON — the one knob the
// inline copy hard-coded off.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { CodemodContext, CodemodResult, RunCodemodOptions } from "../../../tooling/src/codemod/index.ts";
import { runCodemod } from "../../../tooling/src/codemod/index.ts";

const TRAILING_NEWLINE_RE = /\n$/u;

/** Mirrors the repo's own resolution posture closely enough for the fixtures: bundler resolution
 *  plus `allowImportingTsExtensions`, so a fixture may spell its specifiers WITH the `.ts` the repo
 *  requires (that spelling is the subject of #1781) and still typecheck. */
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "es2022",
    module: "esnext",
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    strict: true,
    noEmit: true,
  },
});

export interface KitTreeHarness {
  readonly root: string;
  /** Run the codemod against this tree. Dry-run unless `apply` is set. Returns the result plus every
   *  line the harness printed — the preview IS the operator-visible surface. */
  readonly run: (
    codemod: (ctx: CodemodContext) => void,
    opts?: { readonly apply?: boolean; readonly replaceGlobs?: readonly string[] },
  ) => Promise<{ readonly result: CodemodResult; readonly output: string }>;
  /** Current on-disk text (to prove a refusal wrote nothing, or that an apply wrote the right bytes). */
  readonly read: (rel: string) => string;
}

export interface KitTreeOptions {
  /** Default true: the fixtures are deliberately tiny and sometimes mid-refactor, and the pre-emit
   *  check is a different guard whose noise would drown the preview-integrity signal. The move pins
   *  turn it ON on purpose — a stale phantom source file is only observable through it. */
  readonly skipDiagnosticsCheck?: boolean;
}

/** Materialize `files` into a fresh temp tree with a tsconfig, hand a harness to `fn`, then remove it. */
export async function withTree(files: Record<string, string>, fn: (h: KitTreeHarness) => Promise<void>, treeOpts: KitTreeOptions = {}): Promise<void> {
  // realpath: macOS/Linux tmpdir can be a symlink, and the kit's `absolutePath` repo-escape guard
  // compares resolved paths — an unresolved root makes every fixture path look like it escapes.
  const root = mkdtempSync(join(realpathSync(tmpdir()), "orb-codemod-kit-"));
  try {
    const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    if (initialized.status !== 0) {
      throw new Error(`could not initialize codemod fixture repository: ${initialized.stderr}`);
    }
    writeFileSync(join(root, "tsconfig.json"), TSCONFIG);
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const options: RunCodemodOptions = {
      // The kit no longer reads the global process.argv (#971): a caller states its own argv, and the
      // apply/dry-run decision rides `forceApply` per run below.
      argv: [],
      setup: { tsConfigFilePath: join(root, "tsconfig.json"), replaceGlobs: [`${root}/**/*.ts`, `${root}/**/*.tsx`] },
      repoRoot: root,
      skipDiagnosticsCheck: treeOpts.skipDiagnosticsCheck !== false,
      maxOutputLines: 10_000,
    };
    await fn({
      root,
      read: (rel) => readFileSync(join(root, rel), "utf-8"),
      async run(codemod, runOpts = {}) {
        const lines: string[] = [];
        // The kit's output door is _shared/artifacts print (process.stdout.write) + _shared/log warn
        // (process.stderr.write) since the P4 move — the capture spies the REAL sink, not console.
        const collect = (chunk: unknown): boolean => {
          lines.push(String(chunk).replace(TRAILING_NEWLINE_RE, ""));
          return true;
        };
        const out = vi.spyOn(process.stdout, "write").mockImplementation(collect as never);
        const err = vi.spyOn(process.stderr, "write").mockImplementation(collect as never);
        try {
          const result = await runCodemod("preview-integrity-fixture", codemod, {
            ...options,
            ...(runOpts.apply === true ? { forceApply: true } : {}),
            ...(runOpts.replaceGlobs !== undefined ? { setup: { ...options.setup, replaceGlobs: runOpts.replaceGlobs } } : {}),
          });
          return { result, output: lines.join("\n") };
        } finally {
          out.mockRestore();
          err.mockRestore();
        }
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
