// biome-ignore-all lint/style/useNamingConvention: the example routes EXPORTED SYMBOL NAMES (routeSymbolsByMap's contract) — its map keys are identifiers, not prose properties.
// The kit's author conveniences (§16) + the example codemod (§17), exported through the front door so
// the toolkit's TS compilation guards them against bit-rot. Split from scripts/codemods/codemod-kit.ts
// (P4 of #393).

import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { sep } from "node:path";
import process from "node:process";
import type { CodemodContext, CodemodResult, OperationOptions, Plan } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import { addReExport } from "./exports.ts";
import { deleteFiles, moveFiles } from "./files.ts";
import { repointAliasPaths, routeSymbolsByMap } from "./imports.ts";
import { absolutePath, assert, repoRelative } from "./plans.ts";
import { runCodemod } from "./run.ts";

/**
 * The example codemod — a snippet demonstrating composition, exported so the toolkit's TS compilation
 * guards it against bit-rot. Don't actually run this. Real codemods live as their own files under
 * `tooling/src/codemod/ops/` (one-shot research codemods may draft in `scripts/`).
 *
 * Usage of the example would be:
 *   await exampleRestructureCodemod();
 */
export function exampleRestructureCodemod(): Promise<CodemodResult> {
  return runCodemod("example-restructure", (ctx) => {
    // 1. Move some files. ts-morph auto-rewrites relative specifiers.
    ctx.plan(
      moveFiles(ctx, [
        ["src/foo.ts", "src/feature/foo.ts"],
        ["src/foo.test.ts", "src/feature/foo.test.ts"],
      ]),
    );

    // 2. Sweep alias paths ts-morph couldn't follow.
    ctx.plan(repointAliasPaths(ctx, [[/#server\/foo/gu, "#server/feature/foo"]]));

    // 3. Route a split: types.ts has 3 symbols going to 3 new files.
    ctx.plan(
      routeSymbolsByMap(ctx, "#server/feature/foo", {
        FooDetail: "#server/feature/contract/foo-detail",
        FooParams: "#server/feature/contract/foo-params",
        FooError: "#server/feature/contract/foo-error",
      }),
    );

    // 4. Add a re-export to the new front door.
    ctx.plan(
      addReExport(ctx, "src/feature/index.ts", {
        moduleSpecifier: "./contract/foo-detail",
        name: "FooDetail",
        isTypeOnly: true,
      }),
    );

    // 5. Delete the now-empty old file. Note `confirm: true` is required.
    ctx.plan(deleteFiles(ctx, ["src/feature/foo.ts"], { confirm: true, note: "after symbol routing" }));

    ctx.log("All 5 phases queued. Run with --apply to commit.");
  });
}

// ── Bonus: bare-bones argv/env helpers some codemods want ────────────────────

/** Get a named flag value from argv, e.g. `--threshold=0.5` → `"0.5"`. */
export function getFlag(name: string, argv: readonly string[] = process.argv.slice(2)): string | undefined {
  const prefix = `--${name}=`;
  const match = argv.find((a) => a.startsWith(prefix));
  return match?.slice(prefix.length);
}

/** Read a file from disk (NOT through ts-morph). Pure convenience so a
 *  codemod can peek at a JSON config without bringing in fs/promises etc. */
export function readFileText(filePath: string, repoRoot = process.cwd()): string {
  const abs = absolutePath(filePath, repoRoot);
  assert(existsSync(abs), `readFileText: file does not exist: ${repoRelative(abs, repoRoot)}`);
  return readFileSync(abs, "utf-8");
}

/** Check that `dir` exists and is a directory. Doesn't create it. */
export function assertDirectoryExists(dir: string, repoRoot = process.cwd()): void {
  const abs = absolutePath(dir, repoRoot);
  assert(existsSync(abs), `Directory does not exist: ${repoRelative(abs, repoRoot)}`);
  const st = statSync(abs);
  assert(st.isDirectory(), `Path exists but is not a directory: ${repoRelative(abs, repoRoot)}`);
}

/** Helper to `rm -rf` a directory after a codemod that moves everything out
 *  of it (covers the "remove the now-empty substrate/" pattern). Refuses
 *  unless `confirm: true` and the directory is empty after the moves
 *  finished (so we can't accidentally delete a populated dir). */
export function removeEmptyDirectory(ctx: CodemodContext, dir: string, opts: OperationOptions & { confirm: true }): Plan {
  assert(opts.confirm === true, "removeEmptyDirectory requires { confirm: true }");
  const abs = absolutePath(dir, ctx.repoRoot);
  return {
    description: `Remove empty directory ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [],
    transform(innerCtx): void {
      if (innerCtx.isDryRun) {
        return;
      } // we don't simulate fs ops in dry-run
      if (!existsSync(abs)) {
        return;
      }
      // ts-morph still tracks the directory inside the project; verify no
      // source files reside under it.
      for (const sf of innerCtx.project.getSourceFiles()) {
        if (sf.getFilePath().startsWith(`${abs}${sep}`)) {
          throw new CodemodError(
            `removeEmptyDirectory: ${repoRelative(abs, ctx.repoRoot)} still contains ${sf.getFilePath()}`,
            "Make sure all moveFiles plans have run before scheduling the directory removal.",
          );
        }
      }
      rmSync(abs, { recursive: true, force: true });
    },
  };
}
