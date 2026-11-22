// The delete trial: each candidate of the named buckets is removed in a throwaway snapshot, with every export
// specifier and re-export that names it, and every error the removal adds to the files that import an edited file,
// directly or through a chain, is a reader the graph missed, named by file and line.
//
// - The import graph, the global and augmentation reach and the same-error key are the shared ones in
//   tooling/src/floor/typescript/import-graph.ts.
// - An error inside an import or export declaration only names the candidate, so a delete removes or rewrites that
//   site with it: a binding. An excess-property error is the object literal that writes the member. Bindings and
//   writes alone leave a candidate named-only. An import binding its own file uses is a read, placed at the use: a
//   failed import types its uses without an error.
// - The control: TypeScript's reportsUnnecessary diagnostics, from the suggestion and the semantic lists (noUnusedLocals
//   reports them as errors), against the graph's dead non-exported units and dead private class members. The graph
//   judges no local, parameter or import, so TypeScript's findings on those list as graph-unjudged.
import { relative } from "node:path";
import type { Declaration, Node, SourceFile } from "@typescript/native/ast";
import {
  getCombinedModifierFlags,
  isClassDeclaration,
  isClassExpression,
  isEnumDeclaration,
  isExportAssignment,
  isExportDeclaration,
  isExportSpecifier,
  isImportDeclaration,
  isImportSpecifier,
  isInterfaceDeclaration,
  isNamedExports,
  isNamespaceImport,
  isObjectLiteralExpression,
  isPrivateIdentifier,
  isSourceFile,
  isTypeLiteralNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  ModifierFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import type { Diagnostic } from "@typescript/native/sync";
import type { AddedError, Splice } from "../../floor/typescript/import-graph.ts";
import { addedErrors, ImportGraph, spliced } from "../../floor/typescript/import-graph.ts";
import type { NativeWorld } from "../native.ts";
import { hasFlag } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Analysis, Bucket, Finding } from "./analyse.ts";
import { BUCKETS, MEMBER_BUCKETS } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts, Resolver } from "./resolve.ts";
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

/** One span a delete removed, by its repository-relative file. */
export interface Removal {
  readonly file: string;
  readonly text: string;
}

