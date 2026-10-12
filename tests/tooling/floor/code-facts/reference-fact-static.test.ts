// staticString / staticNumber: a literal through wrappers, a const or a never-reassigned let; refuses the rest.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { staticNumber, staticString } from "@orb/tooling/floor/code-facts/reference-fact-static";
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";

function elementsIn(code: string): readonly Node[] {
  const sf = new Project({ useInMemoryFileSystem: true }).createSourceFile("/repo/x.ts", code);
  return sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)[0]?.getElements() ?? [];
}

test("staticString sees a literal through wrappers, a const and a never-reassigned let", () => {
  const code =
    'const ROLE = "button";\nconst WRAPPED = "button" as const;\nlet LATE = "button";\nexport const a = ["button", ROLE, WRAPPED, `button`, LATE];\n';
  expect(elementsIn(code).map((e) => staticString(e))).toEqual(["button", "button", "button", "button", "button"]);
});

test("staticString refuses a reassigned let, a dynamic value and a template with a hole", () => {
  expect(elementsIn('let K = "x";\nK = "y";\nexport const a = [K, maybe, compute(), `x${y}`];\n').map((e) => staticString(e))).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});

test("staticNumber reads a bare, a signed and a const-named number, and refuses the rest", () => {
  expect(elementsIn("const GAP = -8;\nexport const a = [8, -8, +8, GAP];\n").map((e) => staticNumber(e))).toEqual([8, -8, 8, -8]);
  expect(elementsIn("let GAP = 8;\nGAP = 9;\nexport const a = [!flag, -x, compute(), GAP];\n").map((e) => staticNumber(e))).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});
