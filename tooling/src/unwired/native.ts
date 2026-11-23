// Engine one: the TypeScript 7.1 API (`@typescript/native/sync`), one API process per world so a world's checker is
// freed before the next loads. Every query goes through a batch: one IPC round trip per query is ~500x slower.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Expression, Identifier, Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from "@typescript/native/ast";
import {
  getTouchingPropertyName,
  isArrowFunction,
  isClassDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
} from "@typescript/native/ast";
import type {
  APIRequestGenerator,
  Checker,
  ConfiguredProjectId,
  LanguageService,
  Symbol as NativeSymbol,
  NodeHandle,
  Program,
  ProjectId,
  ReferencedSymbolEntry,
  RetainedSourceFile,
  SignatureUsage,
  Snapshot,
  TimingAccumulators,
  Type,
} from "@typescript/native/sync";
import { API, all, SymbolFlags } from "@typescript/native/sync";
import { z } from "zod";
import { isLibrarySource } from "../brand-names/index.ts";
import { workspacePackageRoots } from "../package-effects/index.ts";
import type { Site } from "./classify.ts";
import { bridgedConfigText, MERGED_CONFIG, mergedConfigText } from "./worlds.ts";

// Far under the server's batch page and V8's spread-argument ceiling.
const BATCH = 5000;

// A list in pieces of at most BATCH, for the wire's array-form requests.
const chunked = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, at) => items.slice(at * BATCH, (at + 1) * BATCH));

/** The two steps of a throwaway trial: making its snapshot and asking its program. */
export const TRIAL_STEPS = ["snapshot", "diagnostics"] as const;
export type TrialStep = (typeof TRIAL_STEPS)[number];

/** The name {@link NativeWorld.libraryOf} gives the compiler's own default library files, which belong to no manifest. */
export const DEFAULT_LIBRARY = "(default library)";

/** Whether a compiler-owned bitfield carries `flag`. */
export function hasFlag(flags: number, flag: number): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript symbol and type flags are compiler-owned bitfields.
  return (flags & flag) !== 0;
}

/** A find-references site. `relative`: it names a base or sibling member find-references groups with the asked member
 *  by their shared base, so it reads or writes the asked member's value only through a flow between the two types. */
export interface FoundReference extends Site {
  readonly relative: boolean;
}

// A property, accessor or method: the symbols find-references groups by a shared base member.
const isMember = (symbol: NativeSymbol): boolean => hasFlag(symbol.flags, SymbolFlags.PropertyOrAccessor) || hasFlag(symbol.flags, SymbolFlags.Method);

/** A world's source files, and the root files its config names rather than reaches through imports. */
export interface WorldFiles {
  readonly held: ReadonlySet<string>;
  readonly roots: ReadonlySet<string>;
}

const DECLARATION_FILE = ".d.ts";
const PACKAGE_MANIFEST = "package.json";
const PackageManifest = z.looseObject({ name: z.string().optional() });
const workspaceDirs = (root: string): ReadonlySet<string> => new Set(workspacePackageRoots(root));

// A file the program loaded from a package that is not the workspace's own, under isLibrarySource.
const fromLibrary = (meta: { readonly isFromExternalLibrary: boolean; readonly packageJsonDirectory: string }, workspace: ReadonlySet<string>): boolean =>
  isLibrarySource({ external: meta.isFromExternalLibrary, workspacePackage: workspace.has(meta.packageJsonDirectory) });

// Which program files are the tree's own, by the program's answer rather than the path's text: a dependency resolved
// through a pnpm symlink outside any node_modules directory is still a library, and a workspace package reached through
// node_modules is still ours (the program flags it external, as it was resolved from node_modules, so the workspace's
// own package directories answer for it). A declaration file is ours only where `declaration` keeps it.
function ownSources(api: API, program: Program, own: { readonly workspace: ReadonlySet<string>; readonly keep: (name: string) => boolean }): readonly string[] {
  const { workspace, keep } = own;
  const names = program.getSourceFileNames();
  const kept: string[] = [];
  for (const start of pageStarts(names.length)) {
    const page = names.slice(start, start + BATCH);
    const metadata = api.batch(...page.map((name) => program.getSourceFileMetadata.gen(name)));
    for (const [at, name] of page.entries()) {
      const meta = metadata[at];
      const library = meta === undefined || meta.isDefaultLibrary || fromLibrary(meta, workspace);
      if (!library && (!name.endsWith(DECLARATION_FILE) || keep(name))) {
        kept.push(name);
      }
    }
  }
  return kept;
}

