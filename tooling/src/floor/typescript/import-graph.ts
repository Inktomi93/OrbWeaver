// One TypeScript 7.1 program's import graph and its error diff, for every tool that edits files in a throwaway snapshot
// and checks what the edit breaks. Every file name is absolute, as the program spells it.
//
// - A file that augments a global or another module reaches files that never import it: they read the augmented name
//   through the module they do import. A script file's declarations are global. Neither file's readers are on the
//   import graph, so the whole program is.
// - Two programs report the same error when its file, code and start agree. A start after an edit moves back to the
//   base text first.
import type { Node, SourceFile, Statement, StringLiteralLikeNode } from "@typescript/native/ast";
import {
  getCombinedModifierFlags,
  isClassDeclaration,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isModuleDeclaration,
  isNoSubstitutionTemplateLiteral,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableStatement,
  ModifierFlags,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Diagnostic, Program } from "@typescript/native/sync";
import { DiagnosticCategory } from "@typescript/native/sync";

/** Runs request generators against one API process, keeping their order. */
export type Batch = <T>(requests: readonly APIRequestGenerator<T>[]) => T[];

const isModuleSpecifier = (node: Node): node is StringLiteralLikeNode => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

/** Every module specifier the parser collected for a file: imports, exports, import-equals, import types and dynamic
 *  imports. A module augmentation's name is not one; {@link augments} covers it. */
export const moduleSpecifiers = (source: SourceFile): readonly StringLiteralLikeNode[] => source.imports.filter(isModuleSpecifier);

const AUGMENTATION = /^[ \t]*(?:export[ \t]+)?declare[ \t]+(?:global\b|module[ \t]+["'])/mu;

/** Whether source or declaration text augments a global or another module. */
export const augments = (text: string): boolean => AUGMENTATION.test(text);

// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript modifier flags are a compiler-owned bitfield.
const exported = (statement: Parameters<typeof getCombinedModifierFlags>[0]): boolean => (getCombinedModifierFlags(statement) & ModifierFlags.Export) !== 0;

const exports = (statement: Statement): boolean =>
  isImportDeclaration(statement) ||
  isImportEqualsDeclaration(statement) ||
  isExportDeclaration(statement) ||
  isExportAssignment(statement) ||
  (isVariableStatement(statement) && statement.declarationList.declarations.some(exported)) ||
  ((isFunctionDeclaration(statement) ||
    isClassDeclaration(statement) ||
    isInterfaceDeclaration(statement) ||
    isTypeAliasDeclaration(statement) ||
    isEnumDeclaration(statement) ||
    isModuleDeclaration(statement)) &&
    exported(statement));

/** Which source files import which, in one program. */
export class ImportGraph {
  readonly #importers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #global: ReadonlySet<string>;
  readonly #files: readonly string[];

  private constructor(importers: ReadonlyMap<string, ReadonlySet<string>>, global: ReadonlySet<string>, files: readonly string[]) {
    this.#importers = importers;
    this.#global = global;
    this.#files = files;
  }

  /** The graph over `sources`, each specifier resolved by the program. */
  static build(program: Program, batch: Batch, sources: readonly SourceFile[]): ImportGraph {
    const edges = sources.flatMap((source) => moduleSpecifiers(source).map((specifier) => ({ from: source.fileName, specifier })));
    const resolved = batch(edges.map(({ from, specifier }) => program.getResolvedModuleFromModuleSpecifier.gen(specifier, from)));
    const importers = new Map<string, Set<string>>();
    for (const [at, { from }] of edges.entries()) {
      const target = resolved[at]?.resolvedFileName;
      if (target !== undefined && target !== from) {
        importers.set(target, (importers.get(target) ?? new Set()).add(from));
      }
    }
    const global = sources.filter((source) => augments(source.text) || !source.statements.some(exports)).map((source) => source.fileName);
    return new ImportGraph(
      importers,
      new Set(global),
      sources.map((source) => source.fileName),
    );
  }

  /** Every file that imports `file`, directly or through a chain; `file` itself excluded. */
  importers(file: string): readonly string[] {
    const seen = new Set([file]);
    const queue = [file];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const importer of this.#importers.get(next) ?? []) {
        if (!seen.has(importer)) {
          seen.add(importer);
          queue.push(importer);
        }
      }
    }
    seen.delete(file);
    return [...seen];
  }

  /** The files besides `file` an edit of it can break: its importers, or every other source when the edit augments
   *  (`augmenting`), the file is global, or an importer is. */
  readers(file: string, augmenting: boolean): readonly string[] {
    const importers = this.importers(file);
    const global = augmenting || this.#global.has(file) || importers.some((importer) => this.#global.has(importer));
    return global ? this.#files.filter((name) => name !== file) : importers;
  }
}

// The wire carries a diagnostic's category as a plain number.
const ERROR_CATEGORY: number = DiagnosticCategory.Error;

/** The errors among diagnostics. */
export const errorsOf = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] => diagnostics.filter(({ category }) => category === ERROR_CATEGORY);

/** One replacement in a file, by its span in the base text. */
export interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const inOrder = (splices: readonly Splice[]): readonly Splice[] => splices.toSorted((a, b) => a.start - b.start);

/** A base text with its splices applied; the splices must not overlap. */
export function spliced(text: string, splices: readonly Splice[]): string {
  let out = "";
  let at = 0;
  for (const { start, end, text: replacement } of inOrder(splices)) {
    out += text.slice(at, start) + replacement;
    at = end;
  }
  return out + text.slice(at);
}

/** Where a start in the spliced text sits in the base text; a start inside a replacement maps to the splice's start. */
export function basePosition(splices: readonly Splice[], pos: number): number {
  let shift = 0;
  for (const { start, end, text } of inOrder(splices)) {
    const newStart = start + shift;
    if (pos < newStart) {
      return pos - shift;
    }
    if (pos < newStart + text.length) {
      return start;
    }
    shift += text.length - (end - start);
  }
  return pos - shift;
}

/** An error's identity across two programs: its file, code and start. */
export const diagnosticKey = (diagnostic: Diagnostic, pos: number = diagnostic.pos): string =>
  `${diagnostic.fileName ?? ""}:${String(diagnostic.code)}@${String(pos)}`;

/** An error an edit added, with its start in the base text. */
export interface AddedError {
  readonly diagnostic: Diagnostic;
  readonly pos: number;
}

/** The errors of `next` that `base` lacks. `splices` holds each edited file's edits, by absolute file name, so an
 *  error after an edit is matched at its base start. */
export function addedErrors(
  base: readonly Diagnostic[],
  next: readonly Diagnostic[],
  splices: ReadonlyMap<string, readonly Splice[]> = new Map(),
): readonly AddedError[] {
  const known = new Set(errorsOf(base).map((diagnostic) => diagnosticKey(diagnostic)));
  return errorsOf(next).flatMap((diagnostic) => {
    const edits = splices.get(diagnostic.fileName ?? "");
    const pos = edits === undefined ? diagnostic.pos : basePosition(edits, diagnostic.pos);
    return known.has(diagnosticKey(diagnostic, pos)) ? [] : [{ diagnostic, pos }];
  });
}
