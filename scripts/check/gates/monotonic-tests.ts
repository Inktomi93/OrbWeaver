// Gate: monotonic-tests — ACTIVATED 2026-07-17 (docs/test-baseline/manifest.json committed; see
// Core-Enforcement-Deferred-Dropped.md for the activation record). Guards against "wrong-but-green":
// every other gate verifies the code, this one verifies the SUITE — a deleted assertion or disabled
// test leaves no diff-visible trace anywhere else, so a green `pnpm check` must never be reachable by
// quietly skipping/deleting tests. THREE teeth: forbidden-skip (a new unconditional
// it.skip/test.only/.todo/.fixme), deleted-test-file (a docs/test-baseline/manifest.json entry that
// no longer exists on disk), and stale-marker (an `allow-skip` escape guarding no skip). Regenerate the
// manifest ONLY on a sanctioned bulk rename/delete wave: `pnpm tsx scripts/check/gen-test-baseline-manifest.ts`.
//
// THE MARKER IS TWO-SIDED (tooth 3, 2026-08-03). Tooth 1's escape hatch used to be one-sided and reason-less:
// the regex was a bare `/allow-skip/`, so `// allow-skip` with nothing after it exempted a disabled test, and
// a marker left behind after the skip was removed was invisible forever. Both halves are closed here — the
// reason is now REQUIRED (`allow-skip:\s*\S`, the house grammar `FABRICATION-OK:`/`@swallowed-ok:`/
// `@typeonly-ok:` all use) and a marker that guards no skip is itself a violation. The un-skip CONDITION
// belongs in that reason: an exemption that cannot say what would end it is a permanent one.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CallExpression, SourceFile, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

const BASELINE_REL = "docs/test-baseline/manifest.json";
const TEST_APIS = new Set(["it", "test", "describe", "suite", "bench"]);
const FORBIDDEN_MODIFIERS = new Set(["skip", "only", "todo", "fixme"]);
// The escape marker, in the house grammar every sibling marker uses (`FABRICATION-OK:`, `@swallowed-ok:`,
// `@typeonly-ok:`, `@server-only:`): the REASON after the colon is REQUIRED. A bare `// allow-skip` used to
// exempt — which is the marker rotting into a rubber stamp, since the only thing an exemption owes a reader
// is WHY and WHEN IT ENDS. `\S` after `:\s*` is the whole requirement (same shape as the ast.ts lenses).
const ALLOW_SKIP_RE = /allow-skip:\s*\S/u;
// The BARE form — used ONLY by the stale arm's diagnostics, so a reason-less marker is reported as
// "no reason" rather than silently invisible (a marker nobody can see is worse than one that reds).
const ALLOW_SKIP_BARE_RE = /allow-skip/u;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// The leftmost identifier of a property-access chain: for `test.describe.skip` the chain is
// PropertyAccess(PropertyAccess(Identifier "test")) — walk the `.expression` spine to the root so
// `it`/`test`/`describe` is recognized through nested member access (`test.describe.only`, etc.).
function rootIdentifier(node: TsMorphNode): string | undefined {
  let cursor: TsMorphNode | undefined = node;
  while (cursor !== undefined && Node.isPropertyAccessExpression(cursor)) {
    cursor = cursor.getExpression();
  }
  return cursor !== undefined && Node.isIdentifier(cursor) ? cursor.getText() : undefined;
}

// True when a `<root>.<modifier>(...)` call is the MODIFIER form (declares a skipped/focused/todo
// test) rather than a runtime guard. `only`/`todo` have no conditional variant — always the modifier
// form. `skip`/`fixme` are the modifier form when they declare a test (a function/arrow argument, or a
// bare/string-literal-titled call); the runtime-guard form (`test.skip(cond, "reason")`) carries a
// condition expression and no test-body function.
function isForbiddenModifierCall(call: CallExpression, modifier: string): boolean {
  const args = call.getArguments();
  if (modifier === "only" || modifier === "todo") {
    return true;
  }
  if (args.length === 0) {
    return true; // bare `test.skip()` — unconditional skip-rest-of-test.
  }
  const hasFunctionArg = args.some((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (hasFunctionArg) {
    return true; // `it.skip("name", () => {…})`.
  }
  const first = args[0];
  return first !== undefined && (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first)); // `test.skip("just a title")` — no condition arg.
}

function hasAllowSkip(lines: readonly string[], lineNo: number): boolean {
  const here = lines[lineNo - 1] ?? "";
  const above = lines[lineNo - 2] ?? "";
  return ALLOW_SKIP_RE.test(here) || ALLOW_SKIP_RE.test(above);
}

/** The 1-based lines of every forbidden-modifier call in the file — the set the STALE arm reconciles markers
 *  against. Shares {@link isForbiddenModifierCall} with tooth 1, so the two sides can never disagree about
 *  what "a skip" is (the failure mode a second, parallel detector would guarantee). */
function forbiddenSkipLines(sf: SourceFile): Set<number> {
  const lines = new Set<number>();
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      continue;
    }
    const modifier = expr.getName();
    const root = rootIdentifier(expr.getExpression());
    if (!(FORBIDDEN_MODIFIERS.has(modifier) && root !== undefined && TEST_APIS.has(root) && isForbiddenModifierCall(call, modifier))) {
      continue;
    }
    lines.add(call.getStartLineNumber());
  }
  return lines;
}

