// Canonical kit phantom-brand data derived from native declarations.
import type { Node as MorphNode, SourceFile, Type, TypeChecker } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import ts from "typescript";

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

/** Every top-level `type X = TypeIdOf<…>` alias name in the ids home's source text: the entity-id vocabulary
 *  the injected-op scope rule triggers on. It throws on an empty result, because an empty vocabulary makes
 *  that rule silently green rather than proving every op carries its caller. */
export function requireEntityIdTypeNames(sourceText: string): readonly string[] {
  const source = ts.createSourceFile(ID_BRAND_HOME, sourceText, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const names = source.statements.flatMap((statement) =>
    ts.isTypeAliasDeclaration(statement) &&
    ts.isTypeReferenceNode(statement.type) &&
    ts.isIdentifier(statement.type.typeName) &&
    statement.type.typeName.text === "TypeIdOf"
      ? [statement.name.text]
      : [],
  );
  if (names.length === 0) {
    throw new Error(`${ID_BRAND_HOME} declares no TypeIdOf entity-id alias; the injected-op scope rule would be blind`);
  }
  return names;
}

/** One canonical declaration predicate, shared by native and standalone morph symbol readers. */
function nativeCanonicalBrandProperty(type: ts.Type): ts.Symbol | undefined {
  return type
    .getProperties()
    .find(
      (candidate) =>
        candidate.declarations?.some(
          (declaration) =>
            ts.isPropertySignature(declaration) &&
            declaration.name.getText() === "[brand]" &&
            declaration.getSourceFile().fileName.replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`),
        ) === true,
    );
}

/** Literal brand through the caller's native checker, never a structural lookalike. */
export function nativeCanonicalIdBrand(type: ts.Type, node: ts.Node, checker: ts.TypeChecker): string | null {
  const property = nativeCanonicalBrandProperty(type);
  const flags =
    // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript formatting options compose a compiler-owned bitfield.
    ts.TypeFormatFlags.UseTypeOfFunction |
    ts.TypeFormatFlags.NoTruncation |
    ts.TypeFormatFlags.UseFullyQualifiedType |
    ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;
  return property === undefined ? null : checker.typeToString(checker.getTypeOfSymbolAtLocation(property, node), node, flags);
}

/** Morph consumers delegate to the same compiler primitive as ESLint's native Program. */
export function canonicalIdBrand(type: Type, node: MorphNode, checker: TypeChecker): string | null {
  return nativeCanonicalIdBrand(type.compilerType, node.compilerNode, checker.compilerObject);
}

/** Standalone wrappers retain the node's existing owning checker; no Project is acquired. */
export function nativeIdBrand(node: MorphNode): string | null {
  const type = node.getType();
  const canonical = nativeCanonicalBrandProperty(type.compilerType);
  const property = type.getProperties().find((candidate) => candidate.compilerSymbol === canonical);
  return property === undefined ? null : property.getTypeAtLocation(node).getText(node);
}

/** Canonical TypeID prefix carried by this type, or null for a prefixless/noncanonical brand. */
export function canonicalTypeIdPrefix(type: Type, node: MorphNode, checker: TypeChecker, prefixes: ReadonlySet<string>): string | null {
  return typeIdPrefixFromBrand(canonicalIdBrand(type, node, checker), prefixes);
}

/** Classify a canonical native brand observation against the authored TypeID prefix vocabulary. */
export function typeIdPrefixFromBrand(brandText: string | null, prefixes: ReadonlySet<string>): string | null {
  if (brandText === null) {
    return null;
  }
  const prefix = brandText.replace(/^(?:"|')|(?:"|')$/gu, "");
  return prefixes.has(prefix) ? prefix : null;
}
