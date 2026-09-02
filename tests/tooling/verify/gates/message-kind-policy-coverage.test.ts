// message-kind-policy-coverage (#947) — the axis set is the RESOLVED interface type's properties, so an
// axis inherited from an imported base is still law that owes a production reader. Conformance pins the
// inherited red/green pair; this file pins the REFUSAL, which conformance structurally cannot (a throwing
// example is a failed proof, not a proven refusal).
import { gate } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const HOME = "packages/contracts/src/chat/participants.ts";

function passOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPass> {
  const { project, root } = ctxFor({ ...files });
  return runPass([gate], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
}

test("an `extends` clause that resolves to no interface REFUSES instead of judging a smaller axis set", () => {
  const pass = passOf({
    [HOME]:
      "export interface MessageKindPolicy extends MissingBase {\n  readonly prompt: 'conversation' | 'never';\n}\nexport const MESSAGE_KIND_POLICY = {};\n",
  });
  expect(pass.toolErrors[0]?.message).toContain("resolves to no interface declaration");
});

test("the local/inherited/total axis population rides the scan line, so a base that stopped resolving is visible", () => {
  const pass = passOf({
    "packages/contracts/src/chat/policy-base.ts": "export interface CoreMessageKindPolicy {\n  readonly memory: 'ingest' | 'exclude';\n}\n",
    [HOME]:
      'import type { CoreMessageKindPolicy } from "./policy-base.ts";\n' +
      "export interface MessageKindPolicy extends CoreMessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
      "export const MESSAGE_KIND_POLICY = { standard: { memory: 'ingest', prompt: 'conversation' } };\n",
    "packages/server/src/domain/chat/assembly/shape.ts":
      "export const p = MESSAGE_KIND_POLICY.standard.prompt;\nexport const m = MESSAGE_KIND_POLICY.standard.memory;\n",
  });
  expect(pass.gates[0]?.scan.declared?.unit).toBe("policy axis [MessageKindPolicy local=1 inherited=1 total=2]");
});
