// Gate: monotonic-tests — ACTIVATED 2026-07-17 (docs/test-baseline/manifest.json committed; see
// Core-Enforcement-Deferred-Dropped.md for the activation record). Guards against "wrong-but-green":
// every other gate verifies the code, this one verifies the SUITE — a deleted assertion or a test that
// merely *claims* it was skipped can leave no diff-visible trace anywhere else. TWO teeth: pseudo-skip
// metadata (`test.info().annotations.push({ type: "skipped" })` does not change runner status) and
// deleted-test-file (a docs/test-baseline/manifest.json entry that no longer exists on disk and isn't
// accounted for).
//
// RE-ARMED 2026-08-03 (was silently INERT — the manifest was lost in the 2026-07-25 retro purge and
// `readManifest` FAIL-OPENED on a missing file; the truth-audit rider on the Active-Gates row is retired
// by this fix). `readManifest` is now FAIL-LOUD: a missing/unparseable manifest reds on the REAL tree
// (guarded by `REAL_TREE_ANCHOR` so gate-conformance's synthetic mini-projects, which never carry the
// real `packages/db` schema barrel or the manifest, stay silent — GATE-AUTHORING.md §4.5).
//
// ACCOUNTING FOR A DELETION (the one obvious motion): delete the test file, then add an entry to the
// committed manifest's `deletions` map keyed by its repo-relative path, e.g.
// `"tests/foo.test.ts": { "why": "merged into bar.test.ts — see PD-123" }` — `why` is REQUIRED and must
// say what would un-delete it. That's it; no regen needed for a single deletion. Optionally run
// `node tooling/src/verify/cli.ts baseline test-baseline-manifest` afterward (it carries the ledger forward and
// folds in any newly added test files — see that script's header). ADDING a test needs no manifest edit
// for THIS GATE: an untracked file is never gated here, so it never reds. It does need a regen for the
// `ledgers:fresh` STAGE (#817), which compares the committed manifest against a fresh derivation.
//
// A `deletions` entry whose file is back on disk is itself a violation (tooth 2's stale arm) — a stale
// ledger row is a loaded gun: the next legitimate delete of that path would silently inherit an exemption
// nobody re-granted.
//
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CallExpression, SourceFile, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import type { Check, CheckContext, Violation } from "../contract/harness.ts";
import type { TestBaselineDeletion, TestBaselineManifest } from "../contract/test-baseline.ts";
import { TEST_BASELINE_REL } from "../contract/test-baseline.ts";

// A file present on every REAL repo checkout, never touched by this gate's own conformance examples
// (which only plant files under tests/tooling/**) — the real-tree anchor GATE-AUTHORING.md §4.5 requires
// so the fail-loud missing-manifest arm can't misfire inside gate-conformance's synthetic mini-projects
// (whose virtual root never has this path either).
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

/** Match the known false-pass shape precisely. Playwright annotations are metadata; pushing a `skipped`
 * label does not update the runner's outcome, so an early return after this call is recorded as passed.
 * Genuine `test.skip(...)`, `test.skipIf(...)`, `describe.skipIf(...)`, and Vitest `.skip`/`.todo` calls
 * are runner-native outcomes and deliberately remain outside this gate. */
function isPseudoSkipAnnotation(call: CallExpression): boolean {
  const push = call.getExpression();
  if (!Node.isPropertyAccessExpression(push) || push.getName() !== "push") {
    return false;
  }
  const annotations = push.getExpression();
  if (!Node.isPropertyAccessExpression(annotations) || annotations.getName() !== "annotations") {
    return false;
  }
  const infoCall = annotations.getExpression();
  if (!Node.isCallExpression(infoCall)) {
    return false;
  }
  const info = infoCall.getExpression();
  if (!Node.isPropertyAccessExpression(info) || info.getName() !== "info" || info.getExpression().getText() !== "test") {
    return false;
  }
  return call.getArguments().some((arg) => {
    if (!Node.isObjectLiteralExpression(arg)) {
      return false;
    }
    const type = arg.getProperty("type");
    if (!Node.isPropertyAssignment(type)) {
      return false;
    }
    const value = type.getInitializer();
    return value !== undefined && (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value)) && value.getLiteralText() === "skipped";
  });
}

