import type { CoordinatedGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const CONTRACT = "packages/server/src/domain/hub/contract/service.ts";
const TEST = "tests/server/domain/hub/x.test.ts";

function findings(testSource: string, extraFiles: Readonly<Record<string, string>> = {}): readonly CoordinatedGateFinding[] {
  const { project, root } = ctxFor({
    [CONTRACT]: "export interface HubService { readonly coveredVerb: () => void; }\n",
    [TEST]: testSource,
    ...extraFiles,
  });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  return result.authority.effectiveFindings;
}

test("a same-named bare helper call is not service coverage", () => {
  expect(findings("function coveredVerb() {}\ncoveredVerb();\n")).toHaveLength(1);
});

test("a service method invocation is coverage", () => {
  expect(findings("const service = createHubService(ctx);\nservice.coveredVerb();\n")).toEqual([]);
});

test("a same-named method on an unrelated receiver is not service coverage", () => {
  expect(findings("logger.coveredVerb();\n")).toHaveLength(1);
});

test("an alias of an assembled service retains coverage identity", () => {
  expect(findings("const service = createHubService(ctx);\nconst api = service;\napi.coveredVerb();\n")).toEqual([]);
});

test("a service carried on a typed fixture retains its contract identity", () => {
  expect(
    findings(
      'import type { HubService } from "../../../../packages/server/src/domain/hub/contract/service.ts";\ndeclare const fixture: { readonly svc: HubService };\nfixture.svc.coveredVerb();\n',
    ),
  ).toEqual([]);
});

test("a domain verb-bundle factory carries service coverage", () => {
  expect(
    findings('import { createHubReads } from "../../../../packages/server/src/domain/hub/verbs/reads.ts";\ncreateHubReads().coveredVerb();\n', {
      "packages/server/src/domain/hub/verbs/reads.ts": "export function createHubReads() { return { coveredVerb: (): void => undefined }; }\n",
    }),
  ).toEqual([]);
});

test("a domain verb bundle carried on a fixture retains its factory property identity", () => {
  expect(
    findings(
      'import { createHubReads } from "../../../../packages/server/src/domain/hub/verbs/reads.ts";\ndeclare const fixture: { readonly reads: ReturnType<typeof createHubReads> };\nfixture.reads.coveredVerb();\n',
      {
        "packages/server/src/domain/hub/verbs/reads.ts": "export function createHubReads() { return { coveredVerb: (): void => undefined }; }\n",
      },
    ),
  ).toEqual([]);
});

test("a verb destructured from a service factory is coverage", () => {
  expect(findings("const { coveredVerb } = createHubService(ctx);\ncoveredVerb();\n")).toEqual([]);
});

test("the verb factory invocation is coverage", () => {
  expect(findings("const run = createCoveredVerb(ctx);\nawait run();\n")).toEqual([]);
});

// ── #943: members are RESOLVED, not local ───────────────────────────────────────────────────────────────
// `WorkloadService extends WorkloadScheduleService` put five live verbs behind an imported base, and a
// local-`getMembers()` reader dropped every one of them while the workspace scan stayed healthy. Removing
// all five behavioral schedule tests left the gate GREEN.
const BASE = "packages/server/src/domain/hub/contract/verbs.ts";

function passOf(files: Readonly<Record<string, string>>): PolicyPassResult {
  const { project, root } = ctxFor(files);
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
}

function inheritedCase(testSource: string, baseMember = "inherited(): void;"): PolicyPassResult {
  return passOf({
    [BASE]: `export interface HubVerbService {\n  ${baseMember}\n}\n`,
    [CONTRACT]: 'import type { HubVerbService } from "./verbs.ts";\nexport interface HubService extends HubVerbService {\n  local(): void;\n}\n',
    [TEST]: testSource,
  });
}

test("a verb inherited from an imported base is still an obligation, and the finding names its declaring interface", () => {
  const found = inheritedCase("const service = createHubService(ctx);\nservice.local();\n").authority.effectiveFindings;
  expect(found).toHaveLength(1);
  expect(found[0]?.message).toContain("hub.inherited (declared on HubVerbService)");
});

test("an inherited verb WITH behavioral coverage passes — resolving members widens the obligation, not the accusation", () => {
  expect(inheritedCase("const service = createHubService(ctx);\nservice.local();\nservice.inherited();\n").authority.effectiveFindings).toEqual([]);
});

test("an inherited member that is not verb-shaped contributes nothing to the denominator", () => {
  expect(inheritedCase("const service = createHubService(ctx);\nservice.local();\n", "readonly notAVerb: string;").authority.effectiveFindings).toEqual([]);
});

test("the local/inherited/total population rides the scan line, so a base that stopped resolving is visible", () => {
  const receipts = inheritedCase("const service = createHubService(ctx);\nservice.local();\nservice.inherited();\n").policies[0]?.receipts;
  expect(receipts).toContainEqual({ kind: "population", source: "service-verbs[interfaces=1;local=1;inherited=1]", members: 2, unresolved: 0 });
});

test("an `extends` clause that resolves to no interface REFUSES loudly instead of judging a smaller member set", () => {
  const pass = passOf({
    [CONTRACT]: "export interface HubService extends MissingBase {\n  local(): void;\n}\n",
    [TEST]: "export const q = 1;\n",
  });
  expect(pass.toolErrors).toContainEqual(
    expect.objectContaining({ policyId: gate.id, phase: "evaluate", message: expect.stringContaining("resolves to no interface declaration") }),
  );
  expect(pass.authority.effectiveFindings).toEqual([]);
  expect(pass.authority.withheldPolicyIds).toEqual([gate.id]);
});
