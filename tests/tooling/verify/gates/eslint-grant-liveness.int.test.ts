// The PERMANENT PIN for the `eslint-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). Every native-population shape (a dead file selector, a local ignore with no member inside its
// parent scope, both live twins) is proven through the policy's own `mustFlag`/`mustPass` rows against
// `verifyPolicyProofs` — see `tests/tooling/verify/ops/policy-conformance.test.ts` for the shared harness
// proof. What THIS file keeps is what those isolated resource fixtures cannot show: a MISSING or malformed
// `eslint.config.js` REFUSES the whole run as a population-phase TOOL ERROR — the fail-LOUD requirement is
// now the runtime's own refusal (`resolveResourceDeclarations` throws on a non-ready declared resource),
// which the final proof harness has no "expect a tool error" arm to express.
//
// RETIRED, NOT SUCCEEDED — the old "the real config has only the five ratified zero populations" test
// (`{ repoRoot }` invoking the real policy over the actual `eslint.config.js`). `native-config`'s resolved
// resource population is the WHOLE tracked+untracked repository inventory (`lib/policy-repo-inventory.ts`'s
// `git ls-files` + `git ls-files --others`), not a scoped subset — so any policy declaring it fails
// population resolution at real-repo scope with "ordinary waiver resource population has no exact text
// carrier: <some .md/.css/.json file>" (`lib/policy-pass.ts` `ordinaryWaiverSources`): `resource-host.ts`
// supplies an ordinary-waiver TEXT CARRIER only for the resources it reads as text itself (authoredCss,
// staticConfig, …), never for the incidental thousands of unrelated files a native-config's inventory
// happens to include. This is a resource-host gap for the `native-config` kind, not a defect in this
// policy — `resource-*.ts` under `verify/ops/` is fenced from this lane; see the report for the FORK. Every
// other already-converted resource-analysis policy likewise carries no bespoke real-root int test —
// real-tree correctness for a resource policy is the ORCHESTRATOR'S `pnpm check:structure` floor.
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/eslint-grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a MISSING eslint.config.js refuses the whole run as a population-phase TOOL ERROR", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: scratch, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: gate.id, phase: "population" });
  expect(result.toolErrors[0]?.message).toContain("is missing");
});
