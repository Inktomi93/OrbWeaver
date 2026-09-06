// Canonical @orb/kit/ids phantom extraction shared by schema and source identity policies.
import type { CallExpression, ImportDeclaration, Node as MorphNode, SourceFile, Type, TypeChecker } from "ts-morph";
import { Node } from "ts-morph";
import { resolveCallableOrigin } from "./reference-fact-call.ts";

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

function kitImport(declaration: ImportDeclaration): boolean {
  if (declaration.getModuleSpecifierValue() === "@orb/kit/ids") {
    return true;
  }
  return declaration.getModuleSpecifierSourceFile()?.getFilePath().replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`) === true;
}

function importedNames(sourceFile: SourceFile, exportedName: string): ReadonlySet<string> {
  const names = new Set<string>([exportedName]);
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (!kitImport(declaration)) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
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

/** Invocation-local exact kit-call matcher; each source's import aliases are indexed once. */
export function createKitIdCallMatcher(exportedName: string): (call: CallExpression) => boolean {
  const namesBySource = new WeakMap<object, ReadonlySet<string>>();
  return (call) => {
    const sourceFile = call.getSourceFile();
    let names = namesBySource.get(sourceFile.compilerNode);
    if (names === undefined) {
      names = importedNames(sourceFile, exportedName);
      namesBySource.set(sourceFile.compilerNode, names);
    }
    if (!couldNameExport(call, exportedName, names)) {
      return false;
    }
    const origin = resolveCallableOrigin(call);
    if (origin.kind === "unresolved" || origin.value.target.kind !== "module") {
      return false;
    }
    const target = origin.value.target;
    if (target.exportedName !== exportedName || target.memberPath.length > 0) {
      return false;
    }
    const canonical = target.canonical;
    return canonical.kind === "external-door"
      ? canonical.moduleSpecifier === "@orb/kit/ids"
      : canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(`/${ID_BRAND_HOME}`);
  };
}
