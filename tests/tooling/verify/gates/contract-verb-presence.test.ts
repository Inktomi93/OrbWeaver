import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const CONTRACT = "packages/server/src/domain/hub/contract/service.ts";
const TEST = "tests/server/domain/hub/x.test.ts";

function findings(testSource: string, extraFiles: Readonly<Record<string, string>> = {}): readonly Finding[] {
  const { project, root } = ctxFor({
    [CONTRACT]: "export interface HubService { readonly coveredVerb: () => void; }\n",
    [TEST]: testSource,
    ...extraFiles,
  });
  return (
    runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    }).gates[0]?.findings ?? []
  );
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
