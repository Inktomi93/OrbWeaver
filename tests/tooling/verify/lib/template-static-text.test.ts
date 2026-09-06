// The half of a template literal that CANNOT vary, kept apart from the half that can. Both directions are
// planted: quasis carry authored text even when a hole sits between them, a hole's own text is never read
// as authored, and a node that is not a template answers null rather than a fabricated empty string.
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { readStaticTextOf, readTemplateSkeleton } from "../../../../tooling/src/verify/lib/template-static-text.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

/** The initializer of the declaration named `q` — never `getFirstDescendantByKind`, which would hand back
 *  whichever helper const the fixture declares FIRST and quietly assert about the wrong node. */
function initializerOf(source: string): Node {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(`${ROOT}/use.ts`, source);
  return file.getVariableDeclarationOrThrow("q").getInitializerOrThrow();
}

test("a no-substitution template is one quasi and no holes", () => {
  const skeleton = readTemplateSkeleton(initializerOf("const q = `length(value) <= 64`;\n"));

  expect(skeleton).toMatchObject({ quasis: ["length(value) <= 64"], staticText: "length(value) <= 64" });
  expect(skeleton?.holes).toHaveLength(0);
});

test("quasis and holes come back APART, in order, with one more quasi than holes", () => {
  const skeleton = readTemplateSkeleton(initializerOf("const CAP = 64;\nconst q = `length(value) <= ${CAP} and 1 = ${CAP}`;\n"));

  expect(skeleton?.quasis).toEqual(["length(value) <= ", " and 1 = ", ""]);
  expect(skeleton?.holes.map((hole) => hole.getText())).toEqual(["CAP", "CAP"]);
  // The interpolation is REMOVED from the static text: a needle inside a hole is a runtime fact, and
  // reading it as authored would be a confident false positive.
  expect(skeleton?.staticText).toBe("length(value) <=  and 1 = ");
});

test("a wrapped template is unwrapped through the shared reader", () => {
  expect(readTemplateSkeleton(initializerOf("const q = (`a` as string);\n"))?.staticText).toBe("a");
});

test("a TAGGED template is NOT a template node — the caller must hand over its `.getTemplate()`", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    `${ROOT}/use.ts`,
    "declare function sql(parts: TemplateStringsArray, ...values: unknown[]): string;\nconst CAP = 64;\nconst q = sql`length(value) <= ${CAP}`;\n",
  );
  const tagged = file.getFirstDescendantByKindOrThrow(SyntaxKind.TaggedTemplateExpression);

  // The tag carries the identity (which module the template builder came from) and the TEMPLATE carries the
  // text; conflating them would read `sql` as authored SQL. Passing the tagged node answers null on purpose.
  expect(readTemplateSkeleton(tagged)).toBeNull();
  expect(readTemplateSkeleton(tagged.getTemplate())).toMatchObject({ quasis: ["length(value) <= ", ""], staticText: "length(value) <= " });
});

test("a node that carries no authored template answers null, never an empty skeleton", () => {
  expect(readTemplateSkeleton(initializerOf('const q = "plain";\n'))).toBeNull();
  expect(readTemplateSkeleton(initializerOf("declare function build(): string;\nconst q = build();\n"))).toBeNull();
});

test("readStaticTextOf prefers a resolved static string, and falls back to the quasis", () => {
  expect(readStaticTextOf(initializerOf('const q = "reports/snaps/x.png";\n'))).toBe("reports/snaps/x.png");
  // A binding hop still resolves through the shared static reader.
  expect(readStaticTextOf(initializerOf('const OUT = "reports/snaps/x.png";\nconst q = OUT;\n'))).toBe("reports/snaps/x.png");
  // A template with a dynamic filename keeps its authored prefix.
  expect(readStaticTextOf(initializerOf("declare const name: string;\nconst q = `reports/ct-shots/${name}.png`;\n"))).toBe("reports/ct-shots/.png");
});

test("readStaticTextOf answers null for a genuinely dynamic value", () => {
  expect(readStaticTextOf(initializerOf("declare const someVar: string;\nconst q = someVar;\n"))).toBeNull();
});