type Request = APIRequestGenerator extends Generator<infer Yielded, unknown, unknown> ? Yielded : never;

interface Pending {
  readonly generator: APIRequestGenerator;
  readonly finish: (value: unknown) => void;
  readonly key: string;
  readonly request: Request;
}

// One world asks one snapshot of one project, so the two params every request carries say nothing about which answer it
// wants; leaving them out of the key keeps a whole-program walk's cache a fraction of the size. Only the params' own
// fields are left out: a nested field of either name is part of what the request asks.
const SESSION_FIELDS: ReadonlySet<string> = new Set(["snapshot", "project"]);

function requestKey(request: Request): string {
  if (!("params" in request) || typeof request.params !== "object" || request.params === null) {
    return JSON.stringify(request);
  }
  const params = Object.fromEntries(Object.entries(request.params).filter(([field]) => !SESSION_FIELDS.has(field)));
  return JSON.stringify({ ...request, params });
}

const isAll = (request: Request): request is Extract<Request, { readonly method: "__all" }> => "method" in request && request.method === "__all";

function* ask(request: Request): APIRequestGenerator<unknown> {
  const answer: unknown = yield request;
  return answer;
}

const pageStarts = (size: number): readonly number[] => Array.from({ length: Math.ceil(size / BATCH) }, (_, page) => page * BATCH);

// The `extends` and `implements` types of every declaration of an interface or class symbol.
function* heritageOf(owner: NativeSymbol | undefined): APIRequestGenerator<readonly Node[]> {
  const types: Node[] = [];
  for (const handle of owner?.declarations ?? []) {
    const declaration = yield* handle.resolve.gen();
    if (declaration !== undefined && (isInterfaceDeclaration(declaration) || isClassDeclaration(declaration))) {
      types.push(...(declaration.heritageClauses ?? []).flatMap((clause) => [...clause.types]));
    }
  }
  return types;
}

/** What a world's batches cost: rounds to the compiler, distinct requests sent, asks the answer memo served, and the
 *  wall time spent inside {@link NativeWorld.batch}. */
export interface WorldStats {
  readonly batches: number;
  readonly rounds: number;
  readonly sent: number;
  readonly memoHits: number;
  readonly ms: number;
}

/** One world's program in its own TypeScript 7.1 process. */
export class NativeWorld implements Disposable {
  readonly config: string;
  readonly checker: Checker;
  /** The program, for what the checker does not answer: diagnostics, the files it loads, module resolution. */
  readonly program: Program;
  readonly #languageService: LanguageService;
  /** Every source file of the program outside node_modules, declaration files excluded. */
  readonly files: readonly SourceFile[];
  readonly #api: API;
  readonly #root: string;
  readonly #fileOfPath: ReadonlyMap<string, string>;
  readonly #sourceOf: ReadonlyMap<string, SourceFile>;
  readonly #answers = new Map<string>();
  readonly #workspace: ReadonlySet<string>;
  readonly #packageNames = new Map<string, string | null>();
  readonly #stats = { batches: 0, rounds: 0, sent: 0, memoHits: 0, ms: 0 };
  // True while a batch settles: a generator that re-enters the world would read the outer round's answers around itself.
  #settling = false;
  readonly #snapshot: Snapshot;
  readonly #project: ConfiguredProjectId;

