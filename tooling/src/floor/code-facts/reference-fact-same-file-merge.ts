// Same-file merged-export ORIGIN recognition, split out of reference-fact-module.ts to hold the size cap.
import type { ElementAccessExpression, ImportDeclaration, Node as MorphNode, PropertyAccessExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import { importDeclarationOf, originFromTarget, projectTarget, requiresResolvedSource } from "./reference-fact-module-helpers.ts";
import { overloadHome } from "./reference-fact-overload.ts";
import type { ModuleState } from "./reference-fact-state.ts";
import { declarationOf, resolved } from "./reference-fact-state.ts";

/** A function/class/var merged with a namespace or a second interface OF THE SAME EXPORTED NAME, every
 *  declaration sitting in ONE source file (the merge's own home — which may sit behind a barrel: drizzle-orm
 *  re-exports its `sql` merge from `sql/sql.d.ts` through `index.d.ts`, so the merge's home is compared
 *  against ITSELF, never against the importED specifier's own module file), is one ORIGIN for a receiver a
 *  member is read off — even though `resolveExportedDeclaration`'s single-declaration contract must still
 *  refuse it as `ambiguous` (pinned: reference-fact-module.test.ts's "a function merged with a namespace of
 *  the same name" — its contract is THE declaration, and a merge genuinely has two). A caller asking "is
 *  this receiver drizzle-orm's own export `sql`, so I can read `.raw` off it" asks a different question:
 *  (module, exportedName) identity, not which declaration. A declaration split across FILES, or a second
 *  export of the same source under a DIFFERENT name, is real ambiguity and is not this shape —
 *  `getValueDeclaration()` answers `undefined` for a symbol with no value side (pure type-merges), and the
 *  same-file check below still rejects a cross-file augmentation, so only a genuine same-file
 *  value+namespace/interface merge reaches this arm. */
export function sameFileMergedExportOrigin(node: MorphNode, target: ModuleState): ReferenceFact<ModuleMemberOrigin> | undefined {
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    return memberMergedOrigin(node, target);
  }
  if (!Node.isIdentifier(node)) {
    return;
  }
  const declarationFact = declarationOf(node, target);
  if (declarationFact.kind === "unresolved" || !Node.isImportSpecifier(declarationFact.value)) {
    return;
  }
  const importDeclaration = importDeclarationOf(declarationFact.value);
  return importDeclaration === undefined ? undefined : mergedExport(importDeclaration, declarationFact.value.getName(), target);
}

/** `ns.name` reads the export off a namespace import; `receiver.member` extends a merged receiver's path. */
function memberMergedOrigin(node: PropertyAccessExpression | ElementAccessExpression, target: ModuleState): ReferenceFact<ModuleMemberOrigin> | undefined {
  const member = literalMemberName(node);
  if (member === undefined) {
    return;
  }
  const receiver = node.getExpression();
  const declared = Node.isIdentifier(receiver) ? declarationOf(receiver, target) : undefined;
  if (declared?.kind === "resolved" && Node.isNamespaceImport(declared.value)) {
    const importDeclaration = importDeclarationOf(declared.value);
    return importDeclaration === undefined ? undefined : mergedExport(importDeclaration, member, target);
  }
  const base = sameFileMergedExportOrigin(receiver, target);
  return base?.kind === "resolved" ? { ...base, value: { ...base.value, memberPath: [...base.value.memberPath, member] } } : undefined;
}

/** The member a dotted or literal-bracket read names; a computed key names nothing here. */
function literalMemberName(node: PropertyAccessExpression | ElementAccessExpression): string | undefined {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  const key = node.getArgumentExpression();
  return Node.isStringLiteral(key) || Node.isNoSubstitutionTemplateLiteral(key) ? key.getLiteralText() : undefined;
}

/** The merged export `name` of the imported module, found through any chain of name-preserving re-exports. A
 *  chain that ends at a package door reports that door, so a sibling's `export { sql } from "drizzle-orm"` is
 *  the package's `sql`, while a sibling's own merge keeps its relative door and stays another module's. */
function mergedExport(importDeclaration: ImportDeclaration, name: string, target: ModuleState): ReferenceFact<ModuleMemberOrigin> | undefined {
  return mergedExportIn(importDeclaration.getModuleSpecifierSourceFile(), importDeclaration.getModuleSpecifierValue(), name, target);
}

function mergedExportIn(file: SourceFile | undefined, door: string, name: string, target: ModuleState): ReferenceFact<ModuleMemberOrigin> | undefined {
  const symbol = file?.getExportSymbols().find((candidate) => candidate.getName() === name);
  if (symbol === undefined) {
    return;
  }
  if (symbol.isAlias()) {
    const specifier = symbol.getDeclarations().find(Node.isExportSpecifier);
    const hop = specifier?.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
    const hopDoor = hop?.getModuleSpecifierValue();
    return specifier === undefined || hopDoor === undefined
      ? undefined
      : mergedExportIn(hop?.getModuleSpecifierSourceFile(), requiresResolvedSource(hopDoor) ? door : hopDoor, specifier.getName(), target);
  }
  const valueDeclaration = symbol.getValueDeclaration();
  const declarations = symbol.getDeclarations();
  const mergeHome = valueDeclaration?.getSourceFile();
  if (
    valueDeclaration === undefined ||
    mergeHome === undefined ||
    declarations.length < 2 ||
    !declarations.every((item) => item.getSourceFile() === mergeHome)
  ) {
    return;
  }
  return resolved(originFromTarget(door, name, projectTarget(valueDeclaration, name)), target, valueDeclaration);
}

/** Callable values have one function/overload home; namespace metadata does not make another function. */
export function sameFileMergedCallableValueOrigin(node: MorphNode, target: ModuleState): ReferenceFact<ModuleMemberOrigin> | undefined {
  const origin = sameFileMergedExportOrigin(node, target);
  if (origin?.kind !== "resolved" || origin.value.canonical.kind !== "project") {
    return;
  }
  const value = origin.value.canonical.declaration;
  const symbol = value.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  const functions = declarations.filter(Node.isFunctionDeclaration);
  const home = functions.length === 1 ? functions[0] : overloadHome(functions);
  const source = home?.getSourceFile().compilerNode;
  const closed =
    declarations.some(Node.isModuleDeclaration) &&
    declarations.every(
      (declaration) =>
        (Node.isFunctionDeclaration(declaration) || Node.isModuleDeclaration(declaration)) && declaration.getSourceFile().compilerNode === source,
    );
  if (home === undefined || !Node.isFunctionDeclaration(value) || !closed || !functions.some((fn) => fn.compilerNode === value.compilerNode)) {
    return;
  }
  return {
    ...origin,
    value: originFromTarget(origin.value.moduleSpecifier, origin.value.exportedName, projectTarget(home, origin.value.canonical.exportedName)),
  };
}
