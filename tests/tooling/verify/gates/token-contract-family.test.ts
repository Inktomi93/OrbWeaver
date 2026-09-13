import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TokenRemovalBaseline } from "@orb/ui/token-contract";
import { readTokenContractTexts, readTokenRemovalBaseline, validateTokenContractTexts } from "@orb/ui/token-contract";
import { Project } from "ts-morph";
import { TOKEN_CONTRACT_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { gate as tokensContract } from "../../../../tooling/src/verify/gates/tokens-contract.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const CANONICAL = readTokenContractTexts(join(REPO_ROOT, "packages/ui"));

test("tokens-contract keeps its three-arm proofs", () => {
  expect(verifyPolicyProofs([tokensContract])).toEqual([]);
});

/** THE REMOVAL RATCHET, PINNED FOR THE FIRST TIME (#2183, closing the §5b audit's ledger row 18).
 *
 *  The legacy descriptor gated the ratchet on `resolve(ctx.root) === REPO_ROOT`, and the audit's cut t01
 *  measured that forcing the conditional to `undefined` killed NO proof row: a conformance fixture is not a
 *  Git worktree, so no row could ever reach the branch, and half the gate's stated subject — "a portable
 *  token was removed without a ledger row" — was proven by nothing on either side.
 *
 *  The conversion made the ratchet's other side DATA (`TokenContractResource.removalBaseline`, read by the
 *  provider), which is what makes it testable at all: a baseline can now be PLANTED. A proof row still
 *  cannot do it — `runResourceExample` `git init`s its root and never commits — so these four arms live
 *  here, and they are the whole discriminator set:
 *    1. the plumbing is LIVE on a real worktree (`ready`, not a silently-skipped read);
 *    2. a planted baseline carrying a token the current vault dropped REPORTS it;
 *    3. an UNAVAILABLE baseline is a `removed.baseline` DIAGNOSTIC, never silence;
 *    4. an EMPTY history is silent, which is the arm that keeps every consumer's proof fixtures clean.
 *  Cut any one of the three baseline statuses together and the other two stop discriminating, which is why
 *  all three are asserted rather than sampled. */
function codes(baseline: TokenRemovalBaseline | string | undefined): readonly string[] {
  return validateTokenContractTexts(CANONICAL, baseline).diagnostics.map(({ code }) => code);
}

test("the removal ratchet is LIVE on a real worktree — the baseline resolves rather than being skipped", () => {
  const baseline = readTokenRemovalBaseline(REPO_ROOT);

  expect(baseline.status).toBe("ready");
  // And the canonical vault passes THROUGH it: the ratchet running is not the same claim as the ratchet
  // being satisfied, and a green here is what says the live tree owes no ledger row today.
  expect(codes(baseline)).toEqual([]);
});

test("a token present at the merge base and absent from the vault is reported as an unrecorded removal", () => {
  const previous = JSON.parse(CANONICAL.base) as Record<string, unknown>;
  const spacing = previous["spacing"] as Record<string, unknown>;
  // A portable token the current vault does not carry and `removed.json` does not record. Shaped like its
  // siblings so it survives `tokenPathsFromLegacy`; the assertion is that the RATCHET names it, not that the
  // schema does.
  spacing["ghost-of-a-token"] = { $type: "dimension", $value: { value: 1, unit: "rem" } };

  // BOTH ratchet arms, and the pair is the assertion: a dropped portable token is also a dropped CSS OUTPUT
  // TARGET, and the two are separate ledger sections (`removed` / `removedTargets`) with separate diagnostics.
  // A row asserting only the first would stay green if the target half went dead.
  expect(codes({ status: "ready", mergeBase: "planted", document: previous })).toEqual(["removed.unrecorded", "removed.target.unrecorded"]);
});

test("an UNAVAILABLE baseline is a diagnostic, and an EMPTY history is silent — the two are not one condition", ({ scratch }) => {
  expect(codes({ status: "unavailable", reason: "planted: the history read failed" })).toEqual(["removed.baseline"]);
  expect(codes({ status: "empty", reason: "planted: no commits" })).toEqual([]);
  // The classifier itself, both ways: a directory with no `.git` is EMPTY, never a failed read. This is the
  // arm that decides whether every other consumer's proof fixtures can be clean.
  expect(readTokenRemovalBaseline(scratch).status).toBe("empty");
});

/** THE ROW A PROOF ROW CANNOT BE, and the reason it is owed: cutting `contract.removalBaseline` out of the
 *  policy's `validateTokenContractTexts` call kills NO conformance row, because a `mode: "resource"` fixture's
 *  baseline is `empty` and contributes nothing either way — the §4.1 clean cut that means "no fixture can
 *  reach it", not "nothing enforces it". The discriminating construction is a run against the REAL repo root
 *  (so the provider's git read resolves a merge base) with the vault OVERLAID to drop a token. If the policy
 *  stops handing the baseline to the validator, this test's `removed.unrecorded` disappears. */
test("the policy's own call carries the baseline — a token dropped from the live vault is reported through the POLICY", () => {
  const vault = JSON.parse(CANONICAL.base) as Record<string, unknown>;
  const spacing = vault["spacing"] as Record<string, unknown>;
  const { tight: _dropped, ...withoutTight } = spacing;
  vault["spacing"] = withoutTight;
  const result = runPolicyPass({
    knownPolicies: [tokensContract],
    policies: [tokensContract],
    root: REPO_ROOT,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay: { [TOKEN_CONTRACT_PATHS.base]: `${JSON.stringify(vault, null, 2)}\n` } },
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toContain("removed.unrecorded");
});

test("the policy reaches a verdict on the real bundle and receipts the tokens it measured", ({ scratch }) => {
  // A resource fixture carrying the real bundle: the policy's verdict is clean, the receipt names the token
  // census the validator scanned, and the single declaration is consumed exactly once.
  const overlay = Object.fromEntries(Object.entries(TOKEN_CONTRACT_PATHS).map(([field, path]) => [path, CANONICAL[field as keyof typeof CANONICAL]]));
  for (const [path, content] of Object.entries(overlay)) {
    mkdirSync(join(scratch, path, ".."), { recursive: true });
    writeFileSync(join(scratch, path), content);
  }
  const result = runPolicyPass({
    knownPolicies: [tokensContract],
    policies: [tokensContract],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  const receipts = result.policies.flatMap(({ receipts: rows }) => rows);
  expect(receipts.filter((receipt) => receipt.kind === "resource")).toEqual([{ kind: "resource", source: "token-contract", resources: 7, unresolved: 0 }]);
  expect(receipts.filter((receipt) => receipt.kind === "population").map(({ source }) => source)).toEqual(["tokens-contract"]);
});
