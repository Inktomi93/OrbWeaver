// Shared types and small pure helpers for module-origin traversal, extracted from reference-fact-module.ts.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ModuleMemberOrigin } from "./reference-fact-contract.ts";

export type NamespaceBinding =
  | { readonly kind: "project"; readonly moduleSpecifier: string; readonly declaration: MorphNode; readonly sourceFile: SourceFile }
  | { readonly kind: "external"; readonly moduleSpecifier: string; readonly declaration: MorphNode };

export type CanonicalModuleTarget = ModuleMemberOrigin["canonical"];

export function importDeclarationOf(node: MorphNode): import("ts-morph").ImportDeclaration | undefined {
  return node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
}

export const requiresResolvedSource = (moduleSpecifier: string): boolean =>
  moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/") || moduleSpecifier.startsWith("#");

export const projectTarget = (declaration: MorphNode, exportedName: string): CanonicalModuleTarget => ({
  kind: "project",
  sourceFile: declaration.getSourceFile(),
  exportedName,
  declaration,
});

export const externalTarget = (declaration: MorphNode, moduleSpecifier: string, exportedName: string): CanonicalModuleTarget => ({
  kind: "external-door",
  moduleSpecifier,
  exportedName,
  declaration,
});

export function originFromTarget(moduleSpecifier: string, exportedName: string, canonical: CanonicalModuleTarget): ModuleMemberOrigin {
  return { kind: "module", moduleSpecifier, exportedName, memberPath: [], declaration: canonical.declaration, canonical };
}
