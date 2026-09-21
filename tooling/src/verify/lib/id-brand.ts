// Canonical @orb/kit/ids phantom extraction shared by schema and source identity policies.

import { resolveCallableOrigin } from "@orb/tooling/_shared/reference-fact-call";
import type { CallExpression, Node as MorphNode, SourceFile, Type, TypeChecker } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { KitIdCallVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

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

/** Canonical TypeID prefix carried by this type, or null for a prefixless/noncanonical brand. */
export function canonicalTypeIdPrefix(type: Type, node: MorphNode, checker: TypeChecker, prefixes: ReadonlySet<string>): string | null {
  const brandText = canonicalIdBrand(type, node, checker);
  if (brandText === null) {
    return null;
  }
  const prefix = brandText.replace(/^(?:"|')|(?:"|')$/gu, "");
  return prefixes.has(prefix) ? prefix : null;
}

function importedNames(sourceFile: SourceFile, exportedName: string): ReadonlySet<string> {
  const names = new Set<string>([exportedName]);
  for (const declaration of sourceFile.getImportDeclarations()) {
    for (const specifier of declaration.getNamedImports()) {
      // A project barrel may republish the canonical helper under its original export name. Include that
      // authored spelling in the cheap candidate fence and let resolveCallableOrigin decide identity; a
      // same-named local module still resolves to `other`. Direct kit imports take the same path.
      if (specifier.getName() === exportedName) {
        names.add(specifier.getAliasNode()?.getText() ?? exportedName);
      }
    }
  }
  return names;
}

function couldNameExport(call: CallExpression, exportedName: string, names: ReadonlySet<string>): boolean {
  const callee = call.getExpression();
  if (Node.isIdentifier(callee)) {
    return names.has(callee.getText());
  }
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName() === exportedName;
  }
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const argument = callee.getArgumentExpression();
  return (
    argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) && argument.getLiteralText() === exportedName
  );
}

/** Invocation-local exact kit-call matcher; each source's import aliases are indexed once.
 *
 *  THE VERDICT IS THREE-VALUED (#944, #2041). It answered a boolean, and an unresolved origin collapsed
 *  into `false` — so a call SPELLED like the canonical seam whose door the checker could not read was
 *  silently acquitted by both consumers, one of which (`no-mint-via-cast`) is a HARD ban. The refusal is
 *  routed through the shared `classifyOriginRefusal`: a local function, a parameter or any other proven
 *  non-module binding is a different identity and still answers `other` — that is the local same-named
 *  function mustPass row in both consumers, and a blanket flip reds it — while a door with no reachable
 *  target answers `unreadable` and each consumer reports it with its own disjoint text. The NAME prefilter
 *  above is fail-closure's mandatory companion — nothing outside the candidate spelling is ever asked.
 *  Measured on the live tree before the flip: 221 `castId`-spelled calls across the 107 `@packages` files
 *  that mention it, ALL resolved, 0 unreadable — the flip admits no new live subject. */
export function createKitIdCallMatcher(exportedName: string): (call: CallExpression) => KitIdCallVerdict {
  const namesBySource = new WeakMap<object, ReadonlySet<string>>();
  return (call) => {
    const sourceFile = call.getSourceFile();
    let names = namesBySource.get(sourceFile.compilerNode);
    if (names === undefined) {
      names = importedNames(sourceFile, exportedName);
      namesBySource.set(sourceFile.compilerNode, names);
    }
    if (!couldNameExport(call, exportedName, names)) {
      return "other";
    }
    const origin = resolveCallableOrigin(call);
    if (origin.kind === "unresolved") {
      return classifyOriginRefusal(origin.reason, call.getExpression());
    }
    const target = origin.value.target;
    if (target.kind !== "module" || target.exportedName !== exportedName || target.memberPath.length > 0) {
      return "other";
    }
    const canonical = target.canonical;
    const isKit =
      canonical.kind === "external-door"
        ? canonical.moduleSpecifier === "@orb/kit/ids"
        : canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`);
    return isKit ? "kit" : "other";
  };
}
