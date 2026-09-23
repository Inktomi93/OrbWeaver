// Same-file merged-export ORIGIN recognition, split out of reference-fact-module.ts to hold the size cap.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import { importDeclarationOf, originFromTarget, projectTarget } from "./reference-fact-module-helpers.ts";
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
  if (!Node.isIdentifier(node)) {
    return;
  }
  const declarationFact = declarationOf(node, target);
  if (declarationFact.kind === "unresolved" || !Node.isImportSpecifier(declarationFact.value)) {
    return;
  }
  const importSpecifier = declarationFact.value;
  const importDeclaration = importDeclarationOf(importSpecifier);
  const sourceFile = importDeclaration?.getModuleSpecifierSourceFile();
  if (importDeclaration === undefined || sourceFile === undefined) {
    return;
  }
  const exportedName = importSpecifier.getName();
  const symbol = sourceFile.getExportSymbols().find((candidate) => candidate.getName() === exportedName);
  const valueDeclaration = symbol?.getValueDeclaration();
  const declarations = symbol?.getDeclarations() ?? [];
  const mergeHome = valueDeclaration?.getSourceFile();
  const isSameFileMerge = mergeHome !== undefined && declarations.length > 1 && declarations.every((declaration) => declaration.getSourceFile() === mergeHome);
  if (!isSameFileMerge || valueDeclaration === undefined) {
    return;
  }
  const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
  return resolved(originFromTarget(moduleSpecifier, exportedName, projectTarget(valueDeclaration, exportedName)), target, valueDeclaration);
}
