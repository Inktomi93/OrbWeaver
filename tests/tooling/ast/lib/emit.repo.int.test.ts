import { collectSchemaTables, loadProject } from "@orb/tooling/ast";
import { Node, SyntaxKind } from "ts-morph";
import { beforeAll } from "vitest";
import { resolveDynamicImportTarget } from "../../../../tooling/src/ast/lib/resolve.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

let project: ReturnType<typeof loadProject>;

beforeAll(() => {
  project = loadProject(true);
});

test("typed AST corpus returns browser declarations in their native DOM world", () => {
  const source = project.getSourceFile("packages/client/src/features/config/lib/theme-contrast.ts");
  const element = source?.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "el");
  expect(element?.getType().getText()).toBe("HTMLSpanElement");
});

test("typed AST corpus discovers the authored schema surface without running the column audit", () => {
  const tables = collectSchemaTables(project);
  expect(tables.length).toBeGreaterThan(0);
  expect(tables.some(({ sqlName }) => sqlName === "rpg_games")).toBe(true);
});

test("typed AST corpus resolves an authored @orb dynamic import through its native checker", () => {
  const source = project.getSourceFile("packages/client/src/features/regex/components/regex-editor-fields.tsx");
  expect(source).toBeDefined();
  if (source === undefined) {
    throw new Error("typed corpus omitted regex-editor-fields.tsx");
  }
  const dynamicImport = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      return false;
    }
    const argument = call.getArguments()[0];
    return argument !== undefined && Node.isStringLiteral(argument) && argument.getLiteralText() === "@orb/ui/code-editor";
  });
  expect(dynamicImport).toBeDefined();
  expect(dynamicImport === undefined ? undefined : resolveDynamicImportTarget(dynamicImport)?.getFilePath()).toMatch(
    /packages\/ui\/src\/code-editor\/index\.ts$/u,
  );
});
