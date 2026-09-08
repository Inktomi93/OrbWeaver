// Import operations: find / add / remove / rename / repoint / route.
// ── §9 ─ Import operations ───────────────────────────────────────────────────

import type { CallExpression, ImportDeclaration, ImportSpecifier, Project, SourceFile, SourceFileReferencingNodes, StringLiteral } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { CodemodContext, ImportSpecFilter, OperationOptions, Plan } from "../contract/types.ts";
import { absolutePath, assert, assertPathString, noteSuffix, repoRelative } from "./plans.ts";

/**
 * Find every ImportDeclaration in the project whose module specifier
 * equals `moduleSpecifier` exactly. For `from "./relative"`-style lookups,
 * use `findImportersOfFile()` instead — relative resolutions differ per
 * importing file.
 */
export function findImporters(project: Project, moduleSpecifier: string): ImportDeclaration[] {
  const out: ImportDeclaration[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const decl of sf.getImportDeclarations()) {
      if (decl.getModuleSpecifierValue() === moduleSpecifier) {
        out.push(decl);
      }
    }
  }
  return out;
}

/**
 * Find every ImportDeclaration that resolves (after relative-path
 * resolution) to the given file. Uses ts-morph's
 * `getReferencingNodesInOtherSourceFiles()` which is symbol-aware AND
 * relative-aware, so it catches both `from "./foo"` and `from "../foo"` as
 * long as they resolve to the target. The ImportEqualsDeclaration and
 * CallExpression arms are filtered out (we only want ES imports here; the
 * rare arms have their own dedicated helpers below).
 */
export function findImportersOfFile(targetFile: SourceFile): ImportDeclaration[] {
  return targetFile.getReferencingNodesInOtherSourceFiles().filter((n): n is ImportDeclaration => n.isKind(SyntaxKind.ImportDeclaration));
}

/**
 * Return every ReferencingNode (ES import OR `export { } from`-style
 * re-export OR `import =` OR `require(...)`-style CallExpression) for a
 * file. Use this when you genuinely want "everything that points here";
 * use `findImportersOfFile` when you only care about ES imports.
 */
export function findAllReferencersOfFile(targetFile: SourceFile): SourceFileReferencingNodes[] {
  return targetFile.getReferencingNodesInOtherSourceFiles();
}

/**
 * Repoint EVERY import declaration in the project whose specifier matches
 * `fromSpecifier` (exact string) to use `toSpecifier`. Used after a file
 * MOVE when the moved file's old specifier was used as an alias path
 * (ts-morph's move only updates relative specifiers).
 *
 * For the regex sweep across many alias paths, use `repointAliasPaths`.
 */
export function repointImports(ctx: CodemodContext, fromSpecifier: string, toSpecifier: string, opts: OperationOptions = {}): Plan {
  assertPathString(fromSpecifier, "fromSpecifier");
  assertPathString(toSpecifier, "toSpecifier");
  const matches = findImporters(ctx.project, fromSpecifier);

  return {
    description: `Repoint imports "${fromSpecifier}" → "${toSpecifier}" (${matches.length} declaration${matches.length === 1 ? "" : "s"})${noteSuffix(opts)}`,
    touchedFiles: [...new Set(matches.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of matches) {
        decl.setModuleSpecifier(toSpecifier);
      }
    },
  };
}

/**
 * Regex-based alias-path sweep across the entire project. Pattern matches
 * are applied as `replace(regex, replacement)` against the FULL FILE TEXT
 * via `replaceWithText` — slower than the AST path but covers:
 *   - import declarations
 *   - inline `import("...")` types
 *   - dynamic `import("...")` calls
 *   - JSDoc-ish path mentions in comments
 *
 * Designed for the alias-path gap left by `SourceFile.move()`. Pass
 * patterns like:
 *   `[/#server\/domain\/_shared\/foo/g, "#server/domain/foo"]`
 *
 * Use `g` flags so every occurrence in a file is rewritten.
 */
