// Canonical @orb/kit/ids phantom extraction shared by schema and source identity policies.
import type { Node as MorphNode, Type, TypeChecker } from "ts-morph";
import { Node } from "ts-morph";

export const ID_BRAND_HOME = "packages/kit/src/ids/index.ts";

/** Literal type carried by the canonical `[brand]` property, or null for an unrelated structural type. */
export function canonicalIdBrand(type: Type, node: MorphNode, checker: TypeChecker): string | null {
  const property = type
    .getProperties()
    .find((candidate) =>
      candidate
        .getDeclarations()
        .some(
          (declaration) =>
            Node.isPropertySignature(declaration) &&
            declaration.getNameNode().getText() === "[brand]" &&
            declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`),
        ),
    );
  return property === undefined ? null : checker.getTypeOfSymbolAtLocation(property, node).getText(node);
}
