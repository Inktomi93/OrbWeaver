// The delete trial: each candidate of the named buckets is removed in a throwaway snapshot, with every export
// specifier and re-export that names it, and every error the removal adds to the files that can break is a reader the
// graph missed, named by file and line.
//
// - The files that can break are the edited files and every file the import graph says an edit of them reaches
//   (Trials #checkedFor). Only a file that sees an edited file's declarations can gain an error, and it sees them only
//   through an import chain, an augmentation, a global or a script file: the graph's reach covers each. A file that
//   names the member, its holder or a computed member's key without such a chain cannot see the delete.
// - The import graph, the global and augmentation reach and the same-error key are the shared ones in
//   tooling/src/floor/typescript/import-graph.ts.
// - An error inside an import or export declaration only names the candidate, so a delete removes or rewrites that
//   site with it: a binding. An excess-property error is the object literal that writes the member. Bindings and
//   writes alone leave a candidate named-only. An import binding its own file uses is a read, placed at the use: a
//   failed import types its uses without an error.
// - An unused-code diagnostic (reportsUnnecessary) the delete adds is a declaration only the candidate read, not a
//   reader of the candidate, so it refutes nothing and is dropped.
// - Reads only outside the product (a test, a type test, tooling) make the verdict refuted-test-only: a test read
//   annotates a candidate and never keeps it.
// - Before any snapshot, find-references on each candidate (./verify.ts referencesOf): a product read the checker
//   resolves to the candidate refutes it with no compile (refuted-references). The same pass gives the export sites a
//   delete removes and the occurrence spans that attribute a group's errors, ahead of the base-symbol owner.
// - tsc's own unused verdict, a reportsUnnecessary diagnostic at the candidate's name in the base program, is recorded
//   beside each trial and never decides it.
// - A compile-clean candidate is confirmed-literal when a hit of its name outside its own sites, in product source or
//   loaded product data, names its own declaration, through the fields literal stage's own judge (../literal-hits.ts):
//   the checker resolves it there, or it is a read or a data key off a value whose type carries the member. A hit in a
//   test, the tooling or a config only annotates, and a code hit the checker resolves to another declaration of the
//   name is no hit. A name is searched by the word it is read by (a computed member by its key's value); a private name
//   is never searched, and a name that is not one word keeps confirmed with a note.
// - A compile error under snap counts as a product read (D357, ./state.ts productReader), in the trial and in the
//   control. A literal hit under snap only annotates: the literal judge holds a hit in product source alone.
// - The control: TypeScript's reportsUnnecessary diagnostics, from the suggestion and the semantic lists (noUnusedLocals
//   reports them as errors), against the graph's dead non-exported units and dead private class members. The graph
//   judges no local, parameter or import, so TypeScript's findings on those list as graph-unjudged.
import { relative } from "node:path";
import type { Declaration, Expression, Node, SourceFile } from "@typescript/native/ast";
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
  isMethodDeclaration,
  isNamedExports,
  isNamespaceImport,
  isObjectLiteralExpression,
  isPrivateIdentifier,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isSourceFile,
  isTypeLiteralNode,
  isVariableDeclaration,
  isVariableDeclarationList,
  isVariableStatement,
  ModifierFlags,
  SyntaxKind,
} from "@typescript/native/ast";
import type { Diagnostic, ProjectId } from "@typescript/native/sync";
import type { AddedError, Splice } from "../../floor/typescript/import-graph.ts";
import { addedErrors, ImportGraph, spliced } from "../../floor/typescript/import-graph.ts";
import type { Verdict } from "../field-sort.ts";
import type { LiteralEvidence } from "../literal-hits.ts";
import { isLiteralName, ownSiteKey, rowsEvidence, searchedWord, searchLiterals } from "../literal-hits.ts";
import type { NativeWorld } from "../native.ts";
import { hasFlag, propertiesNamed, TRIAL_STEPS } from "../native.ts";
import type { Analysis, Bucket, Finding } from "./analyse.ts";
import { BUCKETS, MEMBER_BUCKETS } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { nodeAt } from "./declared.ts";
import { judgeMembers, NO_RULINGS, verdictsByDecl } from "./judge.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts, keyText, Resolver } from "./resolve.ts";
import type { GraphKey } from "./sites.ts";
import { declarationNameOf, isDeclKey } from "./sites.ts";
import { productReader } from "./state.ts";
import type { FindingReferences } from "./verify.ts";
import { evenSample, referencesOf } from "./verify.ts";

