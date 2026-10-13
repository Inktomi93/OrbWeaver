// Importer query facts preserve authored substring and canonical target matching as independent admissions.
import type { ExportDeclaration, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ModuleImporters, ModuleImportHit } from "./module-reach-contract.ts";
import { importerModulePath } from "./module-target.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { inventoryStaticTarget, semanticInventoryOf } from "./semantic-inventory-reader.ts";

function staticImporterHits(sf: SourceFile, spec: string): ModuleImportHit[] {
  const out: ModuleImportHit[] = [];
  const decls: Array<ImportDeclaration | ExportDeclaration> = [...sf.getImportDeclarations(), ...sf.getExportDeclarations()];
  for (const d of decls) {
    // Two independent match strategies, OR'd: (1) the raw specifier text — catches package/#alias specs
    // the caller quotes verbatim (`@orb/ui/badge`); (2) the RESOLVED target file's path — catches relative
    // specs (`../assembly/shape`, `./context`) that share no substring with a file-path query at all. Without
    // (2), querying by file path silently misses every relative importer (a false "0 importers" dead-code
    // signal) — resolution handles relative/#alias/@orb subpath uniformly (same technique as resolvedGraph).
    const raw = d.getModuleSpecifierValue();
    const rawHit = raw?.includes(spec);
    const resolved = inventoryStaticTarget(d)?.getFilePath();
    const resolvedHit = resolved?.includes(spec);
    if (rawHit === true || resolvedHit === true) {
      out.push({ node: d, kind: "import" });
    }
  }
  return out;
}

function dynamicImporterHits(sf: SourceFile, spec: string, targets: ReadonlySet<string>): ModuleImportHit[] {
  const out: ModuleImportHit[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (
      arg !== undefined &&
      Node.isStringLiteral(arg) &&
      (arg.getLiteralText().includes(spec) || targets.has(importerModulePath(sf, arg.getLiteralText()) ?? ""))
    ) {
      out.push({ node: call, kind: "dynamic-import" });
    }
  }
  return out;
}

function staticResolvedTargets(sf: SourceFile, spec: string): string[] {
  const targets: string[] = [];
  for (const declaration of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const resolved = inventoryStaticTarget(declaration)?.getFilePath();
    if (resolved !== undefined && (declaration.getModuleSpecifierValue()?.includes(spec) === true || resolved.includes(spec))) {
      targets.push(resolved);
    }
  }
  return targets;
}

function dynamicResolvedTargets(sf: SourceFile, spec: string): string[] {
  const targets: string[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const arg = call.getExpression().getKind() === SyntaxKind.ImportKeyword ? call.getArguments()[0] : undefined;
    const target =
      arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText().includes(spec) ? importerModulePath(sf, arg.getLiteralText()) : undefined;
    if (target !== undefined) {
      targets.push(target);
    }
  }
  return targets;
}

function resolvedTargets(files: readonly SourceFile[], spec: string): Set<string> {
  const targets = new Set<string>();
  for (const sf of files) {
    for (const target of [...staticResolvedTargets(sf, spec), ...dynamicResolvedTargets(sf, spec)]) {
      targets.add(target);
    }
  }
  return targets;
}

function resolvedImporterHits(sf: SourceFile, targets: ReadonlySet<string>): ModuleImportHit[] {
  const hits: ModuleImportHit[] = [];
  for (const declaration of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const resolved = inventoryStaticTarget(declaration)?.getFilePath();
    if (resolved !== undefined && targets.has(resolved)) {
      hits.push({ node: declaration, kind: "import" });
    }
  }
  return hits;
}

/** Import positions matching authored text or a canonical native target, retaining dynamic importer admission. */
export function collectModuleImporters(files: readonly SourceFile[], spec: string): ModuleImporters {
  if (files.some((file) => semanticInventoryOf(file.getProject()) !== undefined)) {
    throw new SemanticInventoryError("importer queries require an explicit native program view");
  }
  const hits: ModuleImportHit[] = [];
  const targetPaths = resolvedTargets(files, spec);
  for (const sf of files) {
    hits.push(...staticImporterHits(sf, spec), ...dynamicImporterHits(sf, spec, targetPaths), ...resolvedImporterHits(sf, targetPaths));
  }
  return { hits, targetPaths };
}
