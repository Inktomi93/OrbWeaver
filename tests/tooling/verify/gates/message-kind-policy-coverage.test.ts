// message-kind-policy-coverage (#947, #1584) — the axis set is the RESOLVED interface type's properties,
// so an axis inherited from an imported base is still law that owes a production reader. Conformance pins
// the inherited red/green pair; this file pins what conformance structurally cannot: the REFUSALS, where a
// throwing or withheld owner is a failed proof rather than a proven refusal.
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/message-kind-policy";
const HOME = "packages/contracts/src/chat/participants.ts";

function passOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("an `extends` clause that resolves to no interface REFUSES instead of judging a smaller axis set", () => {
  const result = passOf({
    [HOME]:
      "export interface MessageKindPolicy extends MissingBase {\n  readonly prompt: 'conversation' | 'never';\n}\nexport const MESSAGE_KIND_POLICY = {};\n",
  });

  expect(result.toolErrors).toMatchObject([
    { policyId: "message-kind-policy-coverage", message: expect.stringContaining("resolves to no interface declaration") },
  ]);
  expect(result.authority.withheldPolicyIds).toEqual(["message-kind-policy-coverage"]);
});

test("the axis receipt is the policy's denominator, so a base that stopped resolving is visible as a shrink", () => {
  const result = passOf({
    "packages/contracts/src/chat/policy-base.ts": "export interface CoreMessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n",
    [HOME]:
      'import type { CoreMessageKindPolicy } from "./policy-base.ts";\n' +
      "export interface MessageKindPolicy extends CoreMessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
      "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest', prompt: 'conversation' } };\n",
    "packages/server/src/domain/chat/assembly/shape.ts":
      'import { MESSAGE_KIND_POLICY } from "../../../../../contracts/src/chat/participants.ts";\nexport const p = MESSAGE_KIND_POLICY.standard.prompt;\nexport const m = MESSAGE_KIND_POLICY.standard.memory;\n',
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.receipts).toEqual([{ kind: "population", source: "MessageKindPolicy axis", members: 2, unresolved: 0 }]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a renamed record or interface takes the denominator to zero and withholds the verdict", () => {
  const result = passOf({
    [HOME]:
      "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\nexport const KIND_POLICY = { standard: { prompt: 'conversation' } };\n",
  });

  // The legacy gate raised its own mode-B finding against a real-tree ANCHOR FILE. The final runtime owns
  // that blindness directly: an empty denominator cannot render a clean pass.
  expect(result.toolErrors).toMatchObject([{ policyId: "message-kind-policy-coverage", phase: "receipt", message: expect.stringContaining("zero members") }]);
  expect(result.authority.withheldPolicyIds).toEqual(["message-kind-policy-coverage"]);
});

test("a type alias does not replace the declared-interface heritage requirement", () => {
  const result = passOf({
    [HOME]:
      "interface Base { readonly prompt: 'conversation' | 'never'; } type Alias = Base; export interface MessageKindPolicy extends Alias {} export const MESSAGE_KIND_POLICY = {};",
  });
  expect(result.toolErrors).toMatchObject([
    { policyId: "message-kind-policy-coverage", message: expect.stringContaining("resolves to no interface declaration") },
  ]);
  expect(result.authority.withheldPolicyIds).toEqual(["message-kind-policy-coverage"]);
});

test("merged interface declarations retain every inherited policy axis", () => {
  const result = passOf({
    [HOME]:
      "interface Base { readonly prompt: 'conversation' | 'never'; } interface Base { readonly wire: 'carry' | 'drop'; } export interface MessageKindPolicy extends Base {} export const MESSAGE_KIND_POLICY = {};",
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map((finding) => finding.token).sort()).toEqual(["prompt", "wire"]);
});
