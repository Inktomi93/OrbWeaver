// The delete trial: each candidate of the named buckets is removed in a throwaway snapshot, and every semantic error
// the removal adds to the files that import it is a reader the graph missed, named by file and line.
//
// - The checked files are the declaring file and its importers, direct or through a chain: a type reaches a reader
//   through modules that never import its home. A declaration in a script file or under `declare global` is global, so
//   the whole program is checked.
// - An error is new when the base program has no error of its code at the same place; a place after the cut in the
//   edited file moves back by the cut's length first.
// - An excess-property error is the object literal that writes the member, and a missing-export error at an import or
//   export is a binding that only names it. A delete removes those sites with the candidate, so they alone leave it
//   named-only. An import binding its own file uses is a read: a failed import types its uses without an error.
// - The control: TypeScript's reportsUnnecessary diagnostics, from the suggestion and the semantic lists (noUnusedLocals
//   reports them as errors), against the graph's dead non-exported units and dead private class members. The graph
//   judges no local, parameter or import, so TypeScript's findings on those list as graph-unjudged.
import { relative } from "node:path";
import type { Declaration, ImportDeclaration, Node, SourceFile } from "@typescript/native/ast";
import {
  getCombinedModifierFlags,
  isCallExpression,
  isClassDeclaration,
  isClassExpression,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isExternalModuleReference,
  isFunctionDeclaration,
  isIdentifier,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isImportSpecifier,
  isImportTypeNode,
  isInterfaceDeclaration,
  isLiteralTypeNode,
  isModuleDeclaration,
  isNamespaceImport,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isPrivateIdentifier,
  isSourceFile,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  ModifierFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import type { Diagnostic } from "@typescript/native/sync";
import { DiagnosticCategory } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { hasFlag } from "../native.ts";
import type { Analysis, Bucket, Finding } from "./analyse.ts";
import { BUCKETS, MEMBER_BUCKETS } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import type { GraphKey } from "./sites.ts";
import { declarationNameOf, isDeclKey } from "./sites.ts";
import { nodeAt } from "./verify.ts";

/** The buckets whose findings name a declaration a delete can remove. */
export const TRIAL_BUCKETS = [
  "dead",
  "operator-only",
  "consumer-only",
  "test-only",
  "type-only",
  "ambient-unused",
  "member-write-only",
  "member-sent-only",
  "member-untouched",
] as const satisfies readonly Bucket[];
export type TrialBucket = (typeof TRIAL_BUCKETS)[number];

/** A trial's outcome: no new error; only sites the delete removes with it; a reader; or no trial ran. */
export const TRIAL_VERDICTS = ["confirmed", "named-only", "refuted", "unresolved"] as const;
export type TrialVerdict = (typeof TRIAL_VERDICTS)[number];

/** What a new error's site does to the removed declaration. */
export const SITE_KINDS = ["write", "binding", "read"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/** One error the removal added: `file:line` in the unedited tree, its TypeScript code, its site kind and its text. */
export interface TrialError {
  readonly at: string;
  readonly code: number;
  readonly kind: SiteKind;
  readonly text: string;
}

/** One candidate's trial: the text the delete removed, the files it checked and the errors it added. */
export interface Trial {
  readonly bucket: TrialBucket;
  readonly label: string;
  readonly verdict: TrialVerdict;
  readonly removed: string;
  readonly checked: readonly string[];
  readonly errors: readonly TrialError[];
  readonly note: string | null;
}

/** Where TypeScript's unused-code diagnostics and the graph stand on one declaration. */
export const CONTROL_SIDES = ["agree", "ts-only", "graph-only", "graph-unjudged"] as const;
export type ControlSide = (typeof CONTROL_SIDES)[number];

/** One control row: the declaration's `file:line` and name, TypeScript's code (null when it reports nothing) and the
 *  graph's bucket, `live`, or the kind of declaration it does not judge. */
export interface ControlRow {
  readonly side: ControlSide;
  readonly at: string;
  readonly name: string;
  readonly code: number | null;
  readonly graph: string;
}

/** The trials of every named bucket's findings, and the unused-diagnostics control. */
export interface TrialReport {
  readonly trials: readonly Trial[];
  readonly control: readonly ControlRow[];
}

// An object literal writes a property its type no longer has.
const EXCESS_PROPERTY = 2353;
const EXCESS_PROPERTY_SUGGESTED = 2561;
const WRITE_CODES: ReadonlySet<number> = new Set([EXCESS_PROPERTY, EXCESS_PROPERTY_SUGGESTED]);
// An import or export names a member its module no longer exports, or a module its last export left.
const NOT_A_MODULE = 2306;
const NO_EXPORTED_MEMBER = 2305;
const NO_EXPORTED_MEMBER_DEFAULT = 2614;
const NO_EXPORTED_MEMBER_SUGGESTED = 2724;
const BINDING_CODES: ReadonlySet<number> = new Set([NOT_A_MODULE, NO_EXPORTED_MEMBER, NO_EXPORTED_MEMBER_DEFAULT, NO_EXPORTED_MEMBER_SUGGESTED]);
// A wire diagnostic carries its category as a plain number.
const ERROR: number = DiagnosticCategory.Error;
// A trial logs its progress every this many candidates.
const PROGRESS_EVERY = 50;

interface Cut {
  readonly pos: number;
  readonly end: number;
}

const sameSpan = (a: Node, b: Node): boolean => a.pos === b.pos && a.end === b.end && a.kind === b.kind;

const TRAILING_COMMA = /^\s*,/u;

// The comma-separated list a node sits in: an object literal's properties, an enum's members, a declaration list.
function commaList(node: Node): readonly Node[] | undefined {
  const { parent } = node;
  if (isObjectLiteralExpression(parent)) {
    return parent.properties;
  }
  if (isEnumDeclaration(parent)) {
    return parent.members;
  }
  return isVariableDeclarationList(parent) ? parent.declarations : undefined;
}

/** The span a delete removes: the whole node with its leading trivia, its statement when it is a declaration list's
 *  only declaration, and in a comma-separated list the comma after it, else the one before it. A type or class member
 *  holds its own separator. */
export function deletion(source: SourceFile, node: Node): Cut {
  const { parent } = node;
  if (isVariableDeclaration(node) && isVariableDeclarationList(parent) && parent.declarations.length === 1 && isVariableStatement(parent.parent)) {
    return { pos: parent.parent.pos, end: parent.parent.end };
  }
  const list = commaList(node);
  const at = list?.findIndex((entry) => sameSpan(entry, node)) ?? -1;
  if (list === undefined || at === -1) {
    return { pos: node.pos, end: node.end };
  }
  const next = list[at + 1];
  if (next !== undefined) {
    return { pos: node.pos, end: next.pos };
  }
  const comma = TRAILING_COMMA.exec(source.text.slice(node.end))?.[0].length ?? 0;
  const previous = list[at - 1];
  return previous === undefined ? { pos: node.pos, end: node.end + comma } : { pos: previous.end, end: node.end + comma };
}

const isStringSpecifier = (node: Node | undefined): node is Node => node !== undefined && (isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node));

// Every module specifier a file names: an import or export, an import-equals, an import type and a dynamic import.
function specifiers(source: SourceFile): readonly Node[] {
  const out: Node[] = [];
  const visit = (node: Node): void => {
    if ((isImportDeclaration(node) || isExportDeclaration(node)) && isStringSpecifier(node.moduleSpecifier)) {
      out.push(node.moduleSpecifier);
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference) && isStringSpecifier(node.moduleReference.expression)) {
      out.push(node.moduleReference.expression);
    } else if (isImportTypeNode(node) && isLiteralTypeNode(node.argument) && isStringSpecifier(node.argument.literal)) {
      out.push(node.argument.literal);
    } else if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword && isStringSpecifier(node.arguments[0])) {
      out.push(node.arguments[0]);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return out;
}

const exported = (declaration: Declaration): boolean => hasFlag(getCombinedModifierFlags(declaration), ModifierFlags.Export);

// A file with no import, export or exported declaration is a script: its declarations are global.
function isModule(source: SourceFile): boolean {
  return source.statements.some(
    (statement) =>
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
        exported(statement)),
  );
}

