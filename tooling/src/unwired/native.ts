// Engine one: the TypeScript 7.1 API (`@typescript/native/sync`), one API process per world so a world's checker is
// freed before the next loads. Every query goes through a batch: one IPC round trip per query is ~500x slower.
//
// The API's compiler process is private to it, and its socket mode is refused by the sync client, so the process is
// read from Node's `child_process` diagnostics channel while the API's constructor spawns it, and published on
// COMPILER_CHANNEL for whoever measures or watches the run.
import type { ChildProcess } from "node:child_process";
import { channel, subscribe, unsubscribe } from "node:diagnostics_channel";
import { relative, resolve } from "node:path";
import type { ComputedPropertyName, Expression, Identifier, Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from "@typescript/native/ast";
import {
  isArrowFunction,
  isComputedPropertyName,
  isFunctionDeclaration,
  isFunctionExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isNoSubstitutionTemplateLiteral,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isStringLiteral,
  SyntaxKind,
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
import { API, all, isRemoteNode, SymbolFlags } from "@typescript/native/sync";
import { isLibrarySource, packageNameOf } from "../brand-names/index.ts";
import { spawnedChild } from "../floor/process/proc.ts";
import { workspacePackageRoots } from "../package-effects/index.ts";
import type { Site } from "./classify.ts";
import { bridgedConfigText, MERGED_CONFIG, mergedConfigText } from "./worlds.ts";

// Far under the server's batch page and V8's spread-argument ceiling.
const BATCH = 5000;

// A list in pieces of at most BATCH, for the wire's array-form requests.
const chunked = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, at) => items.slice(at * BATCH, (at + 1) * BATCH));

/** The diagnostics channel every compiler process a world starts is published on, as a {@link CompilerStart}. */
export const COMPILER_CHANNEL = "orbweaver:unwired:compiler";

/** One compiler process a world started, and the config its program serves. */
export interface CompilerStart {
  readonly process: ChildProcess;
  readonly config: string;
}

const compilerStarts = channel(COMPILER_CHANNEL);
// What a compiler that parses texts outside any program serves.
const PARSE_ALONE = "(texts parsed alone)";
// Node publishes each spawned process here, as `{ process }`, synchronously inside the spawn.
const CHILD_PROCESS_CHANNEL = "child_process";

/** A message read off {@link COMPILER_CHANNEL} as the compiler start it is. */
export function compilerStartOf(message: unknown): CompilerStart | undefined {
  const child = spawnedChild(message);
  return child !== undefined && typeof message === "object" && message !== null && "config" in message && typeof message.config === "string"
    ? { process: child, config: message.config }
    : undefined;
}

/** An API whose compiler process is published on {@link COMPILER_CHANNEL}: the constructor spawns it synchronously, so
 *  every process spawned meanwhile is the API's. */
export function startAPI(options: ConstructorParameters<typeof API>[0], config: string): API {
  const spawned: ChildProcess[] = [];
  const take = (message: unknown): void => {
    const child = spawnedChild(message);
    if (child !== undefined) {
      spawned.push(child);
    }
  };
  subscribe(CHILD_PROCESS_CHANNEL, take);
  try {
    return new API(options);
  } finally {
    unsubscribe(CHILD_PROCESS_CHANNEL, take);
    for (const child of spawned) {
      compilerStarts.publish({ process: child, config } satisfies CompilerStart);
    }
  }
}

/** The two steps of a throwaway trial: making its snapshot and asking its program. */
export const TRIAL_STEPS = ["snapshot", "diagnostics"] as const;
export type TrialStep = (typeof TRIAL_STEPS)[number];

/** The name {@link NativeWorld.libraryOf} gives the compiler's own default library files, which belong to no manifest. */
export const DEFAULT_LIBRARY = "(default library)";

/** A node's place for an error: its file, span and syntax kind, and whether it came from the program's own tree (a
 *  token the AST navigator makes for syntax with no node does not). */
export function nodePlace(node: Node): string {
  const file = node.getSourceFile().fileName;
  const origin = isRemoteNode(node) ? "program tree" : "navigator token";
  return `${file} pos=${String(node.pos)} end=${String(node.end)} ${SyntaxKind[node.kind]} (${origin})`;
}

/** The deepest node of the program's tree whose text, trivia aside, holds `position`. */
export function deepestAt(source: SourceFile, position: number): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (position >= node.getStart(source) && position < node.end) {
      found = node;
      node.forEachChild(visit);
    }
  };
  source.forEachChild(visit);
  return found;
}

/** The name a site key points at: the deepest node of the program's tree that starts at `position`, the rule a key
 *  is minted by (a declaration's name or a reference's start, so a computed name is its whole `[…]`), or a string
 *  literal whose reported span starts inside its quote. Undefined when no node starts there: a reference in a doc
 *  comment names no code. A tree walk, never a token lookup: the navigator makes its own tokens for syntax the tree
 *  holds no node for, and the checker takes none of them. */
export function nameAt(source: SourceFile, position: number): Node | undefined {
  const found = deepestAt(source, position);
  const start = found?.getStart(source);
  return start === position || (found !== undefined && (isStringLiteral(found) || isNoSubstitutionTemplateLiteral(found)) && start === position - 1)
    ? found
    : undefined;
}

