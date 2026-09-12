// The WHOLE-CORPUS CONFORMANCE STAGE (#1941; docs/design/gate-runtime-standardization.md §5 item 3) at the door
// it is driven through — `cli.ts policy-conformance` over planted roots — so the exit classes and the failure lines
// are proven where a reader meets them. Three arms, each the other's control: a REAL final policy re-exported into
// a planted corpus proves clean (0); a planted policy whose founding row cannot bite proves exit 2 naming policy,
// arm, row index and why; a legacy-only corpus proves the bare-zero refusal (2, never a clean 0).
//
// The re-export shim imports the REAL module by absolute file URL, so the descriptor the stage runs is the
// production-branded object (the loader's identity law refuses a copy) and the shim's basename is the policy id
// (the filename law).
//
// EVERY PROOF-ROW COUNT HERE IS DERIVED, NEVER A LITERAL (#1969, refuted-and-repaired 2026-09-12). The first
// repair of this row replaced a hard-coded corpus denominator with ANOTHER hard-coded number and then bumped
// it 8→9 and 10→11 when a shimmed policy grew a row — which is the exact rot #1969 exists to forbid ("THE
// FLOOR IS A PROPERTY, NOT A NUMBER", `conformance.int.test.ts`). A count that must be edited when somebody
// else's correct work lands is the defect whatever its value, so the real policies' rows are read off the
// policies themselves and the planted policy's rows are authored ONCE, as data, and interpolated into its
// source. Arm 2's grant counts were already derived this way and are the shape the rest now follows.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as baseuiRenderProp } from "../../../../tooling/src/verify/gates/baseui-render-prop-composition.ts";
import { gate as routeImportsNoFeature } from "../../../../tooling/src/verify/gates/route-imports-no-feature.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES = "tooling/src/verify/gates";
const CLI_TIMEOUT_MS = scaledBudget(120_000);

/** What the stage COUNTS for one policy: both proof arms. Read off the policy so a lane adding a row to a
 *  shimmed gate never has to find this file. */
function proofRows(...policies: readonly GatePolicy[]): number {
  return policies.reduce((total, policy) => total + policy.mustFlag.length + policy.mustPass.length, 0);
}

/** A minimal VALID legacy descriptor — the stage's non-subject. */
const LEGACY_GATE =
  'export const gate = { name: "planted-legacy", docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", message: "legacy fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], mustPass: [{ files: "export const good = 1;", why: "fixture" }] };\n';