function inGlobalScope(node: Node): boolean {
  for (let at = node.parent; !isSourceFile(at); at = at.parent) {
    if (isModuleDeclaration(at) && isIdentifier(at.name) && at.name.text === "global") {
      return true;
    }
  }
  return false;
}

/** Which files import which, over every source of the world. */
class Importers {
  readonly #by = new Map<string, Set<string>>();
  readonly #scripts = new Set<string>();
  readonly #all: readonly string[];

  constructor(world: NativeWorld) {
    const sites = world.files.flatMap((source) => specifiers(source).map((node) => ({ file: world.fileOfSource(source), node })));
    const modules = world.symbolsAt(sites.map(({ node }) => node));
    for (const [at, { file }] of sites.entries()) {
      const handle = modules[at]?.declarations[0];
      const target = handle === undefined ? null : world.fileOf(handle);
      if (target !== null && target !== file) {
        const importers = this.#by.get(target) ?? new Set<string>();
        importers.add(file);
        this.#by.set(target, importers);
      }
    }
    for (const source of world.files.filter((file) => !isModule(file))) {
      this.#scripts.add(world.fileOfSource(source));
    }
    this.#all = world.files.map((source) => world.fileOfSource(source)).sort();
  }

  /** The files a removal from `file` can break: `file` and every file that imports it through a chain, or every file
   *  when the declaration is global. */
  checked(file: string, node: Node): readonly string[] {
    if (this.#scripts.has(file) || inGlobalScope(node)) {
      return this.#all;
    }
    const seen = new Set([file]);
    const queue = [file];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      for (const importer of this.#by.get(next) ?? []) {
        if (!seen.has(importer)) {
          seen.add(importer);
          queue.push(importer);
        }
      }
    }
    return [...seen].sort();
  }
}

