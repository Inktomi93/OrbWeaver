// Family test for `serde-core-definition-uniqueness`, a declared singleton: one canonical home for the three
// serde-core mapper symbols. It owns the production-dispatched proof triple (`verifyPolicyProofs`) plus the
// controls a `mustFlag`/`mustPass` row cannot express on its own, driven through `runPolicyPass` directly.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as serdeCoreDefinitionUniqueness } from "../../../../tooling/src/verify/gates/serde-core-definition-uniqueness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/principal-serde-family";

test("the serde-core policy passes its production proof runtime", () => {
  expect(verifyPolicyProofs([serdeCoreDefinitionUniqueness])).toEqual([]);
});

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("a second `cardFromJson` declaration in @server outside the canonical home is flagged", () => {
  const result = passOf(serdeCoreDefinitionUniqueness, {
    "packages/server/src/domain/import/substrate/dup.ts": "export function cardFromJson(raw: unknown): unknown { return raw; }\n",
    "packages/server/src/primitives/serde/card/index.ts":
      "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([
    { policyId: "serde-core-definition-uniqueness", file: "packages/server/src/domain/import/substrate/dup.ts" },
  ]);
});

test("a same-named `cardFromJson` declared in packages/kit is OUT OF POPULATION — the policy is scoped to @server and never reads it", () => {
  // This is not a clean pass because the second declaration is fine; it is a clean pass because this
  // policy's declared population is `@server` and the kit file is never admitted for it to read.
  // `serde-core-seal` (a different gate) is what would judge a kit-side fork, not this one.
  const result = passOf(serdeCoreDefinitionUniqueness, {
    "packages/server/src/primitives/serde/card/index.ts":
      "export function cardFromJson(raw: unknown, fallbackName: string): unknown { return raw; }\nexport function cardContentHash(): string { return ''; }\nexport function buildCardV3(): unknown { return {}; }\n",
    "packages/kit/src/serde/card.ts": "export function cardFromJson(raw: unknown): unknown { return raw; }\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