function scanPseudoSkips(sf: SourceFile, onSite: (call: TsMorphNode, token: string) => void): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (isPseudoSkipAnnotation(call)) {
      onSite(call, "test.info().annotations.push");
    }
  }
}

type ManifestResult = { readonly kind: "ok"; readonly manifest: TestBaselineManifest } | { readonly kind: "missing" } | { readonly kind: "malformed" };

/** Only meaningful entries: a `why` that's a non-empty string. A reason-less/malformed row is treated as
 *  absent, so the file it names falls straight through to the unaccounted-deletion violation below — no
 *  separate "malformed ledger row" codepath needed. */
function readDeletions(raw: unknown): Readonly<Record<string, TestBaselineDeletion>> | undefined {
  if (raw === undefined) {
    return {};
  }
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const out: Record<string, TestBaselineDeletion> = {};
  for (const [f, entry] of Object.entries(raw as Record<string, unknown>)) {
    const why = (entry as { why?: unknown } | undefined)?.why;
    if (typeof why === "string" && why.trim().length > 0) {
      out[f] = { why };
    }
  }
  return out;
}

function readManifest(root: string): ManifestResult {
  let raw: string;
  // @orb-waive caught-failure-ownership(catch): captured as kind "missing", a distinct ManifestResult arm the caller (scanDeletedTestFiles) reports as a violation, never a silent pass. Ends if that "missing" arm stops being read as a violation.
  try {
    raw = readFileSync(join(root, TEST_BASELINE_REL), "utf-8");
  } catch {
    return { kind: "missing" };
  }
  // @orb-waive caught-failure-ownership(catch): captured as kind "malformed", a distinct ManifestResult arm the caller reports as a violation, never a silent pass. Ends if that "malformed" arm stops being read as a violation.
  try {
    const parsed = JSON.parse(raw) as { testFiles?: unknown; deletions?: unknown };
    if (!Array.isArray(parsed.testFiles)) {
      return { kind: "malformed" };
    }
    const deletions = readDeletions(parsed.deletions);
    if (deletions === undefined) {
      return { kind: "malformed" };
    }
    return { kind: "ok", manifest: { testFiles: parsed.testFiles as string[], deletions } };
  } catch {
    return { kind: "malformed" };
  }
}

/** True only on a checkout that actually IS the real repo tree (a file gate-conformance's synthetic
 *  mini-projects never carry). Gates the fail-loud missing/malformed-manifest finding so it can't fire
 *  inside a conformance example — see `REAL_TREE_ANCHOR`. */
function isRealTree(root: string): boolean {
  return existsSync(join(root, REAL_TREE_ANCHOR));
}

function scanDeletedTestFiles(root: string, out: Violation[]): void {
  const result = readManifest(root);
  if (result.kind !== "ok") {
    if (!isRealTree(root)) {
      return; // synthetic/mini-project tree — nothing to judge, and not a claim about the real repo.
    }
    out.push({
      file: TEST_BASELINE_REL,
      line: 0,
      message:
        result.kind === "missing"
          ? `committed test-baseline manifest is missing (${TEST_BASELINE_REL}) — the deleted-test-file check cannot run blind. Regenerate it: \`node tooling/src/verify/cli.ts baseline test-baseline-manifest\`, then commit the file (Spine-Testing.md §5).`
          : `committed test-baseline manifest (${TEST_BASELINE_REL}) is malformed/unparseable — regenerate it: \`node tooling/src/verify/cli.ts baseline test-baseline-manifest\`, then commit the file (Spine-Testing.md §5).`,
    });
    return;
  }
  const { manifest } = result;
  for (const f of manifest.testFiles) {
    if (existsSync(join(root, f))) {
      continue;
    }
    if (manifest.deletions[f] !== undefined) {
      continue; // accounted for in the ledger.
    }
    out.push({
      file: f,
      line: 0,
      message:
        'test file in the committed baseline manifest no longer exists — a spec can\'t be deleted to go green. State the reason in the manifest\'s `deletions` ledger (`"<path>": { "why": "<reason>" }`) or restore the file (Spine-Testing.md §5).',
    });
  }
  for (const [f, entry] of Object.entries(manifest.deletions)) {
    if (existsSync(join(root, f))) {
      out.push({
        file: f,
        line: 0,
        message: `stale \`deletions\` ledger entry ("${entry.why}") — the file has returned to the tree; delete the entry (a stale deletion record is a lie, and would silently pre-authorize the next delete of this path) (Spine-Testing.md §5).`,
      });
    }
  }
}