const errorKey = (code: number, pos: number): string => `${String(code)}@${String(pos)}`;

const firstLine = (text: string): string => text.split("\n")[0] ?? text;

/** The trial session over one built graph and its world. */
class Trials {
  readonly #graph: Graph;
  readonly #world: NativeWorld;
  readonly #root: string;
  readonly #importers: Importers;
  readonly #base = new Map<string, ReadonlySet<string>>();

  constructor(graph: Graph) {
    this.#graph = graph;
    this.#world = graph.state.world;
    this.#root = graph.state.root;
    this.#importers = new Importers(this.#world);
  }

  #absolute(file: string): string {
    return `${this.#root}/${file}`;
  }

  #relative(diagnostic: Diagnostic): string {
    return diagnostic.fileName === undefined ? "" : relative(this.#root, diagnostic.fileName);
  }

  // The base program's errors on each file, read once per file in one request for every file not yet read.
  #baseErrors(files: readonly string[]): void {
    const missing = files.filter((file) => !this.#base.has(file));
    if (missing.length === 0) {
      return;
    }
    const found = this.#world.withProgram((program) => program.getSemanticDiagnostics(missing.map((file) => this.#absolute(file))));
    const byFile = new Map<string, Set<string>>(missing.map((file) => [file, new Set<string>()]));
    for (const diagnostic of found.filter(({ category }) => category === ERROR)) {
      byFile.get(this.#relative(diagnostic))?.add(errorKey(diagnostic.code, diagnostic.pos));
    }
    for (const [file, keys] of byFile) {
      this.#base.set(file, keys);
    }
  }

  #line(file: string, pos: number, diagnostic: Diagnostic): number {
    const source = this.#world.source(file);
    return source === undefined ? (diagnostic.startPosition?.line ?? 0) + 1 : source.getLineAndCharacterOfPosition(pos).line + 1;
  }

  run(bucket: TrialBucket, finding: Finding): Trial {
    const unresolved = (note: string): Trial => ({ bucket, label: finding.label, verdict: "unresolved", removed: "", checked: [], errors: [], note });
    const { key } = finding;
    if (key === null || !isDeclKey(key)) {
      return unresolved("the finding names no declaration");
    }
    const { file, pos, end, kind } = declKeyParts(key);
    const source = this.#world.source(file);
    const node = source === undefined ? undefined : nodeAt(source, { pos, end, kind });
    if (source === undefined || node === undefined) {
      return unresolved("no declaration at the finding's span");
    }
    const cut = deletion(source, node);
    const removed = source.text.slice(cut.pos, cut.end);
    const checked = this.#importers.checked(file, node);
    this.#baseErrors(checked);
    const edit = { file, text: source.text.slice(0, cut.pos) + source.text.slice(cut.end) };
    const { syntax, semantic } = this.#world.withProgram(
      (program) => ({
        syntax: program.getSyntacticDiagnostics(this.#absolute(file)),
        semantic: program.getSemanticDiagnostics(checked.map((at) => this.#absolute(at))),
      }),
      edit,
    );
    if (syntax.length > 0) {
      return { ...unresolved(`the delete edit does not parse: ${firstLine(syntax[0]?.text ?? "")}`), removed, checked };
    }
    const errors = semantic
      .filter(({ category }) => category === ERROR)
      .flatMap((diagnostic) => {
        const at = this.#relative(diagnostic);
        const old = at === file && diagnostic.pos >= cut.pos ? diagnostic.pos + (cut.end - cut.pos) : diagnostic.pos;
        if (this.#base.get(at)?.has(errorKey(diagnostic.code, old)) === true) {
          return [];
        }
        return [this.#error(diagnostic, at, old)];
      });
    return { bucket, label: finding.label, verdict: verdictOf(errors), removed, checked, errors, note: null };
  }

  // A new error at `pos` of `file` in the unedited tree, placed at the reader when an import's own file reads the binding
  // it breaks.
  #error(diagnostic: Diagnostic, file: string, pos: number): TrialError {
    const base = { code: diagnostic.code, text: firstLine(diagnostic.text) };
    const at = `${file}:${String(this.#line(file, pos, diagnostic))}`;
    if (WRITE_CODES.has(diagnostic.code)) {
      return { ...base, at, kind: "write" };
    }
    if (!BINDING_CODES.has(diagnostic.code)) {
      return { ...base, at, kind: "read" };
    }
    const reader = this.#bindingReader(file, pos);
    return reader === undefined
      ? { ...base, at, kind: "binding" }
      : { ...base, at: `${file}:${String(this.#line(file, reader.getStart(reader.getSourceFile()), diagnostic))}`, kind: "read" };
  }

  // The first use, in its own file, of an import binding a missing export or module breaks: the one specifier the error
  // sits on, else every binding of its import. A re-export binds nothing, so it has none.
  #bindingReader(file: string, pos: number): Node | undefined {
    const source = this.#world.source(file);
    let at: Node | undefined = source === undefined ? undefined : touching(source, pos);
    let specifier: Node | undefined;
    while (at !== undefined && !isImportDeclaration(at) && at.kind !== SyntaxKind.SourceFile) {
      specifier = isImportSpecifier(at) ? at : specifier;
      at = at.parent;
    }
    if (source === undefined || at === undefined || !isImportDeclaration(at)) {
      return undefined;
    }
    const statement = at;
    const names = specifier !== undefined && isImportSpecifier(specifier) ? [specifier.name] : importBindings(statement);
    const groups = this.#world.batch(names.map((name) => this.#world.referencedSymbolsOf(name)));
    const nodes = this.#world.batch(
      groups
        .flat()
        .flatMap(({ references }) => references)
        .map((handle) => handle.resolve.gen()),
    );
    return nodes
      .filter((node) => node !== undefined && node.getSourceFile().path === source.path && (node.pos >= statement.end || node.end <= statement.pos))
      .sort((a, b) => (a?.pos ?? 0) - (b?.pos ?? 0))[0];
  }

  // TypeScript's unused-code diagnostics on the product files against the graph's dead units and private members.
  control(analysis: Analysis): readonly ControlRow[] {
    const { state } = this.#graph;
    const product = this.#graph.files.filter((file) => state.product(file) && this.#world.has(file));
    const unused = this.#world
      .withProgram((program) => {
        const files = product.map((file) => this.#absolute(file));
        return [...program.getSuggestionDiagnostics(files), ...program.getSemanticDiagnostics(files)];
      })
      .filter(({ reportsUnnecessary }) => reportsUnnecessary === true);
    const bucketOf = new Map<GraphKey, Bucket>(
      BUCKETS.flatMap((bucket) => analysis[bucket].flatMap(({ key }) => (key === null ? [] : [[key, bucket] as const]))),
    );
    const graphDead = this.#graphDead(analysis);
    const rows = unused.map((diagnostic) => this.#tsRow(diagnostic, graphDead, bucketOf));
    const agreed = new Set(rows.flatMap(({ row, key }) => (row.side === "agree" && key !== undefined ? [key] : [])));
    const graphOnly = [...graphDead].flatMap(([key, bucket]): ControlRow[] => {
      const info = state.decls.get(key);
      return agreed.has(key) || info === undefined
        ? []
        : [{ side: "graph-only", at: `${info.file}:${String(info.line)}`, name: info.name, code: null, graph: bucket }];
    });
    return [...rows.map(({ row }) => row), ...graphOnly];
  }

  // Where the graph stands on the declaration one unused-code diagnostic names.
  #tsRow(
    diagnostic: Diagnostic,
    graphDead: ReadonlyMap<DeclKey, Bucket>,
    bucketOf: ReadonlyMap<GraphKey, Bucket>,
  ): { readonly row: ControlRow; readonly key: DeclKey | undefined } {
    const { state } = this.#graph;
    const file = this.#relative(diagnostic);
    const source = this.#world.source(file);
    const declaration = source === undefined ? undefined : declarationAt(source, diagnostic);
    const key = declaration === undefined ? undefined : state.resolver.keyOf(declaration);
    const base = {
      at: `${file}:${String(this.#line(file, diagnostic.pos, diagnostic))}`,
      name: source?.text.slice(diagnostic.pos, diagnostic.end) ?? "",
      code: diagnostic.code,
    };
    if (key !== undefined && graphDead.has(key)) {
      return { row: { ...base, side: "agree", graph: graphDead.get(key) ?? "" }, key };
    }
    const info = key === undefined ? undefined : state.decls.get(key);
    if (declaration !== undefined && info !== undefined && judged(declaration, info.top)) {
      return { row: { ...base, side: "ts-only", graph: (key === undefined ? undefined : bucketOf.get(key)) ?? "live" }, key };
    }
    return { row: { ...base, side: "graph-unjudged", graph: SyntaxKind[declaration?.kind ?? SyntaxKind.Unknown] }, key };
  }

  // The graph's dead declarations TypeScript can see as unused: a dead unit no export publishes, and a private class
  // member the member buckets hold.
  #graphDead(analysis: Analysis): ReadonlyMap<DeclKey, Bucket> {
    const out = new Map<DeclKey, Bucket>();
    for (const bucket of ["dead", ...MEMBER_BUCKETS] as const) {
      for (const { key } of analysis[bucket]) {
        const node = key !== null && isDeclKey(key) ? this.#nodeOf(key) : undefined;
        if (node !== undefined && isDeclKey(node.key) && (bucket === "dead" ? !exported(node.node as Declaration) : isPrivateMember(node.node))) {
          out.set(node.key, bucket);
        }
      }
    }
    return out;
  }

  #nodeOf(key: DeclKey): { readonly key: DeclKey; readonly node: Node } | undefined {
    const parts = declKeyParts(key);
    const source = this.#world.source(parts.file);
    const node = source === undefined ? undefined : nodeAt(source, parts);
    return node === undefined ? undefined : { key, node };
  }
}