  private constructor(root: string, { config, text }: { readonly config: string; readonly text: string }, api: API, declaration: (file: string) => boolean) {
    this.config = config;
    this.#root = root;
    this.#api = api;
    const path = `${root}/${config}`;
    const snapshot = api.createSnapshot({ openProjects: [path], fileSystem: { kind: "layer", files: { [path]: text } } });
    const project = snapshot.getConfiguredProject(path);
    this.#snapshot = snapshot;
    if (project === undefined) {
      throw new Error(`${config}: the TypeScript 7.1 API loaded no project`);
    }
    this.#project = project.id;
    this.checker = project.checker;
    this.program = project.program;
    this.#languageService = project.languageService;
    this.#workspace = workspaceDirs(root);
    const names = ownSources(api, project.program, { workspace: this.#workspace, keep: (name) => declaration(relative(root, name)) });
    this.files = this.batch(names.map((name) => project.program.getSourceFile.gen(name))).flatMap((file) => (file === undefined ? [] : [file]));
    this.#fileOfPath = new Map(this.files.map((file) => [file.path, relative(root, file.fileName)]));
    this.#sourceOf = new Map(this.files.map((file) => [relative(root, file.fileName), file]));
  }

  // The world config is overlaid with the source bridge, the same programs engine two loads.
  static open(root: string, config: string, declarations: ReadonlySet<string> = new Set()): NativeWorld {
    return new NativeWorld(root, { config, text: bridgedConfigText(root, config) }, new API({ cwd: root }), (file) => declarations.has(file));
  }

  /** The merged program over every world (`mergedConfigText`), with the declaration files `declaration` keeps. */
  static openMerged(root: string, declaration: (file: string) => boolean, timing = false): NativeWorld {
    return new NativeWorld(root, { config: MERGED_CONFIG, text: mergedConfigText(root) }, new API({ cwd: root, collectTiming: timing }), declaration);
  }

  get stats(): WorldStats {
    return { ...this.#stats };
  }

  /** The compiler's own request totals; zero unless the world was opened with timing. */
  timing(): TimingAccumulators {
    return this.#api.getTimingInfo().totals;
  }

  /** The compiler's CPU and heap profilers. */
  get debug(): API["debug"] {
    return this.#api.debug;
  }

  /** The repository-relative source files and root files of every world, listed in one session rather than one
   *  process per world. */
  static fileLists(root: string, configs: readonly string[], declarations: ReadonlySet<string> = new Set()): ReadonlyMap<string, WorldFiles> {
    using api = new API({ cwd: root });
    const files = Object.fromEntries(configs.map((config) => [`${root}/${config}`, bridgedConfigText(root, config)]));
    const snapshot = api.createSnapshot({ openProjects: Object.keys(files), fileSystem: { kind: "layer", files } });
    const keep = (name: string): boolean => declarations.has(relative(root, name));
    const workspace = workspaceDirs(root);
    return new Map(
      configs.map((config) => {
        const project = snapshot.getConfiguredProject(`${root}/${config}`);
        const held = new Set(project === undefined ? [] : ownSources(api, project.program, { workspace, keep }).map((name) => relative(root, name)));
        const roots = new Set((project?.parsedCommandLine.fileNames ?? []).map((name) => relative(root, name)).filter((name) => held.has(name)));
        return [config, { held, roots }];
      }),
    );
  }

  /** Run request generators in pages of {@link BATCH}, keeping their order.
   *  @throws When a request generator runs a batch of its own: the outer round's answers would be read around it. */
  batch<T>(requests: readonly APIRequestGenerator<T>[]): T[] {
    if (this.#settling) {
      throw new Error("NativeWorld.batch ran inside a request generator: ask through yield, or settle the data before the batch");
    }
    const began = performance.now();
    const results: T[] = [];
    for (let start = 0; start < requests.length; start += BATCH) {
      results.push(...this.#settle(requests.slice(start, start + BATCH)));
    }
    this.#stats.batches += 1;
    this.#stats.ms += performance.now() - began;
    return results;
  }

  // Every query is pure in one snapshot, so each distinct request crosses to the compiler once until releaseAnswers:
  // later asks and same-round repeats share its answer. `API.batch` itself only deduplicates `initialize`.
  #settle<T>(generators: readonly APIRequestGenerator<T>[]): T[] {
    this.#settling = true;
    try {
      return this.#rounds(generators);
    } finally {
      this.#settling = false;
    }
  }

  #rounds<T>(generators: readonly APIRequestGenerator<T>[]): T[] {
    const results: T[] = [];
    let waiting: Pending[] = [];
    const run = (generator: APIRequestGenerator, finish: (value: unknown) => void, first: unknown): void => {
      let step = generator.next(first);
      while (step.done !== true) {
        const request = step.value;
        if (isAll(request)) {
          joined(request.generators as readonly APIRequestGenerator[], (answers) => run(generator, finish, answers));
          return;
        }
        const key = requestKey(request);
        if (!this.#answers.has(key)) {
          waiting.push({ generator, finish, key, request });
          return;
        }
        this.#stats.memoHits += 1;
        step = generator.next(this.#answers.get(key));
      }
      finish(step.value);
    };
    const joined = (children: readonly APIRequestGenerator[], finish: (answers: readonly unknown[]) => void): void => {
      const answers: unknown[] = [];
      let left = children.length;
      const landing =
        (at: number) =>
        (value: unknown): void => {
          answers[at] = value;
          left -= 1;
          if (left === 0) {
            finish(answers);
          }
        };
      if (left === 0) {
        finish(answers);
      }
      for (const [at, child] of children.entries()) {
        run(child, landing(at), undefined);
      }
    };
    joined(generators, (answers) => results.push(...(answers as T[])));
    while (waiting.length > 0) {
      const round = waiting;
      waiting = [];
      const distinct = [...new Map(round.map(({ key, request }) => [key, request]))];
      this.#stats.rounds += 1;
      this.#stats.sent += distinct.length;
      this.#stats.memoHits += round.length - distinct.length;
      for (const start of pageStarts(distinct.length)) {
        const page = distinct.slice(start, start + BATCH);
        const answers = this.#api.batch(...page.map(([, request]) => ask(request)));
        for (const [at, [key]] of page.entries()) {
          this.#answers.set(key, answers[at]);
        }
      }
      for (const { generator, finish, key } of round) {
        run(generator, finish, this.#answers.get(key));
      }
    }
    return results;
  }

  /** Drop every remembered answer. A whole-program walk calls this as it moves on from a file: each answer holds the
   *  compiler's decoded response, and a walk's answers kept for the world's life outgrow the walk's own facts many times
   *  over. The facts a later file needs again live in the callers' id-keyed tables; a repeat ask crosses again. */
  releaseAnswers(): void {
    if (this.#settling) {
      throw new Error("NativeWorld.releaseAnswers ran inside a request generator: the round in flight reads its answers back");
    }
    this.#answers.clear();
  }

  /** The symbol at each node, an import alias followed to the symbol it names. Each chunk of nodes is one wire request
   *  (`getSymbolsAtLocations`), not one request per node. */
  symbolsAt(nodes: readonly Node[]): (NativeSymbol | undefined)[] {
    const found = this.batch(chunked(nodes).map((chunk) => this.checker.getSymbolAtLocation.gen(chunk))).flat();
    return this.#unalias(found);
  }

  /** The value symbol each shorthand property assignment's name reads. */
  shorthandValues(nodes: readonly Node[]): (NativeSymbol | undefined)[] {
    return this.#unalias(this.batch(nodes.map((node) => this.checker.getShorthandAssignmentValueSymbol.gen(node))));
  }

  #unalias(found: readonly (NativeSymbol | undefined)[]): (NativeSymbol | undefined)[] {
    const { checker } = this;
    return this.batch(
      found.map(function* (symbol) {
        if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
          return symbol;
        }
        const target = yield* checker.getAliasedSymbol.gen(symbol);
        return (yield* checker.isUnknownSymbol.gen(target)) ? undefined : target;
      }),
    );
  }

  /** The contextual type of each expression. */
  contextualTypes(nodes: readonly Expression[]): (Type | undefined)[] {
    return this.batch(nodes.map((node) => this.checker.getContextualType.gen(node)));
  }

  /** The type at each node, each chunk of nodes in one wire request (`getTypeAtLocations`). */
  typesAt(nodes: readonly Node[]): Type[] {
    return this.batch(chunked(nodes).map((chunk) => this.checker.getTypeAtLocation.gen(chunk))).flat();
  }

  /** Each item with the type at the node it names, in one batch. */
  typedAt<T>(items: readonly T[], nodeOf: (item: T) => Node): { readonly item: T; readonly type: Type }[] {
    const { checker } = this;
    return this.batch(
      items.map(function* (item): APIRequestGenerator<{ readonly item: T; readonly type: Type }> {
        return { item, type: yield* checker.getTypeAtLocation.gen(nodeOf(item)) };
      }),
    );
  }

  /** The package a declaration's file was loaded from as an external library, by its manifest's name; null for a file
   *  of the tree's own. The program decides, so a symlinked dependency and a workspace package are each judged right. */
  *packageOf(handle: NodeHandle): APIRequestGenerator<string | null> {
    const meta = yield* this.program.getSourceFileMetadataByPath.gen(handle.path);
    return meta !== undefined && fromLibrary(meta, this.#workspace) ? this.#packageName(meta.packageJsonDirectory) : null;
  }

  /** Whether a declaration's file is one the compiler supplies, `lib.dom.d.ts` and the rest of the standard library. */
  *isDefaultLibrary(handle: NodeHandle): APIRequestGenerator<boolean> {
    const meta = yield* this.program.getSourceFileMetadataByPath.gen(handle.path);
    return meta?.isDefaultLibrary === true;
  }

  /** The package a program file is a library of, by the rule ownSources keeps the tree's own files by: a default library
   *  (named {@link DEFAULT_LIBRARY}) or an external package outside the workspace. Null for a file of the tree's own. */
  *libraryOf(fileName: string): APIRequestGenerator<string | null> {
    const meta = yield* this.program.getSourceFileMetadata.gen(fileName);
    if (meta?.isDefaultLibrary === true) {
      return DEFAULT_LIBRARY;
    }
    return meta?.isFromExternalLibrary === true && !this.#workspace.has(meta.packageJsonDirectory)
      ? (this.#packageName(meta.packageJsonDirectory) ?? meta.packageJsonDirectory)
      : null;
  }

  /** For each list of declarations, whether one of them was loaded from the package `name`. */
  fromPackage(declarations: readonly (readonly NodeHandle[])[], name: string): boolean[] {
    return this.batch(declarations.map((handles) => this.#anyFrom(handles, name)));
  }

  *#anyFrom(handles: readonly NodeHandle[], name: string): APIRequestGenerator<boolean> {
    const packages = yield* all(...handles.map((handle) => this.packageOf(handle)));
    return packages.includes(name);
  }

  // A package's name sits on its root manifest; a nested scope manifest (zod's `v4/classic/package.json`, which only
  // sets the module type) names nothing, so the walk goes up to the first manifest that does.
  #packageName(directory: string): string | null {
    const known = this.#packageNames.get(directory);
    if (known !== undefined) {
      return known;
    }
    const manifest = join(directory, PACKAGE_MANIFEST);
    const own = existsSync(manifest) ? PackageManifest.parse(JSON.parse(readFileSync(manifest, "utf8"))).name : undefined;
    const parent = dirname(directory);
    const name = own ?? (parent === directory ? null : this.#packageName(parent));
    this.#packageNames.set(directory, name);
    return name;
  }

  /** The repository-relative file a declaration lives in, or null for one outside the world's sources. */
  fileOf(handle: NodeHandle): string | null {
    return this.#fileOfPath.get(handle.path) ?? null;
  }

  /** The repository-relative file of one of the world's parsed files. */
  fileOfSource(source: SourceFile): string {
    return this.#fileOfPath.get(source.path) ?? relative(this.#root, source.fileName);
  }

  /** A parse of each repository-relative file on its own, outside the program, in one batch. Each lease is the
   *  caller's to dispose. */
  parseAlone(files: readonly string[]): RetainedSourceFile[] {
    return this.#api.batch(...files.map((file) => this.#api.createSourceFileFromFile.gen(resolve(this.#root, file))));
  }

  /** Whether the world holds the repository-relative file. */
  has(file: string): boolean {
    return this.#sourceOf.has(file);
  }

  /** The world's parse of a repository-relative file, if it holds it. */
  source(file: string): SourceFile | undefined {
    return this.#sourceOf.get(file);
  }

  /** The sites TypeScript 7.1 find-references reports for the name at each site, the site itself included. A
   *  reference in a file outside the world's sources (a library or `node_modules`) is not resolved. */
  referencesAt(sites: readonly Site[]): FoundReference[][] {
    return this.batch(sites.map((site) => this.#referencesOf(site)));
  }

  /** Find-references at a node, one group per symbol it may mean. */
  *referencedSymbolsOf(node: Node): APIRequestGenerator<ReferencedSymbolEntry[]> {
    const source = node.getSourceFile();
    const position = node.getStart(source) + 1;
    return yield* this.#languageService.getReferencedSymbolsForNode.gen(getTouchingPropertyName(source, position), position);
  }

  /** Every reference to the function a declaration names, each with the call that invokes it when one does. */
  *signatureUsage(declaration: Node): APIRequestGenerator<SignatureUsage[]> {
    return yield* this.#languageService.getSignatureUsage.gen(declaration);
  }

  *#referencesOf(site: Site): APIRequestGenerator<FoundReference[]> {
    const file = this.#sourceOf.get(site.file);
    if (file === undefined) {
      return [];
    }
    const node = getTouchingPropertyName(file, site.position);
    const groups = yield* this.#languageService.getReferencedSymbolsForNode.gen(node, site.position);
    const asked = yield* this.checker.getSymbolAtLocation.gen(node);
    const found: FoundReference[] = [];
    for (const group of groups) {
      const viaRelative = asked !== undefined && isMember(asked) && (yield* this.#isRelative(asked, group.symbol));
      const handles = group.references.filter((candidate) => this.fileOf(candidate) !== null);
      const references = yield* all(...handles.map((handle) => handle.resolve.gen()));
      found.push(...references.flatMap((reference) => (reference === undefined ? [] : [{ ...this.siteOf(reference), relative: viaRelative }])));
    }
    return found;
  }

  // Find-references on a member answers one group per member sharing its root: its own, a base type's, and every
  // sibling that overrides the same base, as `<p className>` beside a props type that redeclares `className`. A group
  // is a relative unless its member is the asked one or inherits it; one with no symbol or no declaration is not judged.
  *#isRelative(asked: NativeSymbol, symbol: NativeSymbol | undefined): APIRequestGenerator<boolean> {
    if (symbol === undefined || !isMember(symbol) || symbol.declarations.length === 0) {
      return false;
    }
    const own = new Set(declarationKeys(asked));
    return !(declarationKeys(symbol).some((key) => own.has(key)) || (yield* this.#inherits(symbol, own, new Set())));
  }

  // Whether `member` overrides the member declared at `own` through its owner's `extends` or `implements` chain. A
  // library member never inherits a tree member, so only a member the world's sources declare is walked.
  *#inherits(member: NativeSymbol, own: ReadonlySet<string>, seen: Set<string>): APIRequestGenerator<boolean> {
    const keys = declarationKeys(member);
    if (keys.some((key) => seen.has(key)) || member.declarations.every((handle) => this.fileOf(handle) === null)) {
      return false;
    }
    for (const key of keys) {
      seen.add(key);
    }
    const owner = yield* this.checker.getParentOfSymbol.gen(member);
    for (const heritage of yield* heritageOf(owner)) {
      const base = yield* this.checker.getPropertyOfType.gen(yield* this.checker.getTypeAtLocation.gen(heritage), member.name);
      if (base !== undefined && (declarationKeys(base).some((key) => own.has(key)) || (yield* this.#inherits(base, own, seen)))) {
        return true;
      }
    }
    return false;
  }

  /** A node's site in one of the world's files. */
  siteOf(node: Node): Site {
    const source = node.getSourceFile();
    return { file: this.#fileOfPath.get(source.path) ?? relative(this.#root, source.fileName), position: node.getStart(source) };
  }

  [Symbol.dispose](): void {
    this.#api.close();
  }

  /** The answers to `requests`, asked of the program of a throwaway snapshot where each absolute file in `files` reads
   *  its text, in one batch round; the snapshot is disposed after it.
   *  @remarks The round goes straight to the API, never through {@link NativeWorld.batch}: its answer memo keys a request
   *  without its snapshot, so a throwaway program's question would get the world's own answer back. */
  trial<T>(
    files: Readonly<Record<string, string>>,
    requests: (program: Program) => readonly APIRequestGenerator<T>[],
    time: <R>(step: TrialStep, work: () => R) => R = (_, work) => work(),
  ): { readonly answers: T[]; readonly projects: readonly ProjectId[] } {
    using held = new DisposableStack();
    // Only the merged project is built: `true` asks a program of every project the snapshot holds, and an edited
    // file's own nearest tsconfig can open one more.
    const snapshot = held.adopt(
      time("snapshot", () => this.#snapshot.update({ fileSystem: { kind: "layer", files }, ensurePrograms: [this.#project] })),
      (made) => made.dispose(),
    );
    const project = snapshot.getProject(this.#project);
    if (project === undefined) {
      throw new Error(`${this.config}: the throwaway snapshot holds no project`);
    }
    const { program } = project;
    return { answers: time("diagnostics", () => this.#api.batch(...requests(program))), projects: snapshot.getProjects().map(({ id }) => id) };
  }
}

/** Each world's home files: every file once, in the first world that names it as a root, else the first that holds it.
 *  A site's answer is the same in every world that holds its file, so its home alone is asked. */
export function homeFiles(configs: readonly string[], lists: ReadonlyMap<string, WorldFiles>): ReadonlyMap<string, ReadonlySet<string>> {
  const home = new Map<string, string>();
  for (const pick of [(files: WorldFiles): ReadonlySet<string> => files.roots, (files: WorldFiles): ReadonlySet<string> => files.held]) {
    for (const config of configs) {
      for (const file of pick(lists.get(config) as WorldFiles)) {
        if (!home.has(file)) {
          home.set(file, config);
        }
      }
    }
  }
  const homes = new Map<string, Set<string>>(configs.map((config) => [config, new Set()]));
  for (const [file, config] of home) {
    homes.get(config)?.add(file);
  }
  return homes;
}

/** A union's member types, or the type itself. */
export function* constituents(type: Type): APIRequestGenerator<readonly Type[]> {
  return type.isUnionType() ? yield* type.getTypes.gen() : [type];
}

/** The properties named `name` on `type`, one per union member when the type is a union. */
export function* propertiesNamed(checker: Checker, type: Type, name: string): APIRequestGenerator<(NativeSymbol | undefined)[]> {
  const members = yield* constituents(type);
  return yield* all(...members.map((member) => checker.getPropertyOfType.gen(member, name)));
}

/** The keys a symbol's declarations go by: one occurrence counts toward every declaration it resolves to. */
export function declarationKeys(symbol: NativeSymbol): readonly string[] {
  return symbol.declarations.map((handle) => `${handle.path}#${handle.index}`);
}

/** Whether every declaration of a symbol sits under a package path, as a library's own members do. */
export const declaredBy = (symbol: NativeSymbol | undefined, packagePath: string): boolean =>
  symbol !== undefined && symbol.declarations.length > 0 && symbol.declarations.every((handle) => handle.path.includes(packagePath));

/** A name in a property position: an identifier or a plain string key. */
export type PropertyName = Identifier | StringLiteral | NoSubstitutionTemplateLiteral;

export const isPropertyName = (node: Node): node is PropertyName => isIdentifier(node) || isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

/** A function a declaration, an expression, an arrow or a method spells: its parameters and its body. */
export type FunctionLike = Node & { readonly parameters: readonly Node[]; readonly body?: Node | undefined };

export const isFunctionLike = (node: Node): node is FunctionLike =>
  isFunctionDeclaration(node) || isFunctionExpression(node) || isArrowFunction(node) || isMethodDeclaration(node);

/** Whether `node` is the name a member declares: an object literal key or shorthand, a method, a property or an accessor. */
export const isNamedMember = (parent: Node, node: Node): boolean =>
  (isPropertyAssignment(parent) ||
    isShorthandPropertyAssignment(parent) ||
    isMethodDeclaration(parent) ||
    isPropertyDeclaration(parent) ||
    isGetAccessorDeclaration(parent) ||
    isSetAccessorDeclaration(parent)) &&
  parent.name === node;
