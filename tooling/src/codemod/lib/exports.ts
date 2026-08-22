// Export operations: named / barrel / dedupe / type-only flip.
// ── §10 ─ Export operations ──────────────────────────────────────────────────

import type { ExportDeclaration } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan } from "../contract/types.ts";
import { absolutePath, assert, repoRelative } from "./plans.ts";

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
    description: `Add re-export { ${named.isTypeOnly ? "type " : ""}${named.name}${named.alias ? ` as ${named.alias}` : ""} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
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
 * statement regardless.
 */
export function removeReExport(
  ctx: CodemodContext,
  filePath: string,
  target: { readonly moduleSpecifier: string; readonly names: readonly string[] },
  opts: OperationOptions & { removeWholeDeclaration?: boolean } = {},
): Plan {
  const { moduleSpecifier, names } = target;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `removeReExport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);

  return {
    description: `Remove re-export { ${names.join(", ")} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      // Same type-only vs value ambiguity as removeNamedImport — match the value declaration only.
      const decl = sf.getExportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (!decl) {
        return;
      }
      if (opts.removeWholeDeclaration === true) {
        decl.remove();
        return;
      }
      const namesSet = new Set(names);
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
    description: `Dedupe re-exports in ${repoRelative(abs, ctx.repoRoot)}${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [abs],
    transform(): void {
      const seen = new Set<string>();
      for (const decl of sf.getExportDeclarations()) {
        dedupeExportDeclaration(decl, seen);
      }
    },
  };
}
