// Symbol & reference + rename operations (TypeScript's reference engine).
// ── §11 ─ Symbol & reference operations ──────────────────────────────────────

import type { SemanticSourceView } from "@orb/tooling/_shared/ts-workspace";
import { canonicalCompilerPath } from "@orb/tooling/_shared/ts-workspace";
import type { Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import { absolutePath, assert, noteSuffix, repoRelative } from "./plans.ts";

/**
 * Find every node in the authored native programs that references the named declaration
 * `name` in `filePath`. The "declaration" is the FIRST exported symbol with
 * that name (interface, type alias, class, function, const). Returns
 * Node[] — the call sites / references themselves, not their declaration.
 *
 * Caveat: this uses ts-morph's LanguageService which is symbol-aware. It
 * follows aliases through re-exports correctly but is slower than text
 * search. For "every file that imports X" use `findImporters()` instead.
 */
export function findReferencesByName(ctx: CodemodContext, filePath: string, name: string): Node[] {
  const workspace = ctx.semantic();
  const views = workspace.sourceViews(absolutePath(filePath, ctx.repoRoot));
  if (views.length === 0) {
    throw new CodemodError(`findReferencesByName: file not in project: ${filePath}`, "Pass a path owned by an authored native TypeScript program.");
  }
  const declarations = views.flatMap(({ sourceFile }) => {
    const declaration = findExportedDeclaration(sourceFile, name);
    return declaration === undefined ? [] : [declaration];
  });
  if (declarations.length === 0) {
    throw new CodemodError(
      `findReferencesByName: no exported declaration "${name}" in ${filePath}`,
      "Confirm the name + check it's exported (this helper only walks exported declarations).",
    );
  }
  const references = new Map<string, Node>();
  for (const declaration of declarations) {
    for (const reference of workspace.findReferences(declaration)) {
      const mutable = ctx.project.getSourceFile(reference.canonicalPath)?.getDescendantAtStartWithWidth(reference.start, reference.end - reference.start);
      if (mutable === undefined) {
        throw new CodemodError(
          `findReferencesByName: semantic reference is outside the editable project: ${repoRelative(reference.canonicalPath, ctx.repoRoot)}.`,
          "Add the authored file to createCodemodProject's globs before editing the returned references.",
        );
      }
      references.set(`${reference.canonicalPath}\0${String(reference.start)}\0${String(reference.end)}`, mutable);
    }
  }
  return [...references.values()];
}

/** Find an exported declaration by name. Returns the first match across
 *  class / interface / type alias / function / variable / enum. */
export function findExportedDeclaration(sf: SourceFile, name: string): Node | undefined {
  const decls = sf.getExportedDeclarations().get(name);
  return decls?.[0];
}

/** Get every symbol exported from a file with its name. Useful for surface
 *  audit codemods. */
export function listExports(sf: SourceFile): Array<{ name: string; declarations: Node[] }> {
  const out: Array<{ name: string; declarations: Node[] }> = [];
  for (const [name, declarations] of sf.getExportedDeclarations()) {
    out.push({ name, declarations: [...declarations] });
  }
  return out;
}

/** Find every CallExpression in the project whose callee is `functionName`.
 *  Useful for "who calls foo()" sweeps. Doesn't follow aliases; for that,
 *  use `findReferencesByName`. */
export function findCallSites(project: Project, functionName: string): Node[] {
  const out: Node[] = [];
  for (const sf of project.getSourceFiles()) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (expr.getText() === functionName) {
        out.push(call);
      }
    }
  }
  return out;
}

function renameDeclaration(sourceFile: SourceFile, oldName: string, newName: string): boolean {
  const declaration = findExportedDeclaration(sourceFile, oldName);
  if (declaration === undefined) {
    return false;
  }
  if (Node.isRenameable(declaration)) {
    declaration.rename(newName);
    return true;
  }
  const identifier = declaration.getFirstDescendantByKind(SyntaxKind.Identifier);
  if (identifier === undefined) {
    throw new CodemodError(`renameExportedSymbol: couldn't find an Identifier on the declaration of "${oldName}"`);
  }
  identifier.rename(newName);
  return true;
}