function realPolicyShim(repoRoot: string, id: string): string {
  return `export { gate } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${id}.ts`)).href)};\n`;
}

/** The planted policy's proof rows, authored ONCE as data and interpolated into its source below — so the
 *  count the stage prints and the count this file asserts cannot drift apart. */
const BROKEN_WHY = "the founding defect that this policy can no longer see";
const BROKEN_MUST_FLAG: readonly GatePolicyProof[] = [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\n" }, why: BROKEN_WHY }];
const BROKEN_MUST_PASS: readonly GatePolicyProof[] = [
  { mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\n" }, why: "nearest legal shape" },
];
const BROKEN_PROOF_ROWS = BROKEN_MUST_FLAG.length + BROKEN_MUST_PASS.length;

/** A final policy whose founding mustFlag row CANNOT bite: the visitor reports nothing, so `mustFlag[0]` is a lie. */
function brokenPolicy(repoRoot: string): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  return `import { defineGate } from ${JSON.stringify(contract)};
export const gate = defineGate({
  id: "planted-broken",
  family: "planted-broken",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: "planted broken policy",
  create: () => ({ evaluate: () => undefined }),
  mustFlag: ${JSON.stringify(BROKEN_MUST_FLAG)},
  mustPass: ${JSON.stringify(BROKEN_MUST_PASS)},
} as never);
`;
}

test("a corpus whose final policies all prove is CLEAN, and the summary names the counts", { timeout: CLI_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    [`${GATES}/baseui-render-prop-composition.ts`]: realPolicyShim(repoRoot, "baseui-render-prop-composition"),
    [`${GATES}/planted-legacy.ts`]: LEGACY_GATE,
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  // The real policy's OWN row count is the denominator; the legacy module is counted, never proven here. The
  // grant table is NOT part of this planted world, so only rows naming loaded policies are judged — none here.
  expect(res.stdout).toContain(
    `policy-conformance: 1 final policies · ${String(proofRows(baseuiRenderProp))} proof rows · 0 refusal rows · 0 failure(s) · 0 grant rows (rows naming loaded policies) · 0 invalid`,
  );
  expect(res.stdout).toContain("(corpus: 2 module(s), 1 legacy proven by gate-conformance)");
});

test("a planted root that carries a REVIEWED-GRANT target judges that policy's rows; one that carries the TABLE judges it whole", {
  timeout: CLI_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  // Arm 1 — a real reviewed-grant policy re-exported into the corpus: its own grant rows are judged and valid.
  const partial = await plantedTree({
    [`${GATES}/route-imports-no-feature.ts`]: realPolicyShim(repoRoot, "route-imports-no-feature"),
  });
  const judged = await runCli("verify", ["policy-conformance"], { cwd: partial, timeoutMs: CLI_TIMEOUT_MS });
  await expect(judged).toExitWith(0);
  expect(judged.stdout).toContain(`1 final policies · ${String(proofRows(routeImportsNoFeature))} proof rows · 0 refusal rows · 0 failure(s) · `);
  expect(judged.stdout).toMatch(/· [1-9]\d* grant rows \(rows naming loaded policies\) · 0 invalid/u);

  // Arm 2 — THE WHOLE-TABLE CONTROL: the same one-policy corpus, but the table's own module is planted under the
  // root (a re-export of the real table), so the table is a member of the corpus being judged and is judged WHOLE.
  // Every row naming a policy this corpus does not hold is an unknown-policy error; the count of invalid rows
  // equals the count of rows naming policies OTHER than the one loaded — the arm reads the equality off the run
  // rather than pinning a table size that moves with every reviewed grant.
  const whole = await plantedTree({
    [`${GATES}/route-imports-no-feature.ts`]: realPolicyShim(repoRoot, "route-imports-no-feature"),
    "tooling/src/verify/lib/reviewed-grants.ts": `export * from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/reviewed-grants.ts")).href)};\n`,
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: whole, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain("· [invalid-grant] · reviewed grant targets an unknown policy:");
  expect(res.stdout).not.toContain("reviewed grant targets an unknown policy: route-imports-no-feature");
  const summary = /(?<rows>\d+) grant rows \(whole table\) · (?<invalid>\d+) invalid/u.exec(res.stdout)?.groups;
  expect(summary).toBeDefined();
  const rows = Number(summary?.["rows"]);
  const invalid = Number(summary?.["invalid"]);
  expect(rows).toBeGreaterThan(invalid);
  expect(invalid).toBe(rows - Number(/(?<own>\d+) grant rows \(rows naming loaded policies\)/u.exec(judged.stdout)?.groups?.["own"]));
  expect(res.stdout).toContain("the checker is broken, not the tree (exit 2)");
});

