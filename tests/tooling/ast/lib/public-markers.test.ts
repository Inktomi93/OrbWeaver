import type { VariableDeclaration } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import { isPublicTagged, publicMarkerOf } from "../../../../tooling/src/ast/lib/public-markers.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function declarationOf(comment: string): VariableDeclaration {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/repo/subject.ts", `${comment}\nexport const subject = true;\n`);
  return source.getVariableDeclarationOrThrow("subject");
}

describe("public marker grammar", () => {
  test.each([
    ["/** @public retained compatibility surface. */", { kind: "bare", reason: "retained compatibility surface." }],
    ["/** @public twin: SubjectValue public type face. */", { kind: "twin", value: "SubjectValue" }],
    ["/** @public future: upcoming admin surface. */", { kind: "future", reason: "upcoming admin surface." }],
    ["// @public-twin: SubjectValue legacy line spelling", { kind: "twin", value: "SubjectValue" }],
    ["// @public-future: upcoming admin surface.", { kind: "future", reason: "upcoming admin surface." }],
  ])("parses named and reasoned markers: %s", (comment, marker) => {
    const declaration = declarationOf(comment);
    expect(publicMarkerOf(declaration)).toEqual(marker);
    expect(isPublicTagged(declaration)).toBe(true);
  });

  test.each(["/** @public */", "// @public", "/** unrelated comment */"])("rejects an empty or absent marker: %s", (comment) => {
    const declaration = declarationOf(comment);
    expect(publicMarkerOf(declaration)).toBeUndefined();
    expect(isPublicTagged(declaration)).toBe(false);
  });

  test("requires an @public token while retaining unknown legacy reason text", () => {
    const publicity = declarationOf("/** @publicity campaign */");
    expect(publicMarkerOf(publicity)).toBeUndefined();
    expect(isPublicTagged(publicity)).toBe(false);

    const legacyReason = declarationOf("/** @public unknown: retained pending classification. */");
    expect(publicMarkerOf(legacyReason)).toEqual({ kind: "bare", reason: "unknown: retained pending classification." });
    expect(isPublicTagged(legacyReason)).toBe(true);
  });

  test("reads a variable declaration marker from its VariableStatement comment host", () => {
    const declaration = declarationOf("/** @public future: variable-statement attachment. */");
    expect(publicMarkerOf(declaration)).toEqual({ kind: "future", reason: "variable-statement attachment." });
  });
});
