import { loadProject } from "@orb/tooling/ast";
import { SyntaxKind } from "ts-morph";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("typed AST corpus returns browser declarations in their native DOM world", () => {
  const project = loadProject(true);
  const source = project.getSourceFile("packages/client/src/features/config/lib/theme-contrast.ts");
  const element = source?.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "el");
  expect(element?.getType().getText()).toBe("HTMLSpanElement");
});
