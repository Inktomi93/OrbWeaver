import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";

function findings(source: string): readonly Finding[] {
  const { project, root } = ctxFor({ [VERB]: source });
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

test("a type-only expected-name export is not a runtime verb factory", () => {
  expect(findings("export type createStartChat = () => void;\n")).toHaveLength(1);
});

test("a non-callable expected-name constant is not a runtime verb factory", () => {
  expect(findings("export const createStartChat = 1;\n")).toHaveLength(1);
});

test("a callable annotation cannot make a non-callable initializer into a verb factory", () => {
  expect(findings("export const createStartChat: () => void = 1 as never;\n")).toHaveLength(1);
});

test("an exported function declaration is a runtime verb factory", () => {
  expect(findings("export function createStartChat() { return () => undefined; }\n")).toEqual([]);
});

test("an exported arrow function is a runtime verb factory", () => {
  expect(findings("export const createStartChat = () => () => undefined;\n")).toEqual([]);
});

test("an exported alias of a callable runtime value is a verb factory", () => {
  expect(findings("function buildStartChat() { return () => undefined; }\nexport const createStartChat = buildStartChat;\n")).toEqual([]);
});
