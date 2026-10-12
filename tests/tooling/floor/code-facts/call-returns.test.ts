// `readCallReturns` answers with a fact: every return of a reachable factory, or a refusal that says why. An empty
// list never stands in for an unreadable factory.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { readCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";

function callIn(code: string, name: string): CallExpression {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile("/repo/use.ts", code);
  return sf.getVariableDeclarationOrThrow(name).getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
}

function returnsOf(call: CallExpression): readonly string[] | string {
  const returns = readCallReturns(call);
  return returns.kind === "resolved" ? returns.value.map((node: Node) => node.getText()) : returns.detail;
}

test("readCallReturns hands back every return of a local factory and refuses an unreachable one", () => {
  const code = `
    function two(flag: boolean) {
      if (flag) { return { a: 1 }; }
      return { b: 2 };
    }
    export const both = two(true);
    export const missing = notDeclaredAnywhere();
  `;

  expect(returnsOf(callIn(code, "both"))).toEqual(["{ a: 1 }", "{ b: 2 }"]);
  expect(readCallReturns(callIn(code, "missing")).kind).toBe("unresolved");
});

test("readCallReturns enters a const-bound arrow and refuses a function that returns nothing", () => {
  const code = "const wrap = (x: number) => ({ x });\nfunction nothing() { return; }\nexport const arrow = wrap(1);\nexport const empty = nothing();\n";

  expect(returnsOf(callIn(code, "arrow"))).toEqual(["({ x })"]);
  expect(returnsOf(callIn(code, "empty"))).toContain("returns no expression");
});