// TOOTH 3 — the STALE side of the marker (the two-sided-marker law the ast.ts lenses ship: `@swallowed-ok`
// and `@typeonly-ok` both RED when the condition they exempt no longer holds). A one-sided escape hatch rots
// into a permanent lie: the skip gets un-skipped or deleted, the marker stays, and the next reader believes
// this file has a sanctioned disabled test. Worse, the stale marker is now a LOADED GUN — the next skip
// written on that line inherits an exemption nobody granted it.
//
// A marker is LIVE exactly when tooth 1 would consult it: on the same line as a forbidden-modifier call, or
// on the line directly above one (the same adjacency `hasAllowSkip` reads — one definition, read twice).
// Anything else is stale, in two flavors worth distinguishing in the message: a REASONED marker that no
// longer guards a skip, and a REASON-LESS one (which under the tightened regex above exempts nothing at all,
// so it is invisible to tooth 1 and would otherwise sit there forever looking like protection).
function scanStaleAllowSkips(sf: SourceFile, rel: string, out: Violation[]): void {
  const lines = sf.getFullText().split("\n");
  const skipLines = forbiddenSkipLines(sf);
  for (const [index, text] of lines.entries()) {
    if (!ALLOW_SKIP_BARE_RE.test(text)) {
      continue;
    }
    const lineNo = index + 1;
    if (skipLines.has(lineNo) || skipLines.has(lineNo + 1)) {
      continue; // guarding a real skip — tooth 1 reads it here.
    }
    const reasoned = ALLOW_SKIP_RE.test(text);
    out.push({
      file: rel,
      line: lineNo,
      message: reasoned
        ? "`allow-skip:` marker guards nothing — no unconditional `.skip`/`.only`/`.todo`/`.fixme` on this line or the next. The skip was un-skipped, deleted, or made conditional; delete the marker (a stale exemption is a lie, and the next skip written here would silently inherit it). (Spine-Testing.md §5)"
        : "`allow-skip` marker with NO reason after the colon, and it guards nothing — it exempts no skip (the reason is required: `// allow-skip: <why + the condition that ends it>`). Delete it, or write it against a real skip WITH a reason. (Spine-Testing.md §5)",
    });
  }
}

function scanForbiddenSkips(sf: SourceFile, rel: string, out: Violation[]): void {
  const lines = sf.getFullText().split("\n");
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      continue;
    }
    const modifier = expr.getName();
    if (!FORBIDDEN_MODIFIERS.has(modifier)) {
      continue; // exact match only — `skipIf`/`runIf` never qualify.
    }
    const root = rootIdentifier(expr.getExpression());
    if (root === undefined || !TEST_APIS.has(root)) {
      continue;
    }
    if (!isForbiddenModifierCall(call, modifier)) {
      continue; // runtime guard — allowed.
    }
    const line = call.getStartLineNumber();
    if (hasAllowSkip(lines, line)) {
      continue;
    }
    out.push({
      file: rel,
      line,
      message: `\`${root}.${modifier}\` disables a test unconditionally — the suite can't go green by skipping. Gate it with \`.skipIf(cond)\` / Playwright's \`test.skip(cond, "reason")\` if it needs an env/engine, or add \`// allow-skip: <why + the condition that ends it>\` above the line if it's truly justified. The REASON is required — a bare \`// allow-skip\` exempts nothing (Spine-Testing.md §5).`,
    });
  }
}

interface Manifest {
  readonly testFiles: readonly string[];
}

function readManifest(root: string): Manifest | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(root, BASELINE_REL), "utf-8");
  } catch {
    return; // no baseline yet — tooth 2 stays a documented no-op (see header).
  }
  const parsed = JSON.parse(raw) as { testFiles?: unknown };
  return Array.isArray(parsed.testFiles) ? { testFiles: parsed.testFiles as string[] } : undefined;
}