function verdictOf(errors: readonly TrialError[]): TrialVerdict {
  if (errors.length === 0) {
    return "confirmed";
  }
  return errors.every(({ kind }) => kind !== "read") ? "named-only" : "refuted";
}

const isClassMember = (node: Node): boolean => isClassDeclaration(node.parent) || isClassExpression(node.parent);

function isPrivateMember(node: Node): boolean {
  const name = declarationNameOf(node);
  return (
    isClassMember(node) && ((name !== undefined && isPrivateIdentifier(name)) || hasFlag(getCombinedModifierFlags(node as Declaration), ModifierFlags.Private))
  );
}

// A declaration the graph puts in a bucket or keeps live: a top-level unit, or a member its holder lists.
const judged = (node: Node, top: boolean): boolean =>
  top ||
  isClassMember(node) ||
  isInterfaceDeclaration(node.parent) ||
  isTypeLiteralNode(node.parent) ||
  isObjectLiteralExpression(node.parent) ||
  isEnumDeclaration(node.parent);

// The local names an import declaration binds: its default, its namespace and each named specifier.
function importBindings(statement: ImportDeclaration): readonly Node[] {
  const clause = statement.importClause;
  const bindings = clause?.namedBindings;
  const own = clause?.name === undefined ? [] : [clause.name];
  if (bindings === undefined) {
    return own;
  }
  return [...own, ...(isNamespaceImport(bindings) ? [bindings.name] : bindings.elements.map(({ name }) => name))];
}