/** The buckets whose findings name a declaration a delete can remove. */
export const TRIAL_BUCKETS = [
  "dead",
  "operator-only",
  "consumer-only",
  "testkit-only",
  "tooling-only",
  "test-direct-only",
  "type-only",
  "ambient-unused",
  "member-write-only",
  "member-sent-only",
  "member-untouched",
] as const satisfies readonly Bucket[];
export type TrialBucket = (typeof TRIAL_BUCKETS)[number];

/** A trial's outcome: no new error and no literal hit of its name; no new error, but a hit of its name outside its own
 *  sites that can be a read the compiler does not see (a string key, a JSON key); only sites the delete removes with it; a product read find-references names, with
 *  no compile; a product reader the compile found; readers outside the product only; or no trial ran. */
export const TRIAL_VERDICTS = ["confirmed", "confirmed-literal", "named-only", "refuted-references", "refuted", "refuted-test-only", "unresolved"] as const;
type TrialVerdict = (typeof TRIAL_VERDICTS)[number];

// What a new error's site does to the removed declaration.
const SITE_KINDS = ["write", "binding", "read"] as const;
type SiteKind = (typeof SITE_KINDS)[number];

// One error the removal added: `file:line` in the unedited tree, its TypeScript code, its site kind, whether the site
// is product source and its text.
interface TrialError {
  readonly at: string;
  readonly code: number;
  readonly kind: SiteKind;
  readonly product: boolean;
  readonly text: string;
}

// One span a delete removed, by its repository-relative file.
interface Removal {
  readonly file: string;
  readonly text: string;
}

// One candidate's trial: the product reads find-references named (`file:line`), what the delete removed, the files it
// checked, the errors it added, how many snapshots held it and whether tsc reports it unused.
export interface Trial {
  readonly bucket: TrialBucket;
  readonly label: string;
  readonly verdict: TrialVerdict;
  readonly references: readonly string[];
  readonly removed: readonly Removal[];
  readonly checked: readonly string[];
  readonly errors: readonly TrialError[];
  readonly compiles: number;
  readonly tsUnused: boolean;
  readonly note: string | null;
  /** For a compile-clean candidate, the hits of its name outside its own sites and off other declarations of the name,
   *  the ones that can be a read first: the reason for confirmed-literal, else an annotation on confirmed. */
  readonly literal: LiteralEvidence["hits"];
}

/** Where a run keeps each trial as it lands, and the trials an earlier run of the same tree already kept. */
export interface TrialLedger {
  readonly recorded: (bucket: TrialBucket, key: DeclKey) => Trial | undefined;
  readonly record: (bucket: TrialBucket, key: DeclKey, trial: Trial) => void;
}

/** The trial's phases, in run order. */
export const TRIAL_PHASES = ["references", "unused", ...TRIAL_STEPS, "attribution", "literal"] as const;
type TrialPhase = (typeof TRIAL_PHASES)[number];

// One phase's wall time and the compiler requests it sent, with their server and round-trip time; the request
// figures are zero unless the world collects timing.
interface PhaseCost {
  readonly ms: number;
  readonly requests: number;
  readonly serverMs: number;
  readonly roundTripMs: number;
}

/** Where TypeScript's unused-code diagnostics and the graph stand on one declaration. */
export const CONTROL_SIDES = ["agree", "ts-only", "graph-only", "graph-unjudged"] as const;
type ControlSide = (typeof CONTROL_SIDES)[number];

// One control row: the declaration's `file:line` and name, TypeScript's code (null when it reports nothing) and the
// graph's bucket, `live`, or the kind of declaration it does not judge.
interface ControlRow {
  readonly side: ControlSide;
  readonly at: string;
  readonly name: string;
  readonly code: number | null;
  readonly graph: string;
}

/** The trials of every named bucket's findings, the unused-diagnostics control, and each phase's cost. */
export interface TrialReport {
  /** The tracked files the literal pass searched, or null for a root with no git index, where confirmed is the compile's
   *  word alone. */
  readonly literalFiles: number | null;
  readonly trials: readonly Trial[];
  readonly control: readonly ControlRow[];
  readonly phases: Readonly<Record<TrialPhase, PhaseCost>>;
}

// An object literal writes a property its type no longer has.
const EXCESS_PROPERTY = 2353;
const EXCESS_PROPERTY_SUGGESTED = 2561;
const WRITE_CODES: ReadonlySet<number> = new Set([EXCESS_PROPERTY, EXCESS_PROPERTY_SUGGESTED]);

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

