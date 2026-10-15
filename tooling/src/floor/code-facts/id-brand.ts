// Canonical kit phantom-brand data derived from native declarations.
import type { Node as MorphNode, SourceFile, Symbol as TsSymbol, Type, TypeChecker } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";

export const ID_BRAND_HOME = "packages/kit/src/ids/index.ts";

/** Every literal prefix carried by a canonical `TypeIdOf<"…">` alias in the ids home. The derivation is
 *  structural and source-owned: a new entity alias becomes visible without a copied registry row, while a
 *  prefixless `Branded<"…">` alias never enters this set. Empty means the ids vocabulary was unreadable,
 *  never that no entity ids exist. */
export function deriveCanonicalTypeIdPrefixes(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string): ReadonlySet<string> {
  const prefixes = new Set<string>();
  const ids = files.find((sourceFile) => relativePath(sourceFile) === ID_BRAND_HOME);
  if (ids === undefined) {
    return prefixes;
  }
  for (const alias of ids.getTypeAliases()) {
    const typeNode = alias.getTypeNode();
    if (typeNode?.isKind(SyntaxKind.TypeReference) !== true || typeNode.getTypeName().getText() !== "TypeIdOf") {
      continue;
    }
    const argument = typeNode.getTypeArguments()[0];
    if (argument?.isKind(SyntaxKind.LiteralType) !== true) {
      continue;
    }
    const literal = argument.getLiteral();
    if (Node.isStringLiteral(literal)) {
      prefixes.add(literal.getLiteralText());
    }
  }
  return prefixes;
}

/** Canonical declaration provenance, never a type-name or structural lookalike. */
function canonicalBrandProperty(type: Type): TsSymbol | undefined {
  return type
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
}

/** Literal brand through the caller-owned checker; preserve the existing unrelated/error-type null answer. */
export function canonicalIdBrand(type: Type, node: MorphNode, checker: TypeChecker): string | null {
  const property = canonicalBrandProperty(type);
  return property === undefined ? null : checker.getTypeOfSymbolAtLocation(property, node).getText(node);
}

/** Standalone native wrappers retain their owning checker on the symbol, without acquiring a Project. */
export function nativeIdBrand(node: MorphNode): string | null {
  const property = canonicalBrandProperty(node.getType());
  return property === undefined ? null : property.getTypeAtLocation(node).getText(node);
}

/** Canonical TypeID prefix carried by this type, or null for a prefixless/noncanonical brand. */
export function canonicalTypeIdPrefix(type: Type, node: MorphNode, checker: TypeChecker, prefixes: ReadonlySet<string>): string | null {
  const brandText = canonicalIdBrand(type, node, checker);
  if (brandText === null) {
    return null;
  }
  const prefix = brandText.replace(/^(?:"|')|(?:"|')$/gu, "");
  return prefixes.has(prefix) ? prefix : null;
}
