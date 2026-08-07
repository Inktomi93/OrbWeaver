// Generator for docs/test-baseline/manifest.json — the committed manifest the monotonic-tests gate's
// tooth 2 reads (a listed test file that no longer exists on disk, and NOT accounted for in `deletions`,
// is RED: a spec can't be deleted to go green). Lists every REAL test-execution file under tests/
// (`.test.ts`/`.test.tsx`/`.ct.tsx`/`.spec.ts` — the suffixes vitest/Playwright actually collect as a
// runnable spec), sorted, repo-relative, posix.
//
// ADDING a test needs no manifest edit — an untracked new file is never gated (the gate only judges
// entries already IN `testFiles`). Run this script to fold new files into the floor; safe to run any time.
// DELETING a test file legitimately: add a `deletions` entry keyed by the file's path with a `why` string
// (the reason AND what would un-delete it, e.g. "merged into foo.test.ts — see PD-123") to the committed
// manifest, THEN re-run this script — it carries the ledger forward and drops the now-accounted path out
// of `testFiles`. A `deletions` entry whose file has RETURNED to the tree is itself flagged stale by the
// gate (delete the entry). Re-running this script never discards `deletions` — only editing the manifest
// by hand does.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

interface DeletionEntry {
  readonly why: string;
}

const root = process.cwd();
// TRACKED files only (git ls-files), never a raw disk glob: a gitignored vendored tree under tests/
// (the ST-parity runtime, 2026-08-07) once leaked ~49 of its OWN node_modules specs into the committed
// manifest — green on the one machine that had the dir, phantom-RED in every worktree. The repo's
// definition of "a real spec" is "a tracked file with a runner suffix". Consequence: a brand-new spec
// must be `git add`ed before a regen can fold it into the floor (it was never gated while untracked).
const SPEC_SUFFIX = /\.(test\.tsx?|ct\.tsx|spec\.ts)$/u;
const files = execFileSync("git", ["ls-files", "-z", "--", "tests"], { cwd: root, encoding: "utf-8" })
  .split("\0")
  .filter((f) => SPEC_SUFFIX.test(f))
  .map((f) => f.replaceAll("\\", "/"))
  .sort();

const out = join(root, "docs/test-baseline/manifest.json");
let deletions: Record<string, DeletionEntry> = {};
if (existsSync(out)) {
  try {
    const prev = JSON.parse(readFileSync(out, "utf-8")) as { deletions?: Record<string, DeletionEntry> };
    deletions = prev.deletions ?? {};
  } catch {
    // unparseable prior manifest — start the ledger fresh rather than fail the regen.
  }
}
// `testFiles` is a fresh disk listing, so a ledgered deletion drops out on its own (the glob can't find
// it); a `deletions` entry survives the regen untouched — if its file is back on disk, the gate's stale
// arm reads that off `testFiles` directly and reds.
const manifest = { testFiles: files, deletions };
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`wrote ${files.length} test files (${Object.keys(deletions).length} deletions ledgered) → ${out}\n`);
