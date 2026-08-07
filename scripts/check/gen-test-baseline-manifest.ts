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
import { existsSync, globSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

interface DeletionEntry {
  readonly why: string;
}

const root = process.cwd();
const files = globSync(["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.ct.tsx", "tests/**/*.spec.ts"], {
  cwd: root,
  // A vendored/captured third-party tree under tests/ ships its OWN specs — never ours to protect, and
  // baselining them makes the gate hostage to a foreign install's presence. (The ST-parity rig's captured
  // SillyTavern runtime put 49 `@jimp`/`comment-parser`/`openai` specs into this floor before it moved
  // out to scripts/probes/st-goldens; the same trap awaits any future vendored fixture.) Mirrors
  // scripts/verify/tests-execution-membership.ts's identical skip.
  // NOTE — node's `globSync` hands `exclude` a repo-relative PATH STRING, never a Dirent: an
  // `(f) => f.name === "node_modules"` predicate is `undefined === "node_modules"`, i.e. a silent
  // no-op that excludes nothing. Verified with a planted `tests/**/node_modules/**/*.test.ts`.
  exclude: (p) => p.split("/").includes("node_modules"),
})
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
