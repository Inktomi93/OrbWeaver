// The PERMANENT PIN for the `eslint-grant-liveness` policy, migrated to the final `defineGate` contract
// (#1930). Every native-population shape (a dead file selector, a local ignore with no member inside its
// parent scope, both live twins) is proven through the policy's own `mustFlag`/`mustPass` rows against
// `verifyPolicyProofs`, which the family conformance test
// `tests/tooling/verify/gates/grant-liveness-family.test.ts` runs. (#1932 correction: this header used to
// cite `tests/tooling/verify/ops/policy-conformance.test.ts` as that harness. It is not — that file proves
// `verifyPolicyProofs` ITSELF against synthetic policies and imports no gate module, so until the family
// test landed, NO committed test executed this policy's proofs.)
// What THIS file keeps is what those isolated resource fixtures cannot show: a MISSING or malformed
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
// MEASURED 2026-09-11 (#1932 lane): this exact policy through `runPolicyPass` at the real repository root
// throws `… no exact text carrier: .codex/agent-doctrine.md` after ~4.2s. The carrier is missing because
// that path is a tracked SYMLINK and `ops/resource-reader.ts` refuses symlink traversal by design, so the
// first trigger on this tree is symlink policy rather than an unsupported text format. The consequence is
// bigger than one retired test: while this holds, NO `native-config` policy can run at repository scope.
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
