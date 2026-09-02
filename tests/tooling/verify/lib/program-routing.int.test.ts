// The two halves of `tooling/src/verify/lib/program-routing.ts` that decide whether `types:graph` RUNS at
// a scoped tier: the overlay-cache KEY (#1264) and the import-pull overlay ALGEBRA (rule 5, the TS2584
// class). Both are proven here rather than through `resolveSelection` because both are era-fragile the
// other way round: the key can only be shown to follow file CONTENT against a repo whose content we own
// (mutating the checkout under test is not a test), and the algebra must be pinned against an INJECTED
// membership set — the ops-level pin that froze one real import-pulled file went red on every tree the
// day #1243 moved ui/client src wholesale out of the root graph (850235e43), while the algebra it named
// was still exactly right. Which files the graph ACTUALLY contains is the `tsconfig-routing-parity`
// gate's business plus the live ts7 listing, never a frozen literal in here.
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { graphMembershipKey, programsFor, touchesGraph } from "../../../../tooling/src/verify/lib/program-routing.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Hermetic git: the operator's global config must not reach these repos (a global `core.hooksPath` or
 *  `commit.gpgsign` would fail the commit and turn every arm below into a false verdict). */
const GIT_HERMETIC: readonly string[] = ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

function git(cwd: string, ...args: string[]): string {
  const res = spawnSync("git", [...GIT_HERMETIC, ...args], { cwd, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${String(res.status)}: ${res.stderr}`);
  }
  return res.stdout;
}

/** A one-commit repo holding a committed, clean `tracked.ts`. */
function plantRepo(dir: string): void {
  git(dir, "init", "--quiet");
  git(dir, "config", "user.email", "test@orb.local");
  git(dir, "config", "user.name", "orb test");
  writeFileSync(join(dir, "tracked.ts"), "export const a = 1;\n");
  git(dir, "add", "tracked.ts");
  git(dir, "commit", "--quiet", "-m", "base");
}

/** The PROXY the key used to digest — asserted in each arm as a planted positive control: it must be
 *  IDENTICAL across the two working trees, or the arm is not testing what it claims to. */
function porcelain(dir: string): string {
  return git(dir, "status", "--porcelain");
}

test("graphMembershipKey: same dirty PATH set, different BYTES ⇒ different key (#1264 — the overlay under-run)", ({ scratch }) => {
  plantRepo(scratch);
  writeFileSync(join(scratch, "tracked.ts"), "export const a = 2;\n");
  const proxy = porcelain(scratch);
  const first = graphMembershipKey(scratch);
  writeFileSync(join(scratch, "tracked.ts"), "export const a = 3;\n");
  // Positive control: `git status --porcelain` — the whole of the old key's dirty half — cannot tell the
  // two trees apart, so the old key collided and served a membership set computed from different bytes.
  // Measured consequence on the real tree (2026-09-02): adding an `import "@orb/ui/button"` to an
  // already-dirty tests/ file moved 27 ui src files into the graph while the key stood still, and
  // touchesGraph then answered FALSE for a file the graph contained — types:graph skipped at --changed.
  expect(porcelain(scratch)).toBe(proxy);
  expect(graphMembershipKey(scratch)).not.toBe(first);
});

test("graphMembershipKey: an UNTRACKED file's bytes are in the key too (a new tests/ file is a graph ROOT)", ({ scratch }) => {
  plantRepo(scratch);
  writeFileSync(join(scratch, "fresh.ts"), "export const b = 1;\n");
  const proxy = porcelain(scratch);
  const first = graphMembershipKey(scratch);
  writeFileSync(join(scratch, "fresh.ts"), 'import "@orb/ui/button";\n');
  expect(porcelain(scratch)).toBe(proxy);
  expect(graphMembershipKey(scratch)).not.toBe(first);
});

test("graphMembershipKey: identical content mints the SAME key — the cache must still HIT", ({ scratch }) => {
  // The other failure direction: a key that never repeats pays the heavy ts7 `--listFilesOnly` spawn on
  // every single invocation. A clean tree and an unchanged dirty tree must both be stable.
  plantRepo(scratch);
  expect(graphMembershipKey(scratch)).toBe(graphMembershipKey(scratch));
  writeFileSync(join(scratch, "tracked.ts"), "export const a = 2;\n");
  const dirty = graphMembershipKey(scratch);
  writeFileSync(join(scratch, "tracked.ts"), "export const a = 2;\n"); // rewritten, same bytes
  expect(graphMembershipKey(scratch)).toBe(dirty);
});

test("graphMembershipKey: a DELETED tracked file moves the key (deleting a graph root moves the closure)", ({ scratch }) => {
  plantRepo(scratch);
  const clean = graphMembershipKey(scratch);
  rmSync(join(scratch, "tracked.ts"));
  // No bytes to hash — the path's presence in the working-tree delta is what carries the deletion.
  expect(graphMembershipKey(scratch)).not.toBe(clean);
});

test("rule 5: an overlay member gains the GRAPH program, a non-member does not, and a COLD cache is CONSERVATIVE", () => {
  // A browser-package src file is graph-EXCLUDED by directory, so the overlay set is the ONLY thing that
  // can put it in the graph program — which makes it the honest carrier for all three arms.
  const subject = "packages/ui/src/primitives/button/variants.ts";
  expect(programsFor(subject, new Set([subject]))).toEqual(["packages/ui/tsconfig.json", "tsconfig.json"]);
  expect(touchesGraph([subject], new Set([subject]))).toBe(true);
  expect(touchesGraph([subject], new Set())).toBe(false);
  // THE invariant the #1264 cache key was quietly violating, and which nothing pinned until now: cache
  // cold (ts7 unavailable / a compute failure ⇒ undefined) must OVER-run the overlay, never under-run it.
  expect(touchesGraph([subject], undefined)).toBe(true);
  expect(touchesGraph(["packages/kit/src/x.ts"], undefined)).toBe(true);
  // …and the fallback is scoped to package src: it exists because the overlay could not be CONSULTED, so
  // a path that has no overlay membership to miss is not swept into the graph by it.
  expect(touchesGraph(["docs/architecture/core/AGENTS.md"], undefined)).toBe(false);
});
