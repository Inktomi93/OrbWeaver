#!/usr/bin/env tsx
// BRAND-F one-shot: add the @orb/kit/ids imports the sed-applied handle fixes reference but never
// imported (castId / Handle / CharacterHandle), for tests/ + scripts/ files only. Usage is detected on
// AST IDENTIFIERS (never raw text — gate fixture strings and codemod string literals spell these names
// without using them). Idempotent: a file already importing a name is skipped for that name.
import type { SourceFile } from "./codemod-kit.ts";
import { addNamedImport, runCodemod, SyntaxKind } from "./codemod-kit.ts";

const IDS_MODULE = "@orb/kit/ids";
const NAMES: ReadonlyArray<{ readonly name: string; readonly typeOnly: boolean }> = [
  { name: "castId", typeOnly: false },
  { name: "Handle", typeOnly: true },
  { name: "CharacterHandle", typeOnly: true },
];

/** Identifier usages of `name` OUTSIDE import declarations. */
function usesIdentifier(sf: SourceFile, name: string): boolean {
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== name) {
      continue;
    }
    if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !== undefined) {
      continue;
    }
    return true;
  }
  return false;
}

await runCodemod("brandf-missing-imports", (ctx) => {
  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!(fp.includes("/tests/") || fp.includes("/scripts/dev/") || fp.includes("/scripts/seed/") || fp.includes("/scripts/probes/"))) {
      continue;
    }
    const imported = new Set<string>();
    for (const decl of sf.getImportDeclarations()) {
      for (const spec of decl.getNamedImports()) {
        imported.add(spec.getName());
      }
    }
    for (const { name, typeOnly } of NAMES) {
      if (imported.has(name) || !usesIdentifier(sf, name)) {
        continue;
      }
      ctx.plan(addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name, isTypeOnly: typeOnly }));
    }
  }
});