// The deepest node that starts at `pos`.
function touching(source: SourceFile, pos: number): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (node.pos > pos || node.end <= pos) {
      return;
    }
    if (node.getStart(source) === pos) {
      found = node;
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

// The declaration a diagnostic's span covers: the node with that span, or the declaration it names.
function declarationAt(source: SourceFile, diagnostic: Diagnostic): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (node.pos > diagnostic.pos || node.end < diagnostic.end) {
      return;
    }
    if (node.getStart(source) === diagnostic.pos && node.end === diagnostic.end) {
      found = node;
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  const { parent } = found ?? {};
  const named = parent === undefined || found === undefined ? undefined : declarationNameOf(parent);
  return named !== undefined && found !== undefined && sameSpan(named, found) ? parent : found;
}

/** Run the delete trial over every finding of the named buckets, then the unused-diagnostics control. */
export function runTrials(graph: Graph, analysis: Analysis, buckets: readonly TrialBucket[], log: (line: string) => void): TrialReport {
  const trials = new Trials(graph);
  const candidates = [...new Set(buckets)].flatMap((bucket) => analysis[bucket].map((finding) => ({ bucket, finding })));
  const results: Trial[] = [];
  for (const [at, { bucket, finding }] of candidates.entries()) {
    results.push(trials.run(bucket, finding));
    if ((at + 1) % PROGRESS_EVERY === 0) {
      log(`trial ${String(at + 1)}/${String(candidates.length)}`);
    }
  }
  return { trials: results, control: trials.control(analysis) };
}
