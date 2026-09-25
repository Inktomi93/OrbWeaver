// THE WORKING-TREE GUARD (docs/work/0062) — the ONE globalSetup/globalTeardown installed in every Vitest
// project and every Playwright run (CT + e2e). Repo law says a test uses an in-memory overlay or a temp
// directory and never writes the real checkout; nothing enforced that until now. `git status --porcelain
// --untracked-files=all` plus a content hash of each path it lists IS the whole state a run can leave
// behind — setup captures it, teardown re-captures it, and the diff names every path that was added,
// changed or removed. Gitignored output (coverage/, reports/, a build cache) never appears in `git
// status` at all, so it needs no separate exclusion here.
//
// THE ONE EXCEPTION. `tests/tooling/check-gates.repo.int.test.ts` is the sanctioned real-tree planter — it
// materializes `__g_`/`__dc_` sentinel fixtures inside the real package tree (its gates anchor on
// realistic paths) and reaps them itself before its own run ends. `planted-fixtures.ts` already tells a
// STRUCTURE run it cannot speak for the tree while that planter's window is open; this guard exempts the
// identical sentinel shape rather than double-report the one suite that already announces itself.
//
// ONE FUNCTION, THREE CONFIGS. Vitest's `loadGlobalSetupFile` and Playwright's `globalSetup` both accept a
// default-exported function that returns a teardown callback — Vitest treats a returned function as the
// suite's teardown when the module names no separate `teardown` export; Playwright documents the same
// return-a-teardown shape as its alternative to a `globalTeardown` file. That shared contract is why one
// module, referenced by its default export, is the whole guard for vitest.config.ts, playwright.config.ts
// and playwright-ct.config.ts — no per-runner adapter file.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execGit } from "./git.ts";

/** The sanctioned real-tree planter's sentinel shape (see the header). Matches `PROBE_ARTIFACT_RE` in
 *  `verify/lib/planted-fixtures.ts` — same vocabulary, same reason, kept local because that module's
 *  regex is not exported and this guard has no other reason to depend on it. */
const SENTINEL_RE = /(^|\/)__(?:g|dc)_/u;

/** `git status --porcelain` prints two status letters then a space before the path (`XY PATH`), and a
 *  rename/copy line splits into its old and new path on ` -> `. */
const PORCELAIN_PATH_OFFSET = 3;
const RENAME_ARROW = " -> ";

/** path → sha256 of its current bytes, or `null` when the path does not exist right now (a deleted-but-
 *  still-porcelain-listed entry). */
export type WorkingTreeSnapshot = ReadonlyMap<string, string | null>;

/** `git rev-parse --show-toplevel` from the caller's cwd — the WORKTREE running the suite, never the
 *  primary checkout a lane's worktree was cut from. */
export function repoRoot(): string {
  return execGit(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
}

/** Every path `git status` calls dirty right now, minus the sentinel exemption. A rename line
 *  (`R  old -> new`) reports only the NEW path — the guard cares what exists on disk, not how it arrived. */
function dirtyPaths(root: string): string[] {
  const output = execGit(root, ["status", "--porcelain", "--untracked-files=all"]);
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.length <= PORCELAIN_PATH_OFFSET) {
      continue;
    }
    const rest = line.slice(PORCELAIN_PATH_OFFSET);
    const arrow = rest.indexOf(RENAME_ARROW);
    const path = arrow === -1 ? rest : rest.slice(arrow + RENAME_ARROW.length);
    if (!SENTINEL_RE.test(path)) {
      paths.push(path);
    }
  }
  return paths;
}

function hashOf(root: string, path: string): string | null {
  // @orb-waive caught-failure-ownership(catch): the null return IS the owner-visible signal — a path git
  // lists as dirty but that is gone by the time we hash it (deleted, or a rename's old half) means "no
  // content", and the setup/teardown diff in diffWorkingTree() treats null distinctly from a missing key.
  // No end condition: this is the permanent meaning of "dirty path with no bytes".
  try {
    return createHash("sha256")
      .update(readFileSync(join(root, path)))
      .digest("hex");
  } catch {
    return null;
  }
}

/** Setup half: the dirty-path list plus each path's content hash, at whatever moment the caller invokes
 *  this — before the run's first test, for both configured runners. */
export function captureWorkingTree(root: string): WorkingTreeSnapshot {
  return new Map(dirtyPaths(root).map((path) => [path, hashOf(root, path)] as const));
}

/** Teardown half: re-derive the dirty-path list and diff it against the setup snapshot. A path present in
 *  only one list is added or removed; a path present in both with a different hash was changed further
 *  while it stayed dirty. Returns the sorted violation lines, empty when the tree is exactly as it was. */
export function diffWorkingTree(root: string, before: WorkingTreeSnapshot): readonly string[] {
  const afterList = dirtyPaths(root);
  const after = new Set(afterList);
  const violations: string[] = [];
  for (const path of before.keys()) {
    if (!after.has(path)) {
      violations.push(`removed: ${path}`);
    }
  }
  for (const path of afterList) {
    if (!before.has(path)) {
      violations.push(`added: ${path}`);
    } else if (hashOf(root, path) !== before.get(path)) {
      violations.push(`changed: ${path}`);
    }
  }
  return violations.toSorted((left, right) => left.localeCompare(right));
}

/** Throws naming every offending path, or returns cleanly when the tree matches its setup snapshot.
 *
 *  ALSO SETS `process.exitCode` (#62). Vitest's own `Vitest.close()` runs global teardown AFTER the test
 *  result already decided `process.exitCode` and only LOGS a teardown rejection ("error during close") —
 *  measured: a probe that wrote a real-tree file threw exactly this error and the CLI still exited 0.
 *  Playwright does not share that gap (its task runner folds a thrown teardown into the run's own
 *  status), but setting the code here is harmless there too: Playwright decides its OWN exit explicitly
 *  and this run has already failed regardless. */
export function assertWorkingTreeUnchanged(root: string, before: WorkingTreeSnapshot): void {
  const violations = diffWorkingTree(root, before);
  if (violations.length > 0) {
    process.exitCode = 1;
    throw new Error(
      `working-tree guard: this run left the working tree dirty — ${String(violations.length)} path(s) added, changed or removed:\n` +
        violations.map((line) => `  ${line}`).join("\n"),
    );
  }
}

export default function workingTreeGuard(): () => void {
  const root = repoRoot();
  const before = captureWorkingTree(root);
  return (): void => {
    assertWorkingTreeUnchanged(root, before);
  };
}
