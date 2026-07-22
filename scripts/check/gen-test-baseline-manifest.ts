// One-shot generator for docs/test-baseline/manifest.json — the committed manifest the monotonic-tests
// gate's tooth 2 reads (a listed test file that no longer exists on disk is RED: a spec can't be deleted
// to go green). Lists every REAL test-execution file under tests/ (`.test.ts`/`.test.tsx`/`.ct.tsx`/
// `.spec.ts` — the suffixes vitest/Playwright actually collect as a runnable spec), sorted, repo-relative,
// posix. Re-run this ONLY on a sanctioned bulk shift (a legitimate rename/delete wave); day-to-day the
// manifest only grows (new test files are additive — deleting a listed one is the exact thing gated).
import { globSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const files = globSync(["tests/**/*.test.ts", "tests/**/*.test.tsx", "tests/**/*.ct.tsx", "tests/**/*.spec.ts"], {
  cwd: root,
})
  .map((f) => f.replaceAll("\\", "/"))
  .sort();

const manifest = { testFiles: files };
const out = join(root, "docs/test-baseline/manifest.json");
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`wrote ${files.length} test files → ${out}\n`);
