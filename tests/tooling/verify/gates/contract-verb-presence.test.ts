import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const CONTRACT = "packages/server/src/domain/hub/contract/service.ts";
const TEST = "tests/server/domain/hub/x.test.ts";

function findings(testSource: string): readonly Finding[] {
  const { project, root } = ctxFor({
    [CONTRACT]: "export interface HubService { readonly coveredVerb: () => void; }\n",
    [TEST]: testSource,
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

test("a verb destructured from a service factory is coverage", () => {
  expect(findings("const { coveredVerb } = createHubService(ctx);\ncoveredVerb();\n")).toEqual([]);
});

test("the verb factory invocation is coverage", () => {
  expect(findings("const run = createCoveredVerb(ctx);\nawait run();\n")).toEqual([]);
});
