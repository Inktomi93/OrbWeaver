// The public conformance stage runs bounded planted policies and distinguishes failures, refusals and zero rosters.
// Its ordinary premise is owned here; a production policy retirement cannot silently change that premise.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { GatePolicy, GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as testsRawPackageReach } from "../../../../tooling/src/verify/gates/tests-raw-package-reach.ts";
import { policyGrantIdentityRowCount } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ORDINARY_MUST_FLAG, ORDINARY_MUST_PASS, ORDINARY_POLICY, ordinaryPolicyModule } from "./_ordinary-policy-fixture.ts";

const GATES = "tooling/src/verify/gates";
const CLI_TIMEOUT_MS = scaledBudget(120_000);

/** What the stage COUNTS for one policy: both proof arms. Read off the policy so a lane adding a row to a
 *  shimmed gate never has to find this file. */
function proofRows(...policies: readonly GatePolicy[]): number {
  return policies.reduce((total, policy) => total + policy.mustFlag.length + policy.mustPass.length, 0);
}

/** The reviewed-grant identity witnesses the stage counts APART from the proof rows (#2189) — derived off the
 *  policies for the same reason every other count here is, so annotating a shimmed gate never edits this file. */
function identityRows(...policies: readonly GatePolicy[]): number {
  return policies.reduce((total, policy) => total + policyGrantIdentityRowCount(policy), 0);
}

/** A gate-directory module that exports no `gate` at all — the stage's non-subject. The loader records it as
 *  UNREGISTERED (never swallowed, #410) and the stage counts it in the corpus without proving it. */
const UNREGISTERED_MODULE = "export const notAGate = 1;\n";

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

test("a corpus whose policies all prove is CLEAN, and the summary names the counts", { timeout: CLI_TIMEOUT_MS }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await plantedTree({
    [`${GATES}/${ORDINARY_POLICY}.ts`]: ordinaryPolicyModule(repoRoot),
    [`${GATES}/planted-unregistered.ts`]: UNREGISTERED_MODULE,
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  // The planted policy's OWN row count is the denominator; the unregistered module is counted, never proven. The
  // grant table is NOT part of this planted world, so only rows naming loaded policies are judged — none here.
  expect(res.stdout).toContain(
    `policy-conformance: 1 policies · ${String(ORDINARY_MUST_FLAG.length + ORDINARY_MUST_PASS.length)} proof rows · 0 refusal rows · ${String(0)} identity-proof rows · 0 failure(s) · 0 grant rows (rows naming loaded policies) · 0 invalid`,
  );
  expect(res.stdout).toContain("(corpus: 2 module(s), 1 unregistered)");
});

test("a planted root that carries a REVIEWED-GRANT target judges that policy's rows; one that carries the TABLE judges it whole", {
  timeout: CLI_TIMEOUT_MS,
}, async ({ plantedTree, repoRoot, runCli }) => {
  // Arm 1 — a real reviewed-grant policy re-exported into the corpus: its own grant rows are judged and valid.
  const partial = await plantedTree({
    [`${GATES}/tests-raw-package-reach.ts`]: realPolicyShim(repoRoot, "tests-raw-package-reach"),
  });
  const judged = await runCli("verify", ["policy-conformance"], { cwd: partial, timeoutMs: CLI_TIMEOUT_MS });
  await expect(judged).toExitWith(0);
  expect(judged.stdout).toContain(
    `1 policies · ${String(proofRows(testsRawPackageReach))} proof rows · 0 refusal rows · ${String(identityRows(testsRawPackageReach))} identity-proof rows · 0 failure(s) · `,
  );
  expect(judged.stdout).toMatch(/· [1-9]\d* grant rows \(rows naming loaded policies\) · 0 invalid/u);

  // Arm 2 — THE WHOLE-TABLE CONTROL: the same one-policy corpus, but the table's own module is planted under the
  // root (a re-export of the real table), so the table is a member of the corpus being judged and is judged WHOLE.
  // Every row naming a policy this corpus does not hold is an unknown-policy error; the count of invalid rows
  // equals the count of rows naming policies OTHER than the one loaded — the arm reads the equality off the run
  // rather than pinning a table size that moves with every reviewed grant.
  const whole = await plantedTree({
    [`${GATES}/tests-raw-package-reach.ts`]: realPolicyShim(repoRoot, "tests-raw-package-reach"),
    "tooling/src/verify/lib/reviewed-grants.ts": `export * from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/reviewed-grants.ts")).href)};\n`,
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: whole, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain("· [invalid-grant] · reviewed grant targets an unknown policy:");
  expect(res.stdout).not.toContain("reviewed grant targets an unknown policy: tests-raw-package-reach");
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
    [`${GATES}/${ORDINARY_POLICY}.ts`]: ordinaryPolicyModule(repoRoot),
    [`${GATES}/planted-broken.ts`]: brokenPolicy(repoRoot),
  });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain(
    `2 policies · ${String(ORDINARY_MUST_FLAG.length + ORDINARY_MUST_PASS.length + BROKEN_PROOF_ROWS)} proof rows · 0 refusal rows · ${String(0)} identity-proof rows · 1 failure(s)`,
  );
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
    `1 policies · ${String(REFUSAL_PROOF_ROWS)} proof rows · ${String(REFUSAL_MUST_REFUSE.length)} refusal rows · 0 identity-proof rows · 0 failure(s)`,
  );

  // NEGATIVE, on a BYTE-IDENTICAL row: without the branch the pass completes, the refusal never happens, and
  // the row must go RED. Without this direction the arm is unfalsifiable by construction.
  const unarmed = await plantedTree({ [`${GATES}/planted-refusing.ts`]: refusingPolicy(repoRoot, false) });
  const red = await runCli("verify", ["policy-conformance"], { cwd: unarmed, timeoutMs: CLI_TIMEOUT_MS });
  await expect(red).toExitWith(2);
  expect(red.stdout).toContain(`✗ planted-refusing · mustRefuse[0] · ${REFUSAL_WHY}`);
  expect(red.stdout).toContain("expected the pass to REFUSE but it completed");
});

test("a corpus with ZERO policies is a TOOL ERROR — a bare zero is not a conformance verdict", { timeout: CLI_TIMEOUT_MS }, async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ [`${GATES}/planted-unregistered.ts`]: UNREGISTERED_MODULE });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain("0 policies · 0 proof rows · 0 refusal rows");
  expect(res.stderr).toContain("resolved ZERO policies");
});
