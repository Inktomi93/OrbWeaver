// structured-plan-one-home's family floor: its declared proofs pass the production runtime, and the ordinary waiver
// binds to exactly the reported `toolChoice` position (one waived, none effective, no alarm), which a mustPass row
// alone cannot tell apart from a fixture that never flagged.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/structured-plan-one-home.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { WIRE_SCHEMA_ENGINE } from "../../../../tooling/src/verify/lib/wire-schema-vocabulary-fact.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/structured-plan-one-home";
const ENGINE = 'export const STRUCTURED_VEHICLES = ["response-format", "forced-tool", "offered-tool"] as const;\n';
const REASON = "the proof's stand-in reason; ends when this fixture stops flagging.";

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

test("structured-plan-one-home passes its production proof runtime", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("a waiver naming `toolChoice` binds to its one finding", () => {
  const waived = passOf(gate, {
    [WIRE_SCHEMA_ENGINE]: ENGINE,
    "packages/server/src/domain/x/waived.ts": `// @orb-waive structured-plan-one-home(toolChoice): ${REASON}\nexport const request = { toolChoice: { mode: "required" } };\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("a vehicle string inside a comment is not a finding, and the same string in code is", () => {
  const commented = passOf(gate, {
    [WIRE_SCHEMA_ENGINE]: ENGINE,
    "packages/contracts/src/refinery/x.ts": '// the forced-tool vehicle collapses the map ("forced-tool")\nexport const x = 1;\n',
  });
  const spelled = passOf(gate, {
    [WIRE_SCHEMA_ENGINE]: ENGINE,
    "packages/contracts/src/refinery/x.ts": 'export const x = "forced-tool";\n',
  });

  expect(commented.toolErrors).toEqual([]);
  expect(commented.authority.effectiveFindings).toEqual([]);
  expect(spelled.authority.effectiveFindings).toHaveLength(1);
});
