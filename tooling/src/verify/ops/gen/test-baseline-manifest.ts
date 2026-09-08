// Generator for docs/test-baseline/manifest.json — the committed manifest the monotonic-tests gate's
// tooth 2 reads (a listed test file that no longer exists on disk, and NOT accounted for in `deletions`,
// is RED: a spec can't be deleted to go green). Lists every REAL test-execution file under tests/
// (runtime kinds from the shared test registry), plus previous members whose removal has not been
// accounted for. Type-only tests are checked by their compiler program, outside this execution floor.
//
// ADDING a test needs no edit BY HAND, but it does need a REGEN (#817, 2026-08-30): the `ledgers:fresh`
// stage compares the committed file against a fresh derivation on every `pnpm check`, so a tracked spec
// missing from `testFiles` is now RED instead of a silent lag. The motion is `git add <spec>` (the
// derivation reads `git ls-files`, so an untracked spec is invisible to it), then this script, then commit.
// The monotonic-tests GATE is unchanged — it still only judges entries already IN `testFiles`.
// DELETING a test file legitimately: add a `deletions` entry keyed by the file's path with a `why` string
// (the reason AND what would un-delete it, e.g. "merged into foo.test.ts — see PD-123") to the committed
// manifest, THEN re-run this script — it carries the ledger forward and drops the now-accounted path out
// of `testFiles`. A `deletions` entry whose file has RETURNED to the tree is itself flagged stale by the
// gate (delete the entry). Re-running this script never discards `deletions` — only editing the manifest
// by hand does.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execNicedSync } from "@orb/tooling/_shared/proc";
import { RUNTIME_TEST_SUFFIXES } from "@orb/tooling/_shared/test-kinds";
import type { TestBaselineDeletion, TestBaselineManifest } from "../../contract/test-baseline.ts";
import { TEST_BASELINE_REL } from "../../contract/test-baseline.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline test-baseline-manifest");

/** Re-derive the whole manifest from the tree. ONE producer, TWO callers — the writer below and the
 *  `ledgers:fresh` stage's `--check` arm (ops/ledgers-fresh.ts), so the committed file and the freshness
 *  verdict can never disagree about what a spec is. Writes NOTHING. */
export function deriveTestBaselineManifest(root: string): TestBaselineManifest {
  // TRACKED files only (git ls-files), never a raw disk glob: a gitignored vendored tree under tests/
  // (the ST-parity runtime, 2026-08-07) once leaked ~49 of its OWN node_modules specs into the committed
  // manifest — green on the one machine that had the dir, phantom-RED in every worktree. The repo's
  // definition of "a real spec" is "a tracked file with a runner suffix". Consequence: a brand-new spec
  // must be `git add`ed before a regen can fold it into the floor (it was never gated while untracked).
  // (Two lanes fixed this concurrently; the losing arm — fs.globSync + an exclude predicate — carried its
  // own trap worth keeping: node's globSync hands `exclude` a PATH STRING, never a Dirent, so an
  // `(f) => f.name === "node_modules"` predicate is a silent no-op. ls-files sidesteps the class.)
  const files = new Set(
    execNicedSync("git", ["ls-files", "-z", "--", "tests"], { cwd: root })
      .split("\0")
      .filter((f) => RUNTIME_TEST_SUFFIXES.some((suffix) => f.endsWith(suffix)))
      .map((f) => f.replaceAll("\\", "/")),
  );

  const out = join(root, TEST_BASELINE_REL);
  let deletions: Record<string, TestBaselineDeletion> = {};
  if (existsSync(out)) {
    const prev = JSON.parse(readFileSync(out, "utf-8")) as Partial<TestBaselineManifest>;
    deletions = prev.deletions ?? {};
    for (const path of prev.testFiles ?? []) {
      const why = deletions[path]?.why;
      if (typeof why !== "string" || why.trim().length === 0) {
        files.add(path);
      }
    }
  }
  // Preserve unaccounted removals so regeneration cannot erase the monotonic gate's evidence. A returned
  // file joins the tracked set even if its deletion record survives; the gate then reports that record stale.
  return { testFiles: [...files].sort(), deletions };
}

/** The `baseline test-baseline-manifest` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateTestBaselineManifest(root: string): number {
  const manifest = deriveTestBaselineManifest(root);
  const out = join(root, TEST_BASELINE_REL);
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`wrote ${manifest.testFiles.length} test files (${Object.keys(manifest.deletions).length} deletions ledgered) → ${out}\n`);
  return EXIT.clean;
}
