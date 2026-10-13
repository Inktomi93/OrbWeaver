// Export operations: named / barrel / dedupe / type-only flip.
// ── §10 ─ Export operations ──────────────────────────────────────────────────

import type { ExportDeclaration, ExportSpecifier, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan, ReExportSelection, RemoveReExportOptions, RemoveReExportTarget } from "../contract/types.ts";
import { absolutePath, assert, noteSuffix, repoRelative } from "./plans.ts";

/**
 * Add a re-export `export { X } from "Y"` idempotently into a barrel file.
 * If the export declaration for `Y` already exists, merges the new names
 * in. If the name is already exported it's a no-op. Type-only flag honoured.
 *
 * Use to grow a front-door `index.ts` — the helper handles the "did I
 * already add this?" check that every codemod re-implements.
 */
export function addReExport(
  ctx: CodemodContext,
  filePath: string,
  named: {
    readonly moduleSpecifier: string;
    readonly name: string;
    readonly alias?: string;
    readonly isTypeOnly?: boolean;
  },
  opts: OperationOptions = {},
): Plan {
  const { moduleSpecifier } = named;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `addReExport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);

  return {
    description: `Add re-export { ${named.isTypeOnly === true ? "type " : ""}${named.name}${named.alias === undefined ? "" : ` as ${named.alias}`} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(): void {
      // Same type-only vs value ambiguity as addNamedImport — match the value declaration only.
      const existing = sf.getExportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (existing !== undefined) {
        const already = existing.getNamedExports().some((n) => n.getName() === named.name);
        if (already) {
          return;
        }
        existing.addNamedExport({
          name: named.name,
          ...(named.alias !== undefined ? { alias: named.alias } : {}),
          ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
        });
        return;
      }
      sf.addExportDeclaration({
        moduleSpecifier,
        namedExports: [
          {
            name: named.name,
            ...(named.alias !== undefined ? { alias: named.alias } : {}),
            ...(named.isTypeOnly !== undefined ? { isTypeOnly: named.isTypeOnly } : {}),
          },
        ],
      });
    },
  };
}

/**
 * Remove specific re-exports from a barrel. Mirror of `removeNamedImport`.
 * If the declaration loses all its names it's removed. Pass
 * `removeWholeDeclaration: true` to drop the whole `export ... from`
 * statement regardless. Exact `exports` selectors match source name, public alias and effective type arm
 * across declarations, preserving emitted module evaluation by default. They never select star exports.
 */
export function removeReExport(ctx: CodemodContext, filePath: string, target: RemoveReExportTarget, opts: RemoveReExportOptions = {}): Plan {
  const { moduleSpecifier } = target;
  const names =
    target.exports === undefined ? target.names : target.exports.map((entry) => `${entry.isTypeOnly ? "type " : ""}${entry.name} as ${entry.exportedName}`);
  assert(!(target.exports !== undefined && opts.removeWholeDeclaration === true), "removeReExport: exact selectors cannot remove a whole declaration");
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `removeReExport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);

  return {
    description: `Remove re-export { ${names.join(", ")} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(): void {
      if (target.exports !== undefined) {
        removeExactReExports(sf, target, opts);
        return;
      }
      // Same type-only vs value ambiguity as removeNamedImport — match the value declaration only.
      const decl = sf.getExportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (!decl) {
        return;
      }
      if (opts.removeWholeDeclaration === true) {
        decl.remove();
        return;
      }
      const namesSet = new Set(target.names);
      for (const spec of decl.getNamedExports()) {
        if (namesSet.has(spec.getName())) {
          spec.remove();
        }
      }
      if (decl.getNamedExports().length === 0 && decl.getNamespaceExport() === undefined) {
        decl.remove();
      }
    },
  };
}

function matchesReExport(spec: ExportSpecifier, declaration: ExportDeclaration, selection: ReExportSelection): boolean {
  const publicName = spec.getAliasNode() ?? spec.getNameNode();
  const exportedName = Node.isStringLiteral(publicName) ? publicName.getLiteralValue() : publicName.getText();
  return (
    spec.getName() === selection.name && exportedName === selection.exportedName && (declaration.isTypeOnly() || spec.isTypeOnly()) === selection.isTypeOnly
  );
}

function removeExactReExports(
  sourceFile: SourceFile,
  target: Extract<RemoveReExportTarget, { readonly exports: readonly ReExportSelection[] }>,
  opts: RemoveReExportOptions,
): void {
  for (const declaration of sourceFile.getExportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== target.moduleSpecifier) {
      continue;
    }
    const selected = declaration.getNamedExports().filter((spec) => target.exports.some((selection) => matchesReExport(spec, declaration, selection)));
    if (selected.length === 0) {
      continue;
    }
    const requestedBefore = exportRequestsModule(declaration, opts.verbatimModuleSyntax === true);
    for (const spec of selected) {
      spec.remove();
    }
    preserveExportRequest(declaration, target.moduleSpecifier, requestedBefore, opts);
  }
}

function exportRequestsModule(declaration: ExportDeclaration, verbatimModuleSyntax: boolean): boolean {
  return !declaration.isTypeOnly() && (verbatimModuleSyntax || declaration.getNamedExports().some((specifier) => !specifier.isTypeOnly()));
}

function preserveExportRequest(declaration: ExportDeclaration, moduleSpecifier: string, requestedBefore: boolean, opts: RemoveReExportOptions): void {
  const hasSurvivors = declaration.getNamedExports().length > 0;
  if (!hasSurvivors && (!requestedBefore || opts.preserveModuleEvaluation === false)) {
    declaration.remove();
    return;
  }
  if (!requestedBefore || opts.preserveModuleEvaluation === false || exportRequestsModule(declaration, opts.verbatimModuleSyntax === true)) {
    return;
  }
  const request = `import ${JSON.stringify(moduleSpecifier)};`;
  if (hasSurvivors) {
    declaration.getSourceFile().insertStatements(declaration.getChildIndex(), request);
  } else {
    declaration.replaceWithText(request);
  }
}

/**
 * Walk a barrel file and dedupe re-exports that name the same symbol from
 * the same module twice (sneaks in when manual barrels get touched by many
 * hands). Stable — earlier declaration wins.
 */
/** Remove named exports from `decl` already present in `seen` (by module::name::type-vs-value
 *  key), then drop the whole declaration if it ends up empty. Mutates `seen` with survivors. */
function dedupeExportDeclaration(decl: ExportDeclaration, seen: Set<string>): void {
  const mod = decl.getModuleSpecifierValue() ?? "<no-module>";
  for (const spec of decl.getNamedExports()) {
    const key = `${mod}::${spec.getName()}::${spec.isTypeOnly() ? "type" : "value"}`;
    if (seen.has(key)) {
      spec.remove();
      continue;
    }
    seen.add(key);
  }
  if (decl.getNamedExports().length === 0 && decl.getNamespaceExport() === undefined) {
    decl.remove();
  }
}

export function dedupeReExports(ctx: CodemodContext, filePath: string, opts: OperationOptions = {}): Plan {
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `dedupeReExports: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  return {
    description: `Dedupe re-exports in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(): void {
      const seen = new Set<string>();
      for (const decl of sf.getExportDeclarations()) {
        dedupeExportDeclaration(decl, seen);
      }
    },
  };
}
