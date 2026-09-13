import { Project, SyntaxKind } from "ts-morph";
import { testNarrationSpans } from "../../../../tooling/src/verify/lib/test-narration.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function spans(source: string): string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile("/narration.ts", source);
  return file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .flatMap(testNarrationSpans)
    .map(({ pos, end }) => source.slice(pos, end));
}

test("only test titles and the expect message are narration", () => {
  expect(spans('test.describe.serial("#483 title", () => expect("#abc", "#424 message").toBe("#def"));')).toEqual(['"#483 title"', '"#424 message"']);
  expect(spans('render("#abc");')).toEqual([]);
});

test("template literal chunks are prose while interpolated color values remain code", () => {
  const source = 'test(`the #483 seal ${"#abc"} done`, () => {});';
  const prose = spans(source);
  expect(prose).toEqual(["`the #483 seal ${", "} done`"]);
  expect(prose.join("")).not.toContain('"#abc"');
});

test("zero-argument and computed calls remain outside the declared narration grammar", () => {
  expect(spans('test(); expect(); test["only"]("#483", () => {});')).toEqual([]);
});