/** Whether a compiler-owned bitfield carries `flag`. */
export function hasFlag(flags: number, flag: number): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript symbol and type flags are compiler-owned bitfields.
  return (flags & flag) !== 0;
}

/** A world's source files, and the root files its config names rather than reaches through imports. */
export interface WorldFiles {
  readonly held: ReadonlySet<string>;
  readonly roots: ReadonlySet<string>;
}

const DECLARATION_FILE = ".d.ts";
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

  // The world config is overlaid with the source bridge, so a world resolves workspace imports to their sources.
  static open(root: string, config: string, declarations: ReadonlySet<string> = new Set()): NativeWorld {
    return new NativeWorld(root, { config, text: bridgedConfigText(root, config) }, startAPI({ cwd: root }, config), (file) => declarations.has(file));
  }

  /** The merged program over every world (`mergedConfigText`), with the declaration files `declaration` keeps. */
  static openMerged(root: string, declaration: (file: string) => boolean, timing = false): NativeWorld {
    return new NativeWorld(
      root,
      { config: MERGED_CONFIG, text: mergedConfigText(root) },
      startAPI({ cwd: root, collectTiming: timing }, MERGED_CONFIG),
      declaration,
    );
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
    using api = startAPI({ cwd: root }, configs.join(","));
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
    const foreign = nodes.filter((node) => !isRemoteNode(node));
    if (foreign.length > 0) {
      throw new Error(
        `getSymbolAtLocation: ${String(foreign.length)} of ${String(nodes.length)} nodes are not from the program's tree:\n${foreign.map((node) => `  ${nodePlace(node)}`).join("\n")}`,
      );
    }
    try {
      return this.#unalias(this.batch(chunked(nodes).map((chunk) => this.checker.getSymbolAtLocation.gen(chunk))).flat());
    } catch (error) {
      throw new Error(`getSymbolAtLocation over ${String(nodes.length)} nodes failed; the first is ${nodes[0] === undefined ? "none" : nodePlace(nodes[0])}`, {
        cause: error,
      });
    }
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
    return meta !== undefined && fromLibrary(meta, this.#workspace) ? packageNameOf(meta.packageJsonDirectory) : null;
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
      ? (packageNameOf(meta.packageJsonDirectory) ?? meta.packageJsonDirectory)
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

  /** Parse each text on its own, outside any program, by its repository-relative file name, and read each parse with
   *  `read` before its lease ends. */
  static readTexts<T>(root: string, texts: ReadonlyMap<string, string>, read: (source: SourceFile) => T): ReadonlyMap<string, T> {
    using api = startAPI({ cwd: root }, PARSE_ALONE);
    const parsed = api.batch(
      ...[...texts].map(function* ([file, text]): APIRequestGenerator<readonly [string, RetainedSourceFile]> {
        return [file, yield* api.createSourceFile.gen(resolve(root, file), text)];
      }),
    );
    try {
      return new Map(parsed.map(([file, lease]) => [file, read(lease.sourceFile)]));
    } finally {
      for (const [, lease] of parsed) {
        lease[Symbol.dispose]();
      }
    }
  }

  /** Whether the world holds the repository-relative file. */
  has(file: string): boolean {
    return this.#sourceOf.has(file);
  }

  /** The world's parse of a repository-relative file, if it holds it. */
  source(file: string): SourceFile | undefined {
    return this.#sourceOf.get(file);
  }

  /** Find-references at a node, one group per symbol it may mean. A computed member name is asked through the
   *  member's own symbol: find-references answers nothing at a `[…]`, and a position inside it means the expression
   *  the brackets hold. */
  *referencedSymbolsOf(node: Node): APIRequestGenerator<ReferencedSymbolEntry[]> {
    if (isComputedPropertyName(node)) {
      return yield* this.#computedReferences(node);
    }
    return yield* this.#languageService.getReferencedSymbolsForNode.gen(node, node.getStart(node.getSourceFile()));
  }

  // TypeScript 7.1 find-references answers nothing for a late-bound member, at its name or at a read of it, so the
  // member's one group is the checker's own per-file references in every file that spells the member's name. Like
  // find-references it sees a read by name (`shape.zqKey`), never one through the constant (`shape[KEY]`), and it
  // leaves out the declaration. A member whose name no source spells, a unique symbol's, has no references.
  *#computedReferences(name: ComputedPropertyName): APIRequestGenerator<ReferencedSymbolEntry[]> {
    const member = yield* this.checker.getSymbolAtLocation.gen(name);
    const [definition] = member?.declarations ?? [];
    if (member === undefined || definition === undefined) {
      return [];
    }
    const spelling = [...this.#sourceOf].filter(([, source]) => source.text.includes(member.name)).map(([file]) => resolve(this.#root, file));
    const found = yield* all(...spelling.map((file) => this.checker.getReferencesToSymbolInFile.gen(file, member)));
    return [{ definition, symbol: member, references: found.flat() }];
  }

  /** Every reference to the function a declaration names, each with the call that invokes it when one does. */
  *signatureUsage(declaration: Node): APIRequestGenerator<SignatureUsage[]> {
    return yield* this.#languageService.getSignatureUsage.gen(declaration);
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