/** One candidate's trial: what the delete removed, the files it checked and the errors it added. */
export interface Trial {
  readonly bucket: TrialBucket;
  readonly label: string;
  readonly verdict: TrialVerdict;
  readonly removed: readonly Removal[];
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
// A trial logs its progress every this many candidates.
const PROGRESS_EVERY = 50;

const sameSpan = (a: Node, b: Node): boolean => a.pos === b.pos && a.end === b.end && a.kind === b.kind;

const TRAILING_COMMA = /^\s*,/u;

// The comma-separated list a node sits in: an object literal's properties, an enum's members, a declaration list or an
// export list.
function commaList(node: Node): readonly Node[] | undefined {
  const { parent } = node;
  if (isObjectLiteralExpression(parent)) {
    return parent.properties;
  }
  if (isEnumDeclaration(parent)) {
    return parent.members;
  }
  if (isNamedExports(parent)) {
    return parent.elements;
  }
  return isVariableDeclarationList(parent) ? parent.declarations : undefined;
}

const wholeOf = (node: Node): Splice => ({ start: node.pos, end: node.end, text: "" });

/** The span a delete removes: the whole node with its leading trivia, its statement when it is a declaration or export
 *  list's only entry, and in a comma-separated list the comma after it, else the one before it. A type or class member
 *  holds its own separator. */
export function deletion(source: SourceFile, node: Node): Splice {
  const { parent } = node;
  if (isVariableDeclaration(node) && isVariableDeclarationList(parent) && parent.declarations.length === 1 && isVariableStatement(parent.parent)) {
    return wholeOf(parent.parent);
  }
  if (isExportSpecifier(node) && isNamedExports(parent) && parent.elements.length === 1) {
    return wholeOf(parent.parent);
  }
  const list = commaList(node);
  const at = list?.findIndex((entry) => sameSpan(entry, node)) ?? -1;
  if (list === undefined || at === -1) {
    return wholeOf(node);
  }
  const next = list[at + 1];
  if (next !== undefined) {
    return { start: node.pos, end: next.pos, text: "" };
  }
  const comma = TRAILING_COMMA.exec(source.text.slice(node.end))?.[0].length ?? 0;
  const previous = list[at - 1];
  return { start: previous === undefined ? node.pos : previous.end, end: node.end + comma, text: "" };
}

const exported = (declaration: Declaration): boolean => hasFlag(getCombinedModifierFlags(declaration), ModifierFlags.Export);

// The import or export declaration a node sits in.
function moduleSite(node: Node | undefined): Node | undefined {
  for (let at = node; at !== undefined && !isSourceFile(at); at = at.parent) {
    if (isImportDeclaration(at) || isExportDeclaration(at) || isExportAssignment(at)) {
      return at;
    }
  }
  return undefined;
}

// The local names an import declaration binds: its default, its namespace and each named specifier.
function importBindings(statement: Node): readonly Node[] {
  if (!isImportDeclaration(statement)) {
    return [];
  }
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

const firstLine = (text: string): string => text.split("\n")[0] ?? text;

// The edits a delete makes, by repository-relative file.
type Edits = ReadonlyMap<string, readonly Splice[]>;

/** The trial session over one built graph and its world. */
class Trials {
  readonly #graph: Graph;
  readonly #world: NativeWorld;
  readonly #root: string;
  readonly #imports: ImportGraph;
  readonly #base = new Map<string, readonly Diagnostic[]>();
  #resolver: Resolver | null = null;

  constructor(graph: Graph, world: NativeWorld, root: string) {
    this.#graph = graph;
    this.#world = world;
    this.#root = root;
    this.#imports = ImportGraph.build(world.program, (requests) => world.batch(requests), world.files);
  }

  #absolute(file: string): string {
    return `${this.#root}/${file}`;
  }

  #relative(diagnostic: Diagnostic): string {
    return diagnostic.fileName === undefined ? "" : relative(this.#root, diagnostic.fileName);
  }

  // The base program's errors on each file, read once per file in one request for every file not yet read.
  #baseErrors(files: readonly string[]): readonly Diagnostic[] {
    const missing = files.filter((file) => !this.#base.has(file));
    if (missing.length > 0) {
      const found = this.#world.program.getSemanticDiagnostics(missing.map((file) => this.#absolute(file)));
      const byFile = new Map<string, Diagnostic[]>(missing.map((file) => [file, []]));
      for (const diagnostic of found) {
        byFile.get(this.#relative(diagnostic))?.push(diagnostic);
      }
      for (const [file, diagnostics] of byFile) {
        this.#base.set(file, diagnostics);
      }
    }
    return files.flatMap((file) => this.#base.get(file) ?? []);
  }

  #line(file: string, pos: number, diagnostic: Diagnostic): number {
    const source = this.#world.source(file);
    return source === undefined ? (diagnostic.startPosition?.line ?? 0) + 1 : source.getLineAndCharacterOfPosition(pos).line + 1;
  }

  /** The export specifiers and default exports that name each candidate, in any file, by find-references on its name. */
  exportSites(nodes: readonly (Node | undefined)[]): readonly (readonly Node[])[] {
    const world = this.#world;
    const names = nodes.map((node) => (node === undefined ? undefined : declarationNameOf(node)));
    const groups = world.batch(names.map((name) => (name === undefined ? noReferences() : world.referencedSymbolsOf(name))));
    const handles = groups.map((entries) => entries.flatMap(({ references }) => references).filter((handle) => world.fileOf(handle) !== null));
    const resolved = world.batch(handles.flat().map((handle) => handle.resolve.gen()));
    let at = 0;
    return handles.map((list) => {
      const found = resolved.slice(at, at + list.length);
      at += list.length;
      return found.flatMap((reference): Node[] => {
        const { parent } = reference ?? {};
        if (parent !== undefined && isExportSpecifier(parent)) {
          return [parent];
        }
        return parent !== undefined && isExportAssignment(parent) ? [parent] : [];
      });
    });
  }

  run(bucket: TrialBucket, finding: Finding, node: Node | undefined, exportSites: readonly Node[]): Trial {
    const unresolved = (note: string, cut: readonly Removal[] = []): Trial => ({
      bucket,
      label: finding.label,
      verdict: "unresolved",
      removed: cut,
      checked: [],
      errors: [],
      note,
    });
    const { key } = finding;
    if (key === null || !isDeclKey(key) || node === undefined) {
      return unresolved("no declaration at the finding's span");
    }
    const edits = this.#edits(key, node, exportSites);
    const removed = [...edits].flatMap(([file, splices]) =>
      splices.map(({ start, end }) => ({ file, text: this.#world.source(file)?.text.slice(start, end) ?? "" })),
    );
    const edited = [...edits.keys()];
    const checked = [
      ...new Set([...edited, ...edited.flatMap((file) => this.#imports.readers(this.#absolute(file), false).map((at) => relative(this.#root, at)))]),
    ].sort();
    const base = this.#baseErrors(checked);
    const texts = Object.fromEntries(edited.map((file) => [this.#absolute(file), spliced(this.#world.source(file)?.text ?? "", edits.get(file) ?? [])]));
    const { syntax, added } = this.#world.trial(texts, (program) => ({
      syntax: program.getSyntacticDiagnostics(edited.map((file) => this.#absolute(file))),
      added: addedErrors(
        base,
        program.getSemanticDiagnostics(checked.map((file) => this.#absolute(file))),
        new Map([...edits].map(([file, splices]) => [this.#absolute(file), splices])),
      ),
    }));
    if (syntax.length > 0) {
      return unresolved(`the delete edit does not parse: ${firstLine(syntax[0]?.text ?? "")}`, removed);
    }
    const errors = added.map((error) => this.#error(error));
    return { bucket, label: finding.label, verdict: verdictOf(errors), removed, checked, errors, note: null };
  }

  // The candidate's own span and each export site that names it.
  #edits(key: DeclKey, node: Node, exportSites: readonly Node[]): Edits {
    const edits = new Map<string, Splice[]>();
    const add = (at: string, splice: Splice): void => {
      const list = edits.get(at) ?? [];
      if (!list.some(({ start, end }) => start < splice.end && splice.start < end)) {
        list.push(splice);
      }
      edits.set(at, list);
    };
    const { file } = declKeyParts(key);
    add(file, deletion(node.getSourceFile(), node));
    for (const site of exportSites) {
      const source = site.getSourceFile();
      add(this.#world.fileOfSource(source), isExportAssignment(site) ? wholeOf(site) : deletion(source, site));
    }
    return edits;
  }

  // A new error, placed at the reader when an import's own file reads the binding it breaks.
  #error({ diagnostic, pos }: AddedError): TrialError {
    const file = this.#relative(diagnostic);
    const base = { code: diagnostic.code, text: firstLine(diagnostic.text) };
    const at = `${file}:${String(this.#line(file, pos, diagnostic))}`;
    const source = this.#world.source(file);
    const site = source === undefined ? undefined : moduleSite(touching(source, pos));
    if (site === undefined) {
      return { ...base, at, kind: WRITE_CODES.has(diagnostic.code) ? "write" : "read" };
    }
    const reader = source === undefined ? undefined : this.#bindingReader(source, site, pos);
    return reader === undefined
      ? { ...base, at, kind: "binding" }
      : { ...base, at: `${file}:${String(this.#line(file, reader.getStart(source), diagnostic))}`, kind: "read" };
  }

  // The first use, in its own file, of an import binding the delete breaks: the one specifier the error sits on, else
  // every binding of its import. An export binds nothing in its file, so it has none.
  #bindingReader(source: SourceFile, statement: Node, pos: number): Node | undefined {
    let specifier: Node | undefined = touching(source, pos);
    while (specifier !== undefined && !isImportSpecifier(specifier) && specifier !== statement && !isSourceFile(specifier)) {
      specifier = specifier.parent;
    }
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
    const { facts } = this.#graph;
    const product = this.#graph.files.filter((file) => isProduction(file) && this.#world.has(file)).map((file) => this.#absolute(file));
    const { program } = this.#world;
    const unused = [...program.getSuggestionDiagnostics(product), ...program.getSemanticDiagnostics(product)].filter(
      ({ reportsUnnecessary }) => reportsUnnecessary === true,
    );
    const bucketOf = new Map<GraphKey, Bucket>(
      BUCKETS.flatMap((bucket) => analysis[bucket].flatMap(({ key }) => (key === null ? [] : [[key, bucket] as const]))),
    );
    const graphDead = this.#graphDead(analysis);
    const rows = unused.map((diagnostic) => this.#tsRow(diagnostic, graphDead, bucketOf));
    const agreed = new Set(rows.flatMap(({ row, key }) => (row.side === "agree" && key !== undefined ? [key] : [])));
    const graphOnly = [...graphDead].flatMap(([key, bucket]): ControlRow[] => {
      const info = facts.decls.get(key);
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
    const { facts } = this.#graph;
    const file = this.#relative(diagnostic);
    const source = this.#world.source(file);
    const declaration = source === undefined ? undefined : declarationAt(source, diagnostic);
    this.#resolver ??= new Resolver(this.#world);
    const key = declaration === undefined ? undefined : this.#resolver.keyOf(declaration);
    const base = {
      at: `${file}:${String(this.#line(file, diagnostic.pos, diagnostic))}`,
      name: source?.text.slice(diagnostic.pos, diagnostic.end) ?? "",
      code: diagnostic.code,
    };
    if (key !== undefined && graphDead.has(key)) {
      return { row: { ...base, side: "agree", graph: graphDead.get(key) ?? "" }, key };
    }
    const info = key === undefined ? undefined : facts.decls.get(key);
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
        const node = key !== null && isDeclKey(key) ? this.nodeOf(key) : undefined;
        if (key !== null && isDeclKey(key) && node !== undefined && (bucket === "dead" ? !exported(node as Declaration) : isPrivateMember(node))) {
          out.set(key, bucket);
        }
      }
    }
    return out;
  }

  /** The declaration a key names, in the world's parse. */
  nodeOf(key: DeclKey): Node | undefined {
    const parts = declKeyParts(key);
    const source = this.#world.source(parts.file);
    return source === undefined ? undefined : nodeAt(source, parts);
  }
}

function* noReferences(): ReturnType<NativeWorld["referencedSymbolsOf"]> {
  yield* [];
  return [];
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
export function runTrials(
  graph: Graph,
  world: NativeWorld,
  run: { readonly root: string; readonly analysis: Analysis; readonly buckets: readonly TrialBucket[] },
  log: (line: string) => void,
): TrialReport {
  const trials = new Trials(graph, world, run.root);
  const candidates = [...new Set(run.buckets)].flatMap((bucket) => run.analysis[bucket].map((finding) => ({ bucket, finding })));
  const nodes = candidates.map(({ finding: { key } }) => (key !== null && isDeclKey(key) ? trials.nodeOf(key) : undefined));
  const exportSites = trials.exportSites(nodes);
  const results: Trial[] = [];
  for (const [at, { bucket, finding }] of candidates.entries()) {
    results.push(trials.run(bucket, finding, nodes[at], exportSites[at] ?? []));
    if ((at + 1) % PROGRESS_EVERY === 0) {
      log(`trial ${String(at + 1)}/${String(candidates.length)}`);
    }
  }
  return { trials: results, control: trials.control(run.analysis) };
}