function renamedProgramTexts(view: SemanticSourceView, oldName: string, newName: string, repoRoot: string): ReadonlyMap<string, string> | undefined {
  const project = view.program.project();
  const before = new Map(project.getSourceFiles().map((file) => [file.getFilePath(), file.getFullText()]));
  if (!renameDeclaration(view.sourceFile, oldName, newName)) {
    return;
  }
  return new Map(
    project
      .getSourceFiles()
      .filter((source) => before.get(source.getFilePath()) !== source.getFullText())
      .map((source) => [canonicalCompilerPath(repoRoot, source.getFilePath()), source.getFullText()]),
  );
}

function collectRenameChanges(views: readonly SemanticSourceView[], oldName: string, newName: string, repoRoot: string): ReadonlyMap<string, string> {
  const changed = new Map<string, string>();
  let renamed = false;
  for (const view of views) {
    const programChanges = renamedProgramTexts(view, oldName, newName, repoRoot);
    if (programChanges === undefined) {
      continue;
    }
    renamed = true;
    for (const [path, text] of programChanges) {
      const prior = changed.get(path);
      if (prior !== undefined && prior !== text) {
        throw new CodemodError(
          `renameExportedSymbol: native compiler programs produced conflicting edits for ${repoRelative(path, repoRoot)}.`,
          "Split the rename by compiler program instead of choosing one world's edit silently.",
        );
      }
      changed.set(path, text);
    }
  }
  assert(renamed, `renameExportedSymbol: no exported "${oldName}" in the selected file`);
  return changed;
}

function applyRenameChanges(ctx: CodemodContext, changed: ReadonlyMap<string, string>): void {
  for (const [path, text] of changed) {
    const mutable = ctx.project.getSourceFile(path);
    if (mutable === undefined) {
      throw new CodemodError(
        `renameExportedSymbol: semantic rename reached a file outside the editable project: ${repoRelative(path, ctx.repoRoot)}.`,
        "Add the authored file to createCodemodProject's globs before applying the rename.",
      );
    }
    ctx.snapshot(mutable);
    mutable.replaceWithText(text);
  }
}

// ── §12 ─ Rename operations ──────────────────────────────────────────────────

/**
 * Rename an exported symbol across the WHOLE project using TypeScript's
 * own reference-resolution. This handles:
 *   - import specifiers that reference the symbol
 *   - identifier references in the symbol's own file
 *   - re-exports
 *   - default-export aliases (`export default X` etc.)
 *
 * Does NOT rename:
 *   - strings that happen to spell the symbol (use `repointAliasPaths` for that)
 *   - JSDoc-ish `@link` references
 *
 * If the declaration isn't found this throws. If the new name collides
 * with another symbol in scope ts-morph throws a manipulation error which
 * the harness catches and refuses to save.
 */
export function renameExportedSymbol(
  ctx: CodemodContext,
  filePath: string,
  rename: { readonly oldName: string; readonly newName: string },
  opts: OperationOptions = {},
): Plan {
  const { oldName, newName } = rename;
  const abs = absolutePath(filePath, ctx.repoRoot);
  assert(ctx.project.getSourceFile(abs) !== undefined, `renameExportedSymbol: file not in project: ${repoRelative(abs, ctx.repoRoot)}`);
  return {
    description: `Rename symbol "${oldName}" → "${newName}" in ${repoRelative(abs, ctx.repoRoot)}${noteSuffix(opts)}`,
    // Only the declaring file is knowable up front; the reference set is a language-service
    // question that can only be asked once the earlier plans have settled. The transform declares
    // it below (`ctx.snapshot`) before the rename touches a byte.
    touchedFiles: [abs],
    transform(innerCtx): void {
      const workspace = innerCtx.semantic();
      const views = workspace.sourceViews(abs);
      assert(views.length > 0, `renameExportedSymbol: no authored compiler program contains ${repoRelative(abs, innerCtx.repoRoot)}`);
      applyRenameChanges(innerCtx, collectRenameChanges(views, oldName, newName, innerCtx.repoRoot));
    },
  };
}