test("a policy whose own proof fails is a TOOL ERROR naming policy, arm, row index and why", { timeout: CLI_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await plantedTree({
    [`${GATES}/baseui-render-prop-composition.ts`]: realPolicyShim(repoRoot, "baseui-render-prop-composition"),
    [`${GATES}/planted-broken.ts`]: brokenPolicy(repoRoot),
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain(`2 final policies · ${String(proofRows(baseuiRenderProp) + BROKEN_PROOF_ROWS)} proof rows · 0 refusal rows · 1 failure(s)`);
  expect(res.stdout).toContain(`✗ planted-broken · mustFlag[0] · ${BROKEN_WHY}`);
  expect(res.stdout).toContain("expected at least one effective finding but got 0");
  expect(res.stdout).toContain("the checker is broken, not the tree (exit 2)");
});

// ---------------------------------------------------------------------------------------------------
// THE REFUSAL ARM (#1977). `mustRefuse` proves the outcome the other two arms structurally cannot hold — the
// pass REFUSING — because `toolFailure` runs BEFORE the arm verdict, so a designed refusal is neither a
// mustFlag (no finding) nor a mustPass (the owner did not succeed). Both directions are here, because an arm
// that only ever runs green is indistinguishable from one that cannot run: the SAME policy is planted twice,
// differing only in whether the refusal branch exists.
// ---------------------------------------------------------------------------------------------------
const REFUSAL_WHY = "the designed refusal: a policy that cannot read its subject withholds rather than rendering a clean zero";
const REFUSAL_MESSAGE = "PLANTED REFUSAL: this policy cannot read its subject";
const REFUSAL_MUST_FLAG: readonly GatePolicyProof[] = [
  { mode: "source", files: { "tooling/src/proof.ts": "export const bad = 1;\n" }, why: "the ordinary finding this policy reports" },
];
const REFUSAL_MUST_PASS: readonly GatePolicyProof[] = [
  { mode: "source", files: { "tooling/src/proof.ts": "export const good = 1;\n" }, why: "nothing to report" },
];
const REFUSAL_MUST_REFUSE: readonly GatePolicyProof[] = [
  {
    mode: "source",
    files: { "tooling/src/proof.ts": "export const refuse = 1;\n" },
    expect: { messageIncludes: REFUSAL_MESSAGE },
    why: REFUSAL_WHY,
  },
];
const REFUSAL_PROOF_ROWS = REFUSAL_MUST_FLAG.length + REFUSAL_MUST_PASS.length;

/** A policy that reports on `bad` and, in the ARMED variant only, refuses outright on `refuse`. The two
 *  variants differ by exactly that branch, so the mustFlag/mustPass rows hold in both and only the refusal
 *  arm moves. */
function refusingPolicy(repoRoot: string, armed: boolean): string {
  const contract = pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href;
  const refusal = armed ? `if (text.includes("refuse")) { throw new Error(${JSON.stringify(REFUSAL_MESSAGE)}); } ` : "";
  return `import { defineGate } from ${JSON.stringify(contract)};
export const gate = defineGate({
  id: "planted-refusing",
  family: "planted-refusing",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: "planted refusing policy",
  create: (ctx) => ({
    evaluate: () => {
      for (const file of ctx.files) {
        const text = file.getFullText();
        ${refusal}if (text.includes("bad")) { ctx.report.file(ctx.relativePath(file), { token: "bad" }); }
      }
    },
  }),
  mustFlag: ${JSON.stringify(REFUSAL_MUST_FLAG)},
  mustPass: ${JSON.stringify(REFUSAL_MUST_PASS)},
  mustRefuse: ${JSON.stringify(REFUSAL_MUST_REFUSE)},
} as never);
`;
}

test("a mustRefuse row is COUNTED and PROVEN, and the same row goes RED when the policy does not refuse", { timeout: CLI_TIMEOUT_MS }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  // POSITIVE: the refusal branch exists, the row names the refusal TEXT, and the summary counts the arm apart
  // from the other two — a third arm folded into the `proof rows` total would run unmentioned.
  const armed = await plantedTree({ [`${GATES}/planted-refusing.ts`]: refusingPolicy(repoRoot, true) });
  const clean = await runCli("verify", ["policy-conformance"], { cwd: armed, timeoutMs: CLI_TIMEOUT_MS });
  await expect(clean).toExitWith(0);
  expect(clean.stdout).toContain(
    `1 final policies · ${String(REFUSAL_PROOF_ROWS)} proof rows · ${String(REFUSAL_MUST_REFUSE.length)} refusal rows · 0 failure(s)`,
  );

  // NEGATIVE, on a BYTE-IDENTICAL row: without the branch the pass completes, the refusal never happens, and
  // the row must go RED. Without this direction the arm is unfalsifiable by construction.
  const unarmed = await plantedTree({ [`${GATES}/planted-refusing.ts`]: refusingPolicy(repoRoot, false) });
  const red = await runCli("verify", ["policy-conformance"], { cwd: unarmed, timeoutMs: CLI_TIMEOUT_MS });
  await expect(red).toExitWith(2);
  expect(red.stdout).toContain(`✗ planted-refusing · mustRefuse[0] · ${REFUSAL_WHY}`);
  expect(red.stdout).toContain("expected the pass to REFUSE but it completed");
});

test("a corpus with ZERO final policies is a TOOL ERROR — a bare zero is not a conformance verdict", { timeout: CLI_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ [`${GATES}/planted-legacy.ts`]: LEGACY_GATE });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain("0 final policies · 0 proof rows · 0 refusal rows");
  expect(res.stderr).toContain("resolved ZERO final policies");
});
