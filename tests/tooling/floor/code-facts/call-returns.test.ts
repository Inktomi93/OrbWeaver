// `readCallReturns` answers with a fact: every return of a reachable factory, or a refusal that says why. An empty
// list never stands in for an unreadable factory.

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { CallExpression, Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import {
  observeCallReturns,
  readCallReturnProgram,
  readCallReturns,
  readObservedCallableConsumers,
} from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { beginReferencePass, endReferencePass, isDocumentationLinkReference } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

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

const DOCUMENTED_CALLABLES = [
  { tag: "link", escape: false },
  { tag: "linkcode", escape: false },
  { tag: "linkplain", escape: false },
  { tag: "link", escape: true },
] as const;

for (const scenario of DOCUMENTED_CALLABLES) {
  test(`native callable documentation ${scenario.tag} with code escape ${scenario.escape}`, async ({ plantedTree, repoRoot }) => {
    const root = await plantedTree({
      "package.json": '{"type":"module"}',
      ".gitignore": "node_modules\n",
      "tsconfig.base.json": JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"] },
      }),
      "packages/server/tsconfig.json": '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
      "packages/server/src/consumer.ts": `
        function factory(value: string) { return value; }
        /** Reference {@${scenario.tag} factory}. */
        export function documented() { return 'documentation'; }
        export const selected = factory('native');
        ${scenario.escape ? "/** @type {Array<typeof factory>} */ export const escaped = [factory];" : ""}
      `,
    });
    symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
    execFixtureGit(root, ["init", "--quiet", "--template="]);
    const source = createSemanticWorkspace({ root }).program("packages/server/tsconfig.json")?.sourceFile("packages/server/src/consumer.ts");
    if (source === undefined) {
      throw new Error("the native documented callable world omitted its source");
    }
    const factory = source.getFunctionOrThrow("factory");
    const call = source.getVariableDeclarationOrThrow("selected").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression);
    beginReferencePass();
    try {
      const references = factory.findReferencesAsNodes();
      expect(source.getPreEmitDiagnostics()).toEqual([]);
      expect(references.some(isDocumentationLinkReference)).toBe(true);
      const observations = observeCallReturns([call], references);
      const captured = readCallReturnProgram(call, observations);
      expect(captured.kind).toBe("resolved");
      if (captured.kind === "unresolved") {
        throw new Error(captured.detail);
      }
      expect(captured.value.referencesObserved).toBe(true);
      expect(captured.value.escapingReferences.has(factory.compilerNode)).toBe(scenario.escape);
      const consumers = readObservedCallableConsumers(factory, captured.value);
      expect(consumers.kind, consumers.kind === "unresolved" ? consumers.detail : "").toBe(scenario.escape ? "unresolved" : "resolved");
    } finally {
      endReferencePass();
    }
  });
}