export function repointAliasPaths(ctx: CodemodContext, rewrites: ReadonlyArray<readonly [RegExp, string]>, opts: OperationOptions = {}): Plan {
  assert(rewrites.length > 0, "repointAliasPaths called with empty rewrites list");
  // Declare only the files this sweep actually REWRITES — computed by running the same rewrite chain
  // the transform runs (#1781). Declaring every project file instead widened the harness's pre-emit
  // diagnostics filter from a change's ~50 files to the whole workspace, burying the codemod's own
  // signal under thousands of pre-existing unrelated errors; that is why the roster rename hand-rolled
  // its own extension plan rather than calling this helper.
  const affected = ctx.project
    .getSourceFiles()
    .filter((sf) => applyRewrites(sf.getFullText(), rewrites) !== undefined)
    .map((sf) => sf.getFilePath());

  return {
    description: `Alias-path sweep (${rewrites.length} pattern${rewrites.length === 1 ? "" : "s"}, ${affected.length} file${affected.length === 1 ? "" : "s"})${noteSuffix(opts)}`,
    touchedFiles: affected,
    transform(innerCtx): void {
      for (const sf of innerCtx.project.getSourceFiles()) {
        const after = applyRewrites(sf.getFullText(), rewrites);
        if (after === undefined) {
          continue;
        }
        // The declared set is computed at plan-build time; an earlier plan in the same run can have
        // changed a file since. Re-declaring here is idempotent and keeps the declaration law honest.
        innerCtx.snapshot(sf);
        sf.replaceWithText(after);
      }
    },
  };
}

/** Run every rewrite over `text` in order. Returns the new text, or undefined when nothing matched —
 *  the ONE place the "did this file change?" question is answered, so the declared set and the
 *  transform can never disagree about it. */
function applyRewrites(text: string, rewrites: ReadonlyArray<readonly [RegExp, string]>): string | undefined {
  let after = text;
  for (const [re, replacement] of rewrites) {
    after = after.replace(re, replacement);
  }
  return after === text ? undefined : after;
}

/** vi's module-mocking methods whose first argument is a module-specifier string.
 *  A codemod that rewrites import paths must rewrite these strings too. */
const VI_MODULE_METHODS: ReadonlySet<string> = new Set(["mock", "doMock", "importActual", "importMock", "unmock"]);

/**
 * Extract the module-specifier string literal from a call when it's a dynamic
 * `import("…")` or a `vi.<mock-method>("…")` — else null. Lets a path-rewriting
 * codemod treat those module strings exactly like static import specifiers.
 */
export function moduleStringArg(call: CallExpression): StringLiteral | null {
  const expr = call.getExpression();
  const isDynImport = expr.getKind() === SyntaxKind.ImportKeyword;
  const isViMock = Node.isPropertyAccessExpression(expr) && expr.getExpression().getText() === "vi" && VI_MODULE_METHODS.has(expr.getName());
  if (!(isDynImport || isViMock)) {
    return null;
  }
  const arg0 = call.getArguments()[0];
  return arg0 && Node.isStringLiteral(arg0) ? arg0 : null;
}

/** Merge a named import into an EXISTING import declaration for the same module (the "already
 *  importing from here" branch of `addNamedImport`). */