// The span a delete removes: the whole node with its leading trivia, its statement when it is a declaration or export
// list's only entry, and in a comma-separated list the comma after it, else the one before it. A type or class member
// holds its own separator.
function deletion(source: SourceFile, node: Node): Splice {
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

// One finding ready to trial: its bucket, its declaration's key, the edits that delete it, its find-references
// occurrences and tsc's unused verdict.
interface Candidate {
  readonly bucket: TrialBucket;
  readonly finding: Finding;
  readonly key: DeclKey;
  readonly edits: Edits;
  readonly occurrences: readonly Node[];
  readonly tsUnused: boolean;
}

// An added error no single candidate of its group owns.
const UNOWNED = -1;
const MS_PER_MINUTE = 60_000;
// The rate a progress line divides by never starts below this, so the first group does not print a huge rate.
const MIN_MINUTES = 1 / 60;

// A snapshot pays a fixed price whatever it deletes (a fresh program, every checked file rechecked), so the candidates
// of many declaring files share one, and only a group with an error splits. The cap bounds one snapshot's edited and
// checked files on a whole-tree run.
const GROUP_CANDIDATES = 256;

const unresolvedTrial = (
  { bucket, finding, tsUnused }: { readonly bucket: TrialBucket; readonly finding: Finding; readonly tsUnused: boolean },
  note: string,
  compiles = 0,
): Trial => ({
  bucket,
  label: finding.label,
  verdict: "unresolved",
  references: [],
  removed: [],
  checked: [],
  errors: [],
  compiles,
  tsUnused,
  note,
  literal: [],
});

// Each file's splices from several deletes, overlapping ones joined: two neighbours in a comma list each take the comma
// between them.
function mergeEdits(all: readonly Edits[]): Edits {
  const byFile = new Map<string, Splice[]>();
  for (const [file, splices] of all.flatMap((edits) => [...edits])) {
    byFile.set(file, [...(byFile.get(file) ?? []), ...splices]);
  }
  return new Map(
    [...byFile].map(([file, splices]) => {
      const joined: Splice[] = [];
      for (const splice of splices.toSorted((a, b) => a.start - b.start)) {
        const last = joined.at(-1);
        if (last !== undefined && splice.start < last.end) {
          joined[joined.length - 1] = { start: last.start, end: Math.max(last.end, splice.end), text: "" };
        } else {
          joined.push(splice);
        }
      }
      return [file, joined];
    }),
  );
}

// An object literal's key a site names, with the literal, so the key's member is found through the literal's
// contextual type.
function literalKey(site: Node): { readonly literal: Expression; readonly name: string } | undefined {
  const { parent } = site;
  const holder = parent.parent;
  const name = keyText(site);
  const isKey = (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isMethodDeclaration(parent)) && sameSpan(parent.name, site);
  return isKey && name !== undefined && isObjectLiteralExpression(holder) ? { literal: holder, name } : undefined;
}

// A declaration a module can export: a statement of its file, or a variable of one.
const isTopLevel = (node: Node): boolean => isSourceFile(node.parent) || (isVariableDeclarationList(node.parent) && isSourceFile(node.parent.parent.parent));

/** The trial session over one built graph and its world. */
class Trials {
  readonly #graph: Graph;
  readonly #world: NativeWorld;
  readonly #root: string;
  readonly #imports: ImportGraph;
  readonly #base = new Map<string, readonly Diagnostic[]>();
  readonly #compiles = new Map<Candidate, number>();
  #snapshots = 0;
  readonly #phases: Phases;
  #seen: { readonly checked: number; readonly projects: readonly ProjectId[] }[] = [];
  #resolver: Resolver | null = null;

  constructor(graph: Graph, world: NativeWorld, root: string, phases: Phases) {
    this.#graph = graph;
    this.#world = world;
    this.#root = root;
    this.#phases = phases;
    this.#imports = ImportGraph.build(world.program, (requests) => world.batch(requests), world.files);
  }

  #absolute(file: string): string {
    return `${this.#root}/${file}`;
  }

  #relative(diagnostic: Diagnostic): string {
    return diagnostic.fileName === undefined ? "" : relative(this.#root, diagnostic.fileName);
  }

  /** How many throwaway snapshots the trial has made. */
  get snapshots(): number {
    return this.#snapshots;
  }

  /** Whether tsc reports each declaration name unused in the base program: a reportsUnnecessary suggestion or error
   *  that starts at it. One round reads both lists for every named file, and the semantic list seeds the base errors. */
  tsUnused(names: readonly (Node | undefined)[]): readonly boolean[] {
    const files = [...new Set(names.flatMap((name) => (name === undefined ? [] : [this.#world.fileOfSource(name.getSourceFile())])))].filter(
      (file) => !this.#base.has(file),
    );
    const { program } = this.#world;
    const absolute = files.map((file) => this.#absolute(file));
    const [suggestions = [], semantic = []] =
      files.length === 0 ? [] : this.#world.batch([program.getSuggestionDiagnostics.gen(absolute), program.getSemanticDiagnostics.gen(absolute)]);
    this.#seedBase(files, semantic);
    const unused = new Set(
      [...suggestions, ...files.flatMap((file) => this.#base.get(file) ?? [])]
        .filter(({ reportsUnnecessary }) => reportsUnnecessary === true)
        .map((diagnostic) => `${this.#relative(diagnostic)}:${String(diagnostic.pos)}`),
    );
    return names.map(
      (name) => name !== undefined && unused.has(`${this.#world.fileOfSource(name.getSourceFile())}:${String(name.getStart(name.getSourceFile()))}`),
    );
  }

  #seedBase(files: readonly string[], found: readonly Diagnostic[]): void {
    const byFile = new Map<string, Diagnostic[]>(files.map((file) => [file, []]));
    for (const diagnostic of found) {
      byFile.get(this.#relative(diagnostic))?.push(diagnostic);
    }
    for (const [file, diagnostics] of byFile) {
      this.#base.set(file, diagnostics);
    }
  }

  // The base program's errors on each file, read once per file in one request for every file not yet read.
  #baseErrors(files: readonly string[]): readonly Diagnostic[] {
    const missing = files.filter((file) => !this.#base.has(file));
    if (missing.length > 0) {
      this.#seedBase(missing, this.#world.program.getSemanticDiagnostics(missing.map((file) => this.#absolute(file))));
    }
    return files.flatMap((file) => this.#base.get(file) ?? []);
  }

  #line(file: string, pos: number, diagnostic: Diagnostic): number {
    const source = this.#world.source(file);
    return source === undefined ? (diagnostic.startPosition?.line ?? 0) + 1 : source.getLineAndCharacterOfPosition(pos).line + 1;
  }

  /** Trial a group of candidates: all deleted in one snapshot, the files any of them can break checked once, and each
   *  added error attributed to the candidate whose occurrence spans its site, else whose declaration its site resolves
   *  to in the base program.
   *  @remarks A group whose edit does not parse, or with an error no single candidate owns, splits in half and each
   *  half is tried alone. One deleted candidate can mask another's error (the checker reports one excess property per
   *  object literal), so a candidate left without an error while others have some is tried again without them; a
   *  candidate is confirmed only by a trial that added no error at all. */
  group(items: readonly Candidate[]): readonly Trial[] {
    if (items.length === 0) {
      return [];
    }
    const outcome = this.#check(items);
    if (items.length > 1 && (outcome.syntax !== null || outcome.owners.includes(UNOWNED))) {
      const half = Math.ceil(items.length / 2);
      return [...this.group(items.slice(0, half)), ...this.group(items.slice(half))];
    }
    const errorsOf = (at: number): readonly TrialError[] => outcome.added.filter((_, x) => outcome.owners[x] === at).map((error) => this.#error(error));
    const quiet = items.filter((_, at) => errorsOf(at).length === 0);
    const again = outcome.added.length > 0 && quiet.length > 0 ? new Map(this.group(quiet).map((trial, at) => [quiet[at], trial])) : null;
    return items.map((item, at) => {
      const removed = this.#removed(item.edits);
      const compiles = this.#compiles.get(item) ?? 0;
      if (outcome.syntax !== null) {
        return { ...unresolvedTrial(item, `the delete edit does not parse: ${outcome.syntax}`, compiles), removed };
      }
      const retried = again?.get(item);
      if (retried !== undefined) {
        return retried;
      }
      const errors = errorsOf(at);
      return {
        bucket: item.bucket,
        label: item.finding.label,
        verdict: verdictOf(errors),
        references: [],
        removed,
        checked: outcome.checked,
        errors,
        compiles,
        tsUnused: item.tsUnused,
        note: null,
        literal: [],
      };
    });
  }

  // One snapshot with every candidate of a group deleted: the first syntax error of an edited file, else the errors it
  // added and which candidate owns each.
  #check(items: readonly Candidate[]): {
    readonly syntax: string | null;
    readonly added: readonly AddedError[];
    readonly owners: readonly number[];
    readonly checked: readonly string[];
  } {
    const edits = mergeEdits(items.map((item) => item.edits));
    const edited = [...edits.keys()];
    const checked = this.#checkedFor(edited);
    const base = this.#baseErrors(checked);
    const texts = Object.fromEntries(edited.map((file) => [this.#absolute(file), spliced(this.#world.source(file)?.text ?? "", edits.get(file) ?? [])]));
    this.#snapshots += 1;
    for (const item of items) {
      this.#compiles.set(item, (this.#compiles.get(item) ?? 0) + 1);
    }
    // Both lists in one round: an edit that does not parse discards the semantic list.
    const {
      answers: [syntax = [], semantic = []],
      projects,
    } = this.#world.trial(
      texts,
      (program) => [
        program.getSyntacticDiagnostics.gen(edited.map((file) => this.#absolute(file))),
        program.getSemanticDiagnostics.gen(checked.map((file) => this.#absolute(file))),
      ],
      (step, work) => this.#phases.time(step, work),
    );
    this.#seen.push({ checked: checked.length, projects });
    const [first] = syntax;
    const added = addedErrors(base, semantic, new Map([...edits].map(([file, splices]) => [this.#absolute(file), splices]))).filter(
      ({ diagnostic }) => diagnostic.reportsUnnecessary !== true,
    );
    return {
      syntax: first === undefined ? null : firstLine(first.text),
      added,
      owners: items.length === 1 ? added.map(() => 0) : this.#phases.time("attribution", () => this.#owners(items, added)),
      checked,
    };
  }

  // The files a snapshot that edits these files checks: the edited ones and each file an edit of them can break.
  #checkedFor(edited: readonly string[]): readonly string[] {
    const readers = edited.flatMap((file) => this.#imports.readers(this.#absolute(file), false).map((at) => relative(this.#root, at)));
    return [...new Set([...edited, ...readers])].filter((file) => this.#world.has(file)).sort();
  }

  // Each snapshot since the last call: its checked-file count and, past the one merged project, every project it built.
  #takeSeen(): string {
    const seen = this.#seen;
    this.#seen = [];
    const extra = seen.flatMap(({ projects }) => (projects.length > 1 ? projects : []));
    return `checked ${seen.map(({ checked }) => String(checked)).join(",")} projects ${seen.map(({ projects }) => String(projects.length)).join(",")}${extra.length === 0 ? "" : ` (${[...new Set(extra)].join(" ")})`}`;
  }

  #removed(edits: Edits): readonly Removal[] {
    return [...edits].flatMap(([file, splices]) => splices.map(({ start, end }) => ({ file, text: this.#world.source(file)?.text.slice(start, end) ?? "" })));
  }

  // Which candidate each added error belongs to: the one whose find-references occurrence holds the error's start,
  // else the one whose declaration the site resolves to in the base program.
  #owners(items: readonly Candidate[], added: readonly AddedError[]): readonly number[] {
    const byReference = added.map(({ diagnostic, pos }) => {
      const file = this.#relative(diagnostic);
      const matches = items.flatMap((item, x) =>
        item.occurrences.some((node) => this.#world.fileOfSource(node.getSourceFile()) === file && node.getStart(node.getSourceFile()) <= pos && pos < node.end)
          ? [x]
          : [],
      );
      return matches.length === 1 ? (matches[0] ?? UNOWNED) : UNOWNED;
    });
    const rest = added.filter((_, at) => byReference[at] === UNOWNED);
    const bySymbol = rest.length === 0 ? [] : this.#symbolOwners(items, rest);
    let next = 0;
    return byReference.map((owner) => (owner === UNOWNED ? (bySymbol[next++] ?? UNOWNED) : owner));
  }

  // The owner by the base symbol at each error's site, through an import alias or, for an object literal's key, through
  // the literal's contextual type.
  #symbolOwners(items: readonly Candidate[], added: readonly AddedError[]): readonly number[] {
    const world = this.#world;
    const { checker } = world;
    const sites = added.map(({ diagnostic, pos }) => {
      const source = world.source(this.#relative(diagnostic));
      return source === undefined ? undefined : touching(source, pos);
    });
    const named = world.symbolsAt(sites.flatMap((site) => (site === undefined ? [] : [site])));
    const literal = sites.map((site) => (site === undefined ? undefined : literalKey(site)));
    const keyed = world.batch(
      literal.map(function* (key) {
        if (key === undefined) {
          return [];
        }
        const type = yield* checker.getContextualType.gen(key.literal);
        return type === undefined ? [] : yield* propertiesNamed(checker, type, key.name);
      }),
    );
    this.#resolver ??= new Resolver(world);
    const namedKeys = this.#resolver.declarations(named);
    const keyedKeys = this.#resolver.declarations(keyed.flat());
    let n = 0;
    let k = 0;
    return sites.map((site, at) => {
      const own = new Set<DeclKey>(site === undefined ? [] : (namedKeys[n++] ?? []));
      for (const _ of keyed[at] ?? []) {
        for (const key of keyedKeys[k++] ?? []) {
          own.add(key);
        }
      }
      const matches = items.flatMap((item, x) => (own.has(item.key) ? [x] : []));
      return matches.length === 1 ? (matches[0] ?? UNOWNED) : UNOWNED;
    });
  }

  /** The candidate's own span and each export site that names it. */
  edits(key: DeclKey, node: Node, exportSites: readonly Node[]): Edits {
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
    const base = { code: diagnostic.code, product: productReader(file), text: firstLine(diagnostic.text) };
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
    const product = this.#graph.files.filter((file) => productReader(file) && this.#world.has(file)).map((file) => this.#absolute(file));
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

  /** A finding's trial when a missing declaration or a product read find-references names decides it, else the
   *  candidate its declaring file's group deletes. */
  decide(
    { bucket, finding }: { readonly bucket: TrialBucket; readonly finding: Finding },
    { occurrences, reads }: Pick<FindingReferences, "occurrences" | "reads">,
    tsUnused: boolean,
  ): { readonly trial: Trial } | { readonly candidate: Candidate } {
    const { key } = finding;
    const node = key !== null && isDeclKey(key) ? this.nodeOf(key) : undefined;
    if (key === null || !isDeclKey(key) || node === undefined) {
      return { trial: unresolvedTrial({ bucket, finding, tsUnused }, "no declaration at the finding's span") };
    }
    // An import or export that names the candidate binds it; the delete removes or rewrites that site, so only a use reads.
    const used = reads.filter((read) => moduleSite(read) === undefined);
    if (used.length > 0) {
      return {
        trial: {
          ...unresolvedTrial({ bucket, finding, tsUnused }, ""),
          verdict: "refuted-references",
          references: used.map((read) => siteOf(this.#world, read)),
          note: null,
        },
      };
    }
    const edits = this.edits(key, node, isTopLevel(node) ? exportSitesOf(occurrences) : []);
    return { candidate: { bucket, finding, key, edits, occurrences, tsUnused } };
  }

  /** The per-file groups packed into shared snapshots, first fit in order, each holding at most GROUP_CANDIDATES. Two
   *  file groups share a snapshot only when neither edits a file the other checks: a delete that removes or rewrites
   *  text where another candidate's reader sits would hide that reader, so a shared snapshot decides each candidate
   *  exactly as its own file's snapshot would. */
  pack(groups: readonly (readonly Candidate[])[]): readonly (readonly Candidate[])[] {
    const packs: { items: Candidate[]; edited: Set<string>; checked: Set<string> }[] = [];
    for (const items of groups) {
      const edited = [...mergeEdits(items.map((item) => item.edits)).keys()];
      const checked = this.#checkedFor(edited);
      const fits = packs.find(
        (pack) =>
          pack.items.length + items.length <= GROUP_CANDIDATES &&
          !edited.some((file) => pack.checked.has(file)) &&
          !checked.some((file) => pack.edited.has(file)),
      );
      if (fits === undefined) {
        packs.push({ items: [...items], edited: new Set(edited), checked: new Set(checked) });
      } else {
        fits.items.push(...items);
        for (const file of edited) {
          fits.edited.add(file);
        }
        for (const file of checked) {
          fits.checked.add(file);
        }
      }
    }
    return packs.map(({ items }) => items);
  }

  /** Trial every group, logging progress before and after each, and keeping each trial in the ledger as its group lands. */
  tryGroups(
    groups: readonly (readonly Candidate[])[],
    run: { readonly total: number; readonly ledger: TrialLedger | undefined },
    log: (line: string) => void,
  ): ReadonlyMap<Finding, Trial> {
    const tried = new Map<Finding, Trial>();
    const started = performance.now();
    let done = 0;
    for (const [at, items] of groups.entries()) {
      log(`trial group ${String(at + 1)}/${String(groups.length)} starting: ${String(items.length)} candidates, first ${items[0]?.finding.label ?? ""}`);
      const outcome = this.group(items);
      for (const [x, item] of items.entries()) {
        const trial = outcome[x];
        if (trial !== undefined) {
          tried.set(item.finding, trial);
          run.ledger?.record(item.bucket, item.key, trial);
        }
      }
      done += items.length;
      const minutes = (performance.now() - started) / MS_PER_MINUTE;
      log(
        `trial groups ${String(at + 1)}/${String(groups.length)} candidates ${String(done)}/${String(run.total)} snapshots ${String(this.#snapshots)} ${this.#takeSeen()} ${(done / Math.max(minutes, MIN_MINUTES)).toFixed(1)}/min`,
      );
    }
    return tried;
  }

  /** The declaration a key names, in the world's parse. */
  nodeOf(key: DeclKey): Node | undefined {
    const parts = declKeyParts(key);
    const source = this.#world.source(parts.file);
    return source === undefined ? undefined : nodeAt(source, parts);
  }
}

function verdictOf(errors: readonly TrialError[]): TrialVerdict {
  if (errors.length === 0) {
    return "confirmed";
  }
  const reads = errors.filter(({ kind }) => kind === "read");
  if (reads.length === 0) {
    return "named-only";
  }
  return reads.some(({ product }) => product) ? "refuted" : "refuted-test-only";
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

// A compile clean only says the compiler needs no site of the name: a string key, a JSON or fixture key or a plugin
// reading the member by name can still be one. Each confirmed candidate's name is searched over the tracked tree, its
// own sites (the occurrences find-references gave) left out as the fields literal stage leaves them out, and a hit
// that can be a read makes it confirmed-literal.
function literalPass(
  root: string,
  world: NativeWorld,
  compiled: readonly { readonly trial: Trial; readonly references: FindingReferences | undefined }[],
): { readonly trials: readonly Trial[]; readonly files: number | null } {
  const clean = compiled.flatMap(({ trial, references }) =>
    trial.verdict === "confirmed" && references?.name !== undefined ? [{ trial, name: references.name, occurrences: references.occurrences }] : [],
  );
  const words = world.batch(clean.map(({ name }) => searchedWord(world, name)));
  const named = clean.flatMap((entry, at) => {
    const word = words[at];
    return word === undefined || word === null ? [] : [{ ...entry, word }];
  });
  const asked = named.filter(({ word }) => isLiteralName(word));
  const unsearchable = new Map(named.filter(({ word }) => !isLiteralName(word)).map(({ trial, word }) => [trial, word]));
  const search =
    asked.length === 0
      ? null
      : searchLiterals(
          root,
          world,
          asked.map(({ word }) => word),
        );
  const found =
    search === null
      ? []
      : rowsEvidence(
          search,
          world,
          asked.map(({ word, name, occurrences }) => ({
            member: word,
            known: [name, ...occurrences].map((node) => ownSiteKey(node.getSourceFile(), world.fileOfSource(node.getSourceFile()), node.pos)),
            neverWritten: false,
          })),
        );
  const evidence = new Map(asked.flatMap(({ trial }, at) => (found[at] === undefined ? [] : [[trial, found[at]] as const])));
  const trials = compiled.map(({ trial }) => {
    const word = unsearchable.get(trial);
    if (word !== undefined) {
      return { ...trial, note: `${JSON.stringify(word)} is not one word, so no literal search could look for a read by name` };
    }
    const literal = evidence.get(trial);
    if (literal === undefined || !literal.saved) {
      return trial;
    }
    // A saving hit outside the product annotates: the row keeps the compile's confirmed and lists the hits.
    return { ...trial, verdict: literal.productRead ? ("confirmed-literal" as const) : trial.verdict, literal: literal.hits };
  });
  return { trials, files: search?.files ?? (asked.length === 0 ? 0 : null) };
}

// Each phase's wall time and the compiler requests sent inside it; phases nest only where none is timed twice.
class Phases {
  readonly #world: NativeWorld;
  readonly #costs = new Map<TrialPhase, PhaseCost>();

  constructor(world: NativeWorld) {
    this.#world = world;
  }

  time<R>(phase: TrialPhase, work: () => R): R {
    const before = this.#world.timing();
    const began = performance.now();
    try {
      return work();
    } finally {
      const after = this.#world.timing();
      const so = this.#costs.get(phase) ?? NO_COST;
      this.#costs.set(phase, {
        ms: so.ms + performance.now() - began,
        requests: so.requests + after.requestCount - before.requestCount,
        serverMs: so.serverMs + after.serverTimeMs - before.serverTimeMs,
        roundTripMs: so.roundTripMs + after.roundTripMs - before.roundTripMs,
      });
    }
  }

  report(): Readonly<Record<TrialPhase, PhaseCost>> {
    const cost = (phase: TrialPhase): PhaseCost => this.#costs.get(phase) ?? NO_COST;
    return {
      references: cost("references"),
      unused: cost("unused"),
      snapshot: cost("snapshot"),
      diagnostics: cost("diagnostics"),
      attribution: cost("attribution"),
      literal: cost("literal"),
    } satisfies Record<TrialPhase, PhaseCost>;
  }
}

const NO_COST: PhaseCost = { ms: 0, requests: 0, serverMs: 0, roundTripMs: 0 };

// The export specifiers and default exports among a declaration's find-references occurrences.
const exportSitesOf = (occurrences: readonly Node[]): readonly Node[] =>
  occurrences.flatMap(({ parent }) => (isExportSpecifier(parent) || isExportAssignment(parent) ? [parent] : []));

// A `file:line` for a node of the world's parse.
const siteOf = (world: NativeWorld, node: Node): string =>
  `${world.fileOfSource(node.getSourceFile())}:${String(node.getSourceFile().getLineAndCharacterOfPosition(node.getStart(node.getSourceFile())).line + 1)}`;

/** Run the delete trial over every finding of the named buckets, or an even sample of `limit` of them, then the
 *  unused-diagnostics control; `verdicts` keeps only the member findings the judge sorted to one of them (the sort needs a
 *  graph built with member sites); `ledger` keeps each trial as its group lands and supplies the ones an earlier run
 *  kept. */
export function runTrials(
  graph: Graph,
  world: NativeWorld,
  run: {
    readonly root: string;
    readonly analysis: Analysis;
    readonly buckets: readonly TrialBucket[];
    readonly limit: number | null;
    /** Only the member findings the judge sorted to one of these; every finding when empty. */
    readonly verdicts?: readonly Verdict[];
    /** Keeps each trial as its group lands, and supplies the ones an earlier run of the same tree kept, which are not tried again. */
    readonly ledger?: TrialLedger;
  },
  log: (line: string) => void,
): TrialReport {
  const phases = new Phases(world);
  const trials = new Trials(graph, world, run.root, phases);
  const verdicts = run.verdicts ?? [];
  const sorted = verdicts.length === 0 ? null : verdictsByDecl(graph, judgeMembers({ root: run.root, graph, analysis: run.analysis, world }, NO_RULINGS));
  const wanted = ({ key }: Finding): boolean => {
    const verdict = key !== null && isDeclKey(key) ? sorted?.get(key) : undefined;
    return sorted === null || (verdict !== undefined && verdicts.includes(verdict));
  };
  const all = [...new Set(run.buckets)].flatMap((bucket) => run.analysis[bucket].filter(wanted).map((finding) => ({ bucket, finding })));
  const picked = evenSample(all, run.limit);
  const found = phases.time("references", () =>
    referencesOf(
      world,
      picked.map(({ finding }) => finding),
    ),
  );
  const tsUnused = phases.time("unused", () => trials.tsUnused(found.map(({ name }) => name)));
  const decided = new Map<Finding, Trial>();
  const groups = new Map<string, Candidate[]>();
  let resumed = 0;
  for (const [at, pick] of picked.entries()) {
    const outcome = trials.decide(pick, found[at] ?? { occurrences: [], reads: [] }, tsUnused[at] ?? false);
    if ("trial" in outcome) {
      decided.set(pick.finding, outcome.trial);
    } else {
      const kept = run.ledger?.recorded(pick.bucket, outcome.candidate.key);
      if (kept === undefined) {
        const { file } = declKeyParts(outcome.candidate.key);
        groups.set(file, [...(groups.get(file) ?? []), outcome.candidate]);
      } else {
        decided.set(pick.finding, kept);
        resumed += 1;
      }
    }
  }
  if (resumed > 0) {
    log(`resumed ${String(resumed)} trials an earlier run of this tree kept`);
  }
  const tried = trials.tryGroups(trials.pack([...groups.values()]), { total: picked.length, ledger: run.ledger }, log);
  const compiled = picked.flatMap(({ finding }, at) => {
    const trial = decided.get(finding) ?? tried.get(finding);
    return trial === undefined ? [] : [{ trial, references: found[at] }];
  });
  const literal = phases.time("literal", () => literalPass(run.root, world, compiled));
  return { literalFiles: literal.files, trials: literal.trials, control: trials.control(run.analysis), phases: phases.report() };
}