function scanDeletedTestFiles(root: string, out: Violation[]): void {
  const manifest = readManifest(root);
  if (manifest === undefined) {
    return;
  }
  for (const f of manifest.testFiles) {
    if (!existsSync(join(root, f))) {
      out.push({
        file: f,
        line: 0,
        message:
          "test file in the committed baseline manifest no longer exists — a spec can't be deleted to go green. If the deletion/rename is intended, regenerate and commit the manifest diff (Spine-Testing.md §5).",
      });
    }
  }
}

/** The AST(+manifest-fs) scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanMonotonicTests({ root, project }: CheckContext): Violation[] {
  const violations: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (!filePath.includes("/tests/")) {
      continue;
    }
    const rel = relPath(root, filePath);
    scanForbiddenSkips(sf, rel, violations);
    scanStaleAllowSkips(sf, rel, violations);
  }
  scanDeletedTestFiles(root, violations);
  return violations;
}

export const monotonicTests: Check = {
  name: "monotonic-tests",
  run: (ctx): Violation[] => scanMonotonicTests(ctx),
};

// Scans every tests/** file for a new unconditional skip/only/todo/fixme modifier (tooth 1) and
// reconciles the committed baseline manifest against disk (tooth 2).
export const gate: GateDescriptor = {
  name: "monotonic-tests",
  docRow: "Core-Enforcement-Deferred-Dropped.md (monotonic-tests) / Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a test is disabled unconditionally (`it.skip`/`test.only`/`.todo`/`.fixme` modifier), a baseline-manifest test file was deleted, or an `allow-skip` marker guards no skip — the suite must not go green by skipping or deleting tests, and its escape hatches must not rot (Spine-Testing.md §5).",
  fix: 'gate the skip on a condition (`.skipIf(cond)` / `test.skip(cond, "reason")`) or add `// allow-skip: <why + the condition that ends it>` (the reason is REQUIRED); delete a marker that no longer guards a skip; and never delete a baselined spec to go green (Spine-Testing.md §5).',
  run: (ctx) => {
    for (const v of scanMonotonicTests({ root: ctx.root, project: ctx.project })) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  // Tooth 2's deleted-manifest FLAG needs a real temp-dir tree, so it lives in
  // tests/tooling/monotonic-tests.residual.test.ts instead (this descriptor is not fsBacked).
  mustFlag: [
    {
      files: 'it.skip("later", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "unconditionally" },
      why: 'a bare `it.skip("title", fn)` modifier — an unconditional skip the suite can\'t go green by (§5)',
    },
    {
      files: 'test.only("focused", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/only.test.ts",
      expect: { messageIncludes: "test.only" },
      why: "test.only has no conditional variant — always the forbidden modifier form",
    },
    {
      files: 'test.todo("later");\n',
      at: "tests/tooling/todo.test.ts",
      expect: { messageIncludes: "test.todo" },
      why: "test.todo has no conditional variant — always the forbidden modifier form",
    },
    {
      files: '// allow-skip\nit.skip("no reason given", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/bare-marker.test.ts",
      expect: { messageIncludes: "unconditionally" },
      why: "a REASON-LESS `// allow-skip` exempts nothing (the marker requires `: <reason>`) — the skip still REDs",
    },
    {
      files: '// allow-skip: was flaky, fixed in PD-999 — un-skip when the fix lands\nit("now running", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/stale-marker.test.ts",
      expect: { messageIncludes: "guards nothing" },
      why: "tooth 3 (STALE): a reasoned marker with no skip on its line or the next — the skip was un-skipped and the exemption became a lie",
    },
    {
      files: "// allow-skip\nexport const notAMarkerSite = 1;\n",
      at: "tests/tooling/bare-stale.test.ts",
      expect: { messageIncludes: "NO reason" },
      why: "tooth 3, reason-less flavor: a bare marker guarding nothing exempts nothing and must not sit there looking like protection",
    },
  ],
  mustPass: [
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
      files: '// allow-skip: flaky pending PD-999 — un-skip when PD-999 closes\nit.skip("known-flaky", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/escape.test.ts",
      why: "the `// allow-skip: <reason>` escape hatch on the line above exempts the skip — and, guarding a real skip, is not STALE either; passes both teeth",
    },
    {
      files: 'it.skip("same-line", () => {}); // allow-skip: needs a GPU runner — un-skip when one exists\n',
      at: "tests/tooling/escape-same-line.test.ts",
      why: "the marker on the skip's OWN line exempts it too (the adjacency tooth 3 reconciles against) — passes",
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