/** The AST(+manifest-fs) scan shared by the legacy Check and the single-pass `run` descriptor. `onSite` is
 * tooth 1's NODE-anchored sink; the legacy `Check` consumer below only asserts manifest reconciliation. */
function scanMonotonicTests({ root, project }: CheckContext, onSite: (call: TsMorphNode, token: string) => void = () => undefined): Violation[] {
  const violations: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (!filePath.includes("/tests/")) {
      continue;
    }
    scanPseudoSkips(sf, onSite);
  }
  scanDeletedTestFiles(root, violations);
  return violations;
}

export const monotonicTests: Check = {
  name: "monotonic-tests",
  run: (ctx): Violation[] => scanMonotonicTests(ctx),
};

// Scans tests/** for metadata-only pseudo-skips (tooth 1) and reconciles the committed baseline manifest
// against disk (tooth 2). Focused tests remain a Biome error; real runner skips are honest outcomes.
export const gate: GateDescriptor = {
  name: "monotonic-tests",
  docRow: "Core-Enforcement-Deferred-Dropped.md (monotonic-tests) / Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  message:
    '`test.info().annotations.push({ type: "skipped" })` does not change runner status, so returning afterward reports a false pass; use a genuine runner skip with a reason. A baselined test file also cannot disappear without an accounted deletion (Spine-Testing.md §5).',
  fix: 'replace metadata-only pseudo-skips with a runner-native unavailable outcome (`test.skip(condition, "reason")` / `.skipIf(condition)`), or restore/account for a deleted baselined spec (Spine-Testing.md §5).',
  run: (ctx) => {
    const siteHits: { readonly node: TsMorphNode; readonly token: string }[] = [];
    for (const v of scanMonotonicTests({ root: ctx.root, project: ctx.project }, (call, token) => siteHits.push({ node: call, token }))) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    for (const hit of siteHits) {
      ctx.report(hit.node, { token: hit.token, offset: 0 });
    }
  },
  // Tooth 2's deleted-manifest FLAG needs a real temp-dir tree, so it lives in
  // tests/tooling/monotonic-tests.residual.test.ts instead (this descriptor is not fsBacked).
  mustFlag: [
    {
      files: 'test("fake unavailable", () => {\n  test.info().annotations.push({ type: "skipped", description: "backend absent" });\n  return;\n});\n',
      at: "tests/e2e/pseudo-skip.spec.ts",
      expect: { messageIncludes: "does not change runner status" },
      why: "arbitrary metadata plus an early return records a passed test, not a runner-native unavailable outcome",
    },
  ],
  mustPass: [
    {
      files: 'it.skip("temporarily unavailable", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/skipped.test.ts",
      why: "an honest runner-native skipped outcome is not reported as passed",
    },
    {
      files: 'test.todo("not implemented");\n',
      at: "tests/tooling/todo.test.ts",
      why: "an honest runner-native todo outcome is not reported as passed",
    },
    {
      files: 'it.skipIf(process.env.CI === undefined)("gated", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/ok.test.ts",
      why: "a conditional `.skipIf(cond)` gate (env/engine) — exact-name match, never the forbidden modifier",
    },
    {
      files: 'test("some flow", async ({ page }) => {\n  test.skip(!!process.env.CI, "flaky in CI");\n  await page.goto("/");\n});\n',
      at: "tests/e2e/z.spec.ts",
      why: "Playwright's runtime test.skip(cond, reason) guard (condition arg, no test body) — allowed",
    },
    {
      files: 'describe.skipIf(process.platform !== "linux")("linux evidence", () => {\n  test("runs", () => {});\n});\n',
      at: "tests/tooling/platform.test.ts",
      why: "a suite-level conditional skip reports a genuine runner outcome",
    },
    {
      files: 'test("iterates", () => {\n  const it = [1, 2][Symbol.iterator]();\n  it.next();\n  expect(it.next().done).toBe(true);\n});\n',
      at: "tests/tooling/iter.test.ts",
      why: "a local `it` async-iterator variable (it.next()) is not a test call — not mistaken for one, passes",
    },
    {
      files: 'it.skip("not even a real test file", () => {});\n',
      at: "packages/server/src/x.ts",
      why: "scope: a file outside tests/ is ignored entirely — passes",
    },
  ],
};
