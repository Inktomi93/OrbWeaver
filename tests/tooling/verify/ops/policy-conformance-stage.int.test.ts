// The WHOLE-CORPUS CONFORMANCE STAGE (#1941; docs/design/gate-runtime-standardization.md §5 item 3) at the door
// it is driven through — `cli.ts policy-conformance` over planted roots — so the exit classes and the failure lines
// are proven where a reader meets them. Three arms, each the other's control: a REAL final policy re-exported into
// a planted corpus proves clean (0); a planted policy whose founding row cannot bite proves exit 2 naming policy,
// arm, row index and why; a legacy-only corpus proves the bare-zero refusal (2, never a clean 0).
//
// The re-export shim imports the REAL module by absolute file URL, so the descriptor the stage runs is the
// production-branded object (the loader's identity law refuses a copy) and the shim's basename is the policy id
// (the filename law).
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const GATES = "tooling/src/verify/gates";
const CLI_TIMEOUT_MS = scaledBudget(120_000);

/** A minimal VALID legacy descriptor — the stage's non-subject. */
const LEGACY_GATE =
  'export const gate = { name: "planted-legacy", docRow: "test-owned", status: "active", scopeSafety: "incremental-safe", message: "legacy fixture", visitFile() {}, mustFlag: [{ files: "export const bad = 1;", why: "fixture" }], mustPass: [{ files: "export const good = 1;", why: "fixture" }] };\n';

function realPolicyShim(repoRoot: string, id: string): string {
  return `export { gate } from ${JSON.stringify(pathToFileURL(join(repoRoot, GATES, `${id}.ts`)).href)};\n`;
}

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
  mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const planted = true;\\n" }, why: "the founding defect that this policy can no longer see" }],
  mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const clean = true;\\n" }, why: "nearest legal shape" }],
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
  // The real policy carries 4 mustFlag + 4 mustPass rows; the legacy module is counted, never proven here.
  expect(res.stdout).toContain("policy-conformance: 1 final policies · 8 proof rows · 0 failure(s)");
  expect(res.stdout).toContain("(corpus: 2 module(s), 1 legacy proven by gate-conformance)");
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
  expect(res.stdout).toContain("2 final policies · 10 proof rows · 1 failure(s)");
  expect(res.stdout).toContain("✗ planted-broken · mustFlag[0] · the founding defect that this policy can no longer see");
  expect(res.stdout).toContain("expected at least one effective finding but got 0");
  expect(res.stdout).toContain("the checker is broken, not the tree (exit 2)");
});

test("a corpus with ZERO final policies is a TOOL ERROR — a bare zero is not a conformance verdict", { timeout: CLI_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ [`${GATES}/planted-legacy.ts`]: LEGACY_GATE });
  const res = await runCli("verify", ["policy-conformance"], { cwd: root, timeoutMs: CLI_TIMEOUT_MS });
  await expect(res).toExitWith(2);
  expect(res.stdout).toContain("0 final policies · 0 proof rows");
  expect(res.stderr).toContain("resolved ZERO final policies");
});
