import type { ImportDeclaration, ImportSpecifier, SourceFile } from "ts-morph";

/** Merge a named import into an existing declaration without losing value/type intent. */
export function mergeNamedImportInto(
  existing: ImportDeclaration,
  named: { readonly name: string; readonly alias?: string; readonly isTypeOnly?: boolean },
): void {
  const wantValue = named.isTypeOnly !== true;
  if (wantValue && existing.isTypeOnly()) {
    existing.setIsTypeOnly(false);
    for (const specifier of existing.getNamedImports()) {
      specifier.setIsTypeOnly(true);
    }
  }
  const match = existing
    .getNamedImports()
    .find((specifier) => specifier.getName() === named.name && (specifier.getAliasNode()?.getText() ?? specifier.getName()) === (named.alias ?? named.name));
  if (match !== undefined) {
    if (wantValue && match.isTypeOnly()) {
      match.setIsTypeOnly(false);
    }
    return;
  }
  existing.addNamedImport({
    name: named.name,
    ...(named.alias !== undefined ? { alias: named.alias } : {}),
    ...(named.isTypeOnly !== undefined && !existing.isTypeOnly() ? { isTypeOnly: named.isTypeOnly } : {}),
  });
}

/** Group a declaration's named imports by the destination selected for each exported name. */
export function groupImportsByDestination(
  declaration: ImportDeclaration,
  fromSpecifier: string,
  symbolToNewSpecifier: Readonly<Record<string, string>>,
): Map<string, ImportSpecifier[]> {
  const groups = new Map<string, ImportSpecifier[]>();
  for (const specifier of declaration.getNamedImports()) {
    const destination = symbolToNewSpecifier[specifier.getName()];
    if (destination === undefined || destination === fromSpecifier) {
      continue;
    }
    const bucket = groups.get(destination) ?? [];
    bucket.push(specifier);
    groups.set(destination, bucket);
  }
  return groups;
}

/** Merge routed specifiers into their destination declaration, then remove their old bindings. */
export function routeSpecifiersToDestination(sourceFile: SourceFile, destination: string, specifiers: readonly ImportSpecifier[]): void {
  const sourceDeclaration = specifiers[0]?.getImportDeclaration();
  const incoming = specifiers.map((specifier) => {
    const aliasNode = specifier.getAliasNode();
    return {
      name: specifier.getName(),
      ...(aliasNode !== undefined ? { alias: aliasNode.getText() } : {}),
      isTypeOnly: sourceDeclaration?.isTypeOnly() === true || specifier.isTypeOnly(),
    };
  });
  const target = sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === destination &&
        declaration.getNamespaceImport() === undefined &&
        !(declaration.isTypeOnly() && declaration.getDefaultImport() !== undefined),
    );
  if (target !== undefined) {
    for (const named of incoming) {
      mergeNamedImportInto(target, named);
    }
  } else {
    sourceFile.addImportDeclaration({ moduleSpecifier: destination, namedImports: incoming });
  }
  for (const specifier of specifiers) {
    specifier.remove();
  }
}