function mergeNamedImportInto(existing: ImportDeclaration, named: { readonly name: string; readonly alias?: string; readonly isTypeOnly?: boolean }): void {
  const wantValue = named.isTypeOnly !== true;
  // Adding a VALUE specifier into an `import type {…}` declaration would silently make the value
  // type-only (TS1361 at its use site). Convert the declaration to a value import and push the
  // `type` modifier onto each existing (type-only) specifier instead.
  if (wantValue && existing.isTypeOnly()) {
    existing.setIsTypeOnly(false);
    for (const ni of existing.getNamedImports()) {
      ni.setIsTypeOnly(true);
    }
  }
  const match = existing
    .getNamedImports()
    .find((n) => n.getName() === named.name && (n.getAliasNode()?.getText() ?? n.getName()) === (named.alias ?? named.name));
  if (match !== undefined) {
    // Already imported — but a prior pass may have added it type-only; a later value use must
    // downgrade it so it's callable.
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

/**
 * Add a named import to a file IDEMPOTENTLY. If the module is already
 * imported, this merges the new names into the existing declaration. If
 * the name is already imported it's a no-op. The `isTypeOnly` flag is
 * honoured at the specifier level (per-name) when ts-morph supports it; if
 * the whole declaration is type-only the new specifier inherits that.
 */
export function addNamedImport(
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
  assert(sf !== undefined, `addNamedImport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  assertPathString(moduleSpecifier, "moduleSpecifier");
  assertPathString(named.name, "named.name");

  return {
    description:
      `Add named import { ${named.isTypeOnly === true ? "type " : ""}${named.name}${named.alias === undefined ? "" : ` as ${named.alias}`} } ` +
      `from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(): void {
      // A TYPE-ONLY add is satisfied by ANY existing import of the name from this module — a separate
      // `import type { X } from "m"` declaration included. Merging `type X` into the VALUE declaration
      // while a type-only declaration already carries X mints a TS2300 duplicate identifier (measured:
      // the 2026-08-03 brand campaign hit this in ~60 files across three passes).
      if (named.isTypeOnly === true) {
        const alreadyImported = sf
          .getImportDeclarations()
          .some((d) => d.getModuleSpecifierValue() === moduleSpecifier && d.getNamedImports().some((n) => n.getName() === named.name));
        if (alreadyImported) {
          return;
        }
      }
      // A value-import lookup by string alone can't tell a value declaration from a type-only one
      // sharing the same specifier (`import type { X } from "m"` + `import { Y } from "m"`) — match
      // on the non-type-only declaration explicitly, or we'd silently merge into the wrong one.
      const existing = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (existing !== undefined) {
        mergeNamedImportInto(existing, named);
        return;
      }
      // New declaration. Insert near the top, after existing imports if any.
      sf.addImportDeclaration({
        moduleSpecifier,
        namedImports: [
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
 * Remove specific named imports from a declaration. If the declaration is
 * left with no names (and no default / namespace import), the declaration
 * itself is removed. Pass `removeWholeDeclaration: true` to drop the whole
 * import regardless of remaining specifiers.
 */
export function removeNamedImport(
  ctx: CodemodContext,
  filePath: string,
  target: { readonly moduleSpecifier: string; readonly names: readonly string[] },
  opts: OperationOptions & { removeWholeDeclaration?: boolean } = {},
): Plan {
  const { moduleSpecifier, names } = target;
  const abs = absolutePath(filePath, ctx.repoRoot);
  const sf = ctx.project.getSourceFile(abs);
  assert(sf !== undefined, `removeNamedImport: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  assert(names.length > 0, "removeNamedImport: pass at least one name to remove");

  return {
    description: `Remove import { ${names.join(", ")} } from "${moduleSpecifier}" in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    touchedFiles: [abs],
    transform(): void {
      // See addNamedImport's matching comment: don't grab a type-only declaration sharing the
      // same specifier as the value declaration we actually mean to strip names from.
      const decl = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly());
      if (!decl) {
        return;
      }
      if (opts.removeWholeDeclaration === true) {
        decl.remove();
        return;
      }
      const namesSet = new Set(names);
      for (const spec of decl.getNamedImports()) {
        if (namesSet.has(spec.getName())) {
          spec.remove();
        }
      }
      // If we removed everything from the declaration AND it has no default
      // / namespace, drop the declaration itself.
      const stillHas = decl.getNamedImports().length > 0 || decl.getDefaultImport() !== undefined || decl.getNamespaceImport() !== undefined;
      if (!stillHas) {
        decl.remove();
      }
    },
  };
}

/**
 * Rename a named import specifier across every importer of `moduleSpecifier`
 * in the project. This is the "the upstream library renamed `oldName` to
 * `newName`, fix every consumer" pattern. Doesn't follow re-exports — those
 * are an explicit Stage 2 in restructure codemods.
 */
export function renameNamedImport(
  ctx: CodemodContext,
  moduleSpecifier: string,
  rename: { readonly oldName: string; readonly newName: string },
  opts: OperationOptions = {},
): Plan {
  const { oldName, newName } = rename;
  const importers = findImporters(ctx.project, moduleSpecifier).filter((d) => d.getNamedImports().some((n) => n.getName() === oldName));
  return {
    description: `Rename named import "${oldName}" → "${newName}" from "${moduleSpecifier}" (${importers.length} file${importers.length === 1 ? "" : "s"})${noteSuffix(opts)}`,
    touchedFiles: [...new Set(importers.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of importers) {
        for (const spec of decl.getNamedImports()) {
          if (spec.getName() === oldName) {
            spec.setName(newName);
          }
        }
      }
    },
  };
}

/**
 * Convert specific named imports (matched by predicate) to type-only. Use
 * to flip an entire module's imports to `import type` when the value side
 * goes away (the F6 "make X type-only" sweep is the canonical case).
 */
export function makeImportTypeOnly(ctx: CodemodContext, moduleSpecifier: string, filter: ImportSpecFilter = () => true, opts: OperationOptions = {}): Plan {
  const decls = findImporters(ctx.project, moduleSpecifier);
  return {
    description: `Flip imports to type-only from "${moduleSpecifier}"${noteSuffix(opts)}`,
    touchedFiles: [...new Set(decls.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of decls) {
        for (const spec of decl.getNamedImports()) {
          if (filter(spec)) {
            spec.setIsTypeOnly(true);
          }
        }
      }
    },
  };
}

/**
 * The SYMBOL_BUCKET pattern from the chat-restructure-stage2 codemod:
 * given a file whose exports got split into many target files, route every
 * importer to the right destination based on which symbols they're
 * importing. The map keys are symbol names; values are the new module
 * specifier (alias path) for that symbol.
 *
 * After running, you usually want to delete the original `from` file with
 * `deleteFiles(...)` and run `repointAliasPaths(...)` to catch any string-
 * literal references in comments.
 */
/** Group a declaration's named imports by which new module specifier they route to (skipping any
 *  name not in the map — those stay on the original declaration). */
function groupImportsByDestination(
  decl: ImportDeclaration,
  fromSpecifier: string,
  symbolToNewSpecifier: Readonly<Record<string, string>>,
): Map<string, ImportSpecifier[]> {
  const groups = new Map<string, ImportSpecifier[]>();
  for (const spec of decl.getNamedImports()) {
    const dest = symbolToNewSpecifier[spec.getName()];
    if (dest === undefined || dest === fromSpecifier) {
      continue;
    }
    const bucket = groups.get(dest) ?? [];
    bucket.push(spec);
    groups.set(dest, bucket);
  }
  return groups;
}

/** Add-or-merge an import declaration for `dest` carrying `specs`, then remove the specifiers
 *  from their original declaration now that they've moved. */
function routeSpecifiersToDestination(sf: SourceFile, dest: string, specs: readonly ImportSpecifier[]): void {
  const sourceDecl = specs[0]?.getImportDeclaration();
  const incoming = specs.map((s) => {
    const aliasNode = s.getAliasNode();
    return {
      name: s.getName(),
      ...(aliasNode !== undefined ? { alias: aliasNode.getText() } : {}),
      isTypeOnly: sourceDecl?.isTypeOnly() === true || s.isTypeOnly(),
    };
  });
  const target = sf
    .getImportDeclarations()
    .find(
      (decl) =>
        decl.getModuleSpecifierValue() === dest && decl.getNamespaceImport() === undefined && !(decl.isTypeOnly() && decl.getDefaultImport() !== undefined),
    );
  if (target !== undefined) {
    for (const named of incoming) {
      mergeNamedImportInto(target, named);
    }
  } else {
    sf.addImportDeclaration({ moduleSpecifier: dest, namedImports: incoming });
  }
  for (const s of specs) {
    s.remove();
  }
}

export function routeSymbolsByMap(
  ctx: CodemodContext,
  fromSpecifier: string,
  symbolToNewSpecifier: Readonly<Record<string, string>>,
  opts: OperationOptions = {},
): Plan {
  const symbols = Object.keys(symbolToNewSpecifier);

  assert(symbols.length > 0, "routeSymbolsByMap: empty map");
  const matches = findImporters(ctx.project, fromSpecifier).filter((decl) => groupImportsByDestination(decl, fromSpecifier, symbolToNewSpecifier).size > 0);

  return {
    description: `Route ${symbols.length} symbols from "${fromSpecifier}" to per-symbol destinations across ${matches.length} importer(s)${noteSuffix(opts)}`,
    touchedFiles: [...new Set(matches.map((d) => d.getSourceFile().getFilePath()))],
    transform(): void {
      for (const decl of matches) {
        const sf = decl.getSourceFile();
        const groups = groupImportsByDestination(decl, fromSpecifier, symbolToNewSpecifier);
        for (const [dest, specs] of groups) {
          routeSpecifiersToDestination(sf, dest, specs);
        }

        // If leftovers remain, leave the declaration in place (it still
        // points at the old module). If we cleared it out, drop the empty
        // declaration so we don't leave a `from "OLD"` shell.
        if (decl.getNamedImports().length === 0 && decl.getDefaultImport() === undefined && decl.getNamespaceImport() === undefined) {
          decl.remove();
        }
      }
    },
  };
}
