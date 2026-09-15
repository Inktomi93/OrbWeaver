// The SCOPED-RUN proof net (TSMORPH-SINGLE-PASS-AUDIT.md §4, the driven-for-real deliverable). The scoped
// runner (tooling/src/verify/ops/scoped.ts) runs ONLY the incremental-safe gates over a subset of the tree and
// DEFERS every whole-project gate. Four properties, each proven the parity-guard-divergence way — the
// test introduces the exact divergence, confirms the expected RED/silent, then the fixture is restored to
// its clean shape so the assertion has teeth (a green it can be SHOWN going red):
//
//   1. SUBSET-CORRECTNESS — an incremental-safe violation INSIDE the scoped folder is reported by the
//      scoped run AND by the full run, for that exact file. Remove the violation → both go clean.
//   2. SCOPE-ISOLATION — a violation OUTSIDE the scoped folder is INVISIBLE to the scoped run but caught
//      by the full run. It is the fence's whole point: a scoped clean is only a claim about the scope.
//   3. WHOLE-PROJECT-SAFETY — a whole-project ratchet (bus-producer-coverage) that FIRES on the full tree does NOT
//      fire on a scoped run: it is deferred, never run, so it emits zero findings.
//   4. STALE-ARM ISOLATION — an INCREMENTAL-safe gate does run on a scoped pass, `finalize` included, so
//      its exemption-table stale sweep must stay silent about rows whose files the run never visited.
//
// The "full run" oracle here is `runPass` over the SAME in-memory project with scope=project — the exact
// path `pnpm check:structure` drives — so the scoped verdict is proven against the real full verdict, not
// a hand-rolled expectation.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// ── 5. THE SELECTOR'S HONESTY (#1185) ────────────────────────────────────────────────────────────────
// The lane gate door is `cli.ts scoped --scope <dir>`, and lanes type the COMMA form for a multi-folder
// slice. Red-first on the unmodified source, measured on this tree:
//   `--scope packages/ui/src/primitives/switch,packages/ui/src/tokens` → "0 file(s) in scope", every gate
//   "✓ scanned 0/0", EXIT 0. The whole string was handed to the single-glob matcher, which matches no path
//   on any tree — so the door answered "your slice is clean" about a slice it never opened.
//
// Two properties, both proven at the CLI (the exit code IS the contract, and these assertions compile
// against the pre-fix source — they read stdout/stderr and the exit code, never the new parse):
//   A. the comma form is ACCEPTED as a UNION — adding a folder can only ADD files, never zero them out;
//   B. a selector that resolves to NO files is EXIT 2 ("nothing was checked"), never a green wall —
//      .claude/rules/gates-and-tooling.md: a bare zero is "I couldn't measure", never "it isn't there".
// The misuse arm (an empty comma segment) is the third: a typo'd scope is refused at exit 3 before any
// project is built. Every arm is a PLANTED CONTROL for the others — a fix that refused everything would
// fail A, and a fix that accepted everything would fail B and C.
const SCOPED_CLI_TIMEOUT_MS = scaledBudget(240_000);
const SCOPE_A = "packages/ui/src/primitives/switch";
const SCOPE_B = "packages/ui/src/tokens";
const IN_SCOPE_COUNT = /·\s+(\d+) file\(s\) in scope/u;

/** The `N file(s) in scope` the run printed — the tool's own count, never a re-derivation. */
function inScopeCount(stdout: string): number {
  const m = IN_SCOPE_COUNT.exec(stdout);
  if (m?.[1] === undefined) {
    throw new Error(`scoped run printed no file count — stdout was:\n${stdout}`);
  }
  return Number(m[1]);
}

test("the COMMA form is a UNION of folder globs, never a silent zero (#1185)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli, scratch }) => {
  const files = {
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022", module: "nodenext", moduleResolution: "nodenext" }, include: ["packages/**/*.ts"] }),
    [`${SCOPE_A}/switch.ts`]: "export const value = 1;\n",
    [`${SCOPE_B}/tokens.ts`]: "export const token = 1;\n",
    "tooling/src/verify/gates/fixture.ts":
      'export const gate = { name: "fixture", docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", message: "fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], mustPass: [{ files: "export const good = 1;", why: "fixture" }] };\n',
  };
  for (const [path, source] of Object.entries(files)) {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  const single = await runCli("verify", ["scoped", "--scope", SCOPE_A], { cwd: scratch, timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  const union = await runCli("verify", ["scoped", "--scope", `${SCOPE_A},${SCOPE_B}`], { cwd: scratch, timeoutMs: SCOPED_CLI_TIMEOUT_MS });

  // The single-dir control: a real, non-zero slice. Without it the union claim below proves nothing.
  expect(inScopeCount(single.stdout), "the single-dir control must scope a non-zero fileset").toBeGreaterThan(0);
  // The lie: pre-fix this was 0 with exit 0. A union can only be LARGER than one of its members.
  expect(inScopeCount(union.stdout)).toBeGreaterThan(inScopeCount(single.stdout));
  expect(union.stdout, "the header names both folders so the operator can see what was judged").toContain(SCOPE_B);
  // A verdict (0 clean / 1 violations), never the tool-error class — the run really ran.
  expect([0, 1]).toContain(union.code);
});

/** A folder that exists in no checkout — the selector resolves to zero files. */
const ABSENT_SCOPE = "packages/ui/src/primitives/no-such-primitive";

test("a selector that resolves to ZERO files exits 2 (#1185)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped", "--scope", ABSENT_SCOPE], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain("scoped 0 files — nothing was checked");
  // And it must not have printed the green wall it used to: no gate report at all.
  expect(res.stdout).not.toContain("file(s) in scope");
});

test("an empty comma segment is MISUSE (exit 3), refused before any work", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped", "--scope", `${SCOPE_A},`], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("empty comma segment");
});

test("a DERIVED --changed set with no source file says so and stays CLEAN (#1185 stated fork)", { timeout: SCOPED_CLI_TIMEOUT_MS }, async ({ runCli }) => {
  // The other half of the empty-scope rule, and the reason it is not one rule: `--scope`/`--package`
  // ASSERT a fileset (zero means the operator was wrong → exit 2), while `--changed` DERIVES one from
  // git, where a docs-only diff legitimately holds no source file. Failing that would mint exactly the
  // false alarm this issue is about — so it prints "nothing was checked" and exits clean.
  const res = await runCli("verify", ["scoped", "--changed", "docs/Mission.md"], { timeoutMs: SCOPED_CLI_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  expect(res.stderr).toContain("scoped 0 files — nothing was checked");
  expect(res.stdout, "and no gate wall may be printed over an empty set").not.toContain("file(s) in scope");
});
