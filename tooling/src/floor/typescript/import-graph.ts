// One TypeScript 7.1 program's import graph and its error diff, for every tool that edits files in a throwaway snapshot
// and checks what the edit breaks. Every file name is absolute, as the program spells it.
//
// - A file that augments another module reaches the files that import that module, directly or through a chain: they
//   read the augmented name through it. A `declare global` block reaches the files that spell a name it declares, and
//   their importers. A script file's declarations are global too, and its readers are the whole program.
// - Two programs report the same error when its file, code and start agree. A start after an edit moves back to the
//   base text first.
import type { ModuleDeclaration, Node, SourceFile, Statement, StringLiteralLikeNode } from "@typescript/native/ast";
import {
  getCombinedModifierFlags,
  isClassDeclaration,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isModuleBlock,
  isModuleDeclaration,
  isNoSubstitutionTemplateLiteral,
  isPropertySignatureDeclaration,
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

// Where a file's declarations reach past its importers: every file, or the importers of each module it augments (by
// that module's resolved file) and of each file that spells a global it declares.
type Reach = "everywhere" | readonly string[];

const nameText = (name: Node | undefined): readonly string[] => (name !== undefined && (isIdentifier(name) || isStringLiteral(name)) ? [name.text] : []);

// The names a `declare global` block declares, with each global interface's members: an augmented interface's reader
// spells the member, not the interface. Undefined for a statement whose names this does not know.
function globalNames(block: ModuleDeclaration): readonly string[] | undefined {
  const { body } = block;
  if (body === undefined || !isModuleBlock(body)) {
    return undefined;
  }
  const names = body.statements.map((statement): readonly string[] | undefined => {
    if (isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap(({ name }) => nameText(name));
    }
    if (isInterfaceDeclaration(statement)) {
      return [
        statement.name.text,
        ...statement.members.flatMap((member) => (isPropertySignatureDeclaration(member) || isMethodSignatureDeclaration(member) ? nameText(member.name) : [])),
      ];
    }
    const named = isFunctionDeclaration(statement) || isClassDeclaration(statement) || isTypeAliasDeclaration(statement) || isEnumDeclaration(statement);
    return named ? nameText(statement.name) : undefined;
  });
  return names.includes(undefined) ? undefined : names.flatMap((list) => list ?? []);
}

// `declare global`, the one module declaration named by an identifier that augments the global scope.
const GLOBAL_SCOPE = "global";
const isGlobalBlock = (statement: Statement): statement is ModuleDeclaration =>
  isModuleDeclaration(statement) && isIdentifier(statement.name) && statement.name.text === GLOBAL_SCOPE;

const REGEX_SPECIAL = /[$()*+.?[\\\]^{|}]/gu;

// Whether a text spells a name as a whole identifier.
const spells = (text: string, name: string): boolean =>
  new RegExp(`(?<![\\w$])${name.replaceAll(REGEX_SPECIAL, (special) => `\\${special}`)}(?![\\w$])`, "u").test(text);

/** Which source files import which, in one program. */
export class ImportGraph {
  readonly #importers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #reach: ReadonlyMap<string, Reach>;
  readonly #files: readonly string[];

  private constructor(importers: ReadonlyMap<string, ReadonlySet<string>>, reach: ReadonlyMap<string, Reach>, files: readonly string[]) {
    this.#importers = importers;
    this.#reach = reach;
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
    // A `declare global` block's name is an identifier; a module augmentation's is the module's specifier.
    const augmenting = sources.filter((source) => source.statements.some(exports) && source.moduleAugmentations.length > 0);
    const named = augmenting.flatMap((source) =>
      source.moduleAugmentations.filter(isModuleSpecifier).map((specifier) => ({ from: source.fileName, specifier })),
    );
    const targets = batch(named.map(({ from, specifier }) => program.getResolvedModuleFromModuleSpecifier.gen(specifier, from)));
    const reach = new Map<string, Reach>(sources.filter((source) => !source.statements.some(exports)).map((source) => [source.fileName, "everywhere"]));
    for (const source of augmenting) {
      const modules = named.flatMap(({ from }, at) => (from === source.fileName ? [targets[at]?.resolvedFileName] : []));
      const blocks = source.statements.filter(isGlobalBlock).map(globalNames);
      // An augmented module the program cannot resolve, or a global this cannot name, leaves no narrower answer.
      if (modules.includes(undefined) || blocks.includes(undefined)) {
        reach.set(source.fileName, "everywhere");
        continue;
      }
      const globals = blocks.flatMap((names) => names ?? []);
      const spelling =
        globals.length === 0
          ? []
          : sources.filter((other) => other !== source && globals.some((name) => spells(other.text, name))).map(({ fileName }) => fileName);
      reach.set(source.fileName, [...modules.filter((file) => file !== undefined), ...spelling]);
    }
    return new ImportGraph(
      importers,
      reach,
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

  /** The files besides `file` an edit of it can break: its importers, and the reach of each of them and of `file`
   *  that augments a module or the global scope; every other source when the edit itself augments (`augmenting`). */
  readers(file: string, augmenting: boolean): readonly string[] {
    const importers = this.importers(file);
    const reaches = [file, ...importers].flatMap((at) => {
      const reach = this.#reach.get(at);
      return reach === undefined ? [] : [reach];
    });
    if (augmenting || reaches.includes("everywhere")) {
      return this.#files.filter((name) => name !== file);
    }
    const reached = reaches.flatMap((reach) => (reach === "everywhere" ? [] : reach));
    const readers = new Set([...importers, ...reached, ...reached.flatMap((at) => this.importers(at))]);
    readers.delete(file);
    return [...readers];
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
