// Engine one: the TypeScript 7.1 API (`@typescript/native/sync`), one API process per world so a world's checker is
// freed before the next loads. Every query goes through a batch: one IPC round trip per query is ~500x slower.
import { relative } from "node:path";
import type { Expression, Identifier, Node, NoSubstitutionTemplateLiteral, SourceFile, StringLiteral } from "@typescript/native/ast";
import {
  getTouchingPropertyName,
  isArrowFunction,
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
} from "@typescript/native/ast";
import type {
  APIRequestGenerator,
  Checker,
  LanguageService,
  Symbol as NativeSymbol,
  NodeHandle,
  ReferencedSymbolEntry,
  SignatureUsage,
  Type,
} from "@typescript/native/sync";
import { API, all, SymbolFlags } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import { bridgedConfigText, MERGED_CONFIG, mergedConfigText } from "./worlds.ts";

// Far under the server's batch page and V8's spread-argument ceiling.
const BATCH = 5000;

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

const isWorldSource = (name: string): boolean => !(name.includes("/node_modules/") || name.endsWith(".d.ts"));

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

/** One world's program in its own TypeScript 7.1 process. */
export class NativeWorld implements Disposable {
  readonly config: string;
  readonly checker: Checker;
  readonly #languageService: LanguageService;
  /** Every source file of the program outside node_modules, declaration files excluded. */
  readonly files: readonly SourceFile[];
  readonly #api: API;
  readonly #root: string;
  readonly #fileOfPath: ReadonlyMap<string, string>;
  readonly #sourceOf: ReadonlyMap<string, SourceFile>;
  readonly #answers = new Map<string>();
  // True while a batch settles: a generator that re-enters the world would read the outer round's answers around itself.
  #settling = false;

  private constructor(root: string, { config, text }: { readonly config: string; readonly text: string }, api: API, declaration: (file: string) => boolean) {
    this.config = config;
    this.#root = root;
    this.#api = api;
    const path = `${root}/${config}`;
    const snapshot = api.createSnapshot({ openProjects: [path], fileSystem: { kind: "layer", files: { [path]: text } } });
    const project = snapshot.getConfiguredProject(path);
    if (project === undefined) {
      throw new Error(`${config}: the TypeScript 7.1 API loaded no project`);
    }
    this.checker = project.checker;
    this.#languageService = project.languageService;
    const names = project.program.getSourceFileNames().filter((name) => isWorldSource(name) || declaration(relative(root, name)));
    this.files = this.batch(names.map((name) => project.program.getSourceFile.gen(name))).flatMap((file) => (file === undefined ? [] : [file]));
    this.#fileOfPath = new Map(this.files.map((file) => [file.path, relative(root, file.fileName)]));
    this.#sourceOf = new Map(this.files.map((file) => [relative(root, file.fileName), file]));
  }

  // The world config is overlaid with the source bridge, the same programs engine two loads.
  static open(root: string, config: string, declarations: ReadonlySet<string> = new Set()): NativeWorld {
    return new NativeWorld(root, { config, text: bridgedConfigText(root, config) }, new API({ cwd: root }), (file) => declarations.has(file));
  }

  /** The merged program over every world (`mergedConfigText`), with the declaration files `declaration` keeps. */
  static openMerged(root: string, declaration: (file: string) => boolean): NativeWorld {
    return new NativeWorld(root, { config: MERGED_CONFIG, text: mergedConfigText(root) }, new API({ cwd: root }), declaration);
  }

  /** The repository-relative source files and root files of every world, listed in one session rather than one
   *  process per world. */
  static fileLists(root: string, configs: readonly string[], declarations: ReadonlySet<string> = new Set()): ReadonlyMap<string, WorldFiles> {
    using api = new API({ cwd: root });
    const files = Object.fromEntries(configs.map((config) => [`${root}/${config}`, bridgedConfigText(root, config)]));
    const snapshot = api.createSnapshot({ openProjects: Object.keys(files), fileSystem: { kind: "layer", files } });
    const relatives = (names: readonly string[]): ReadonlySet<string> =>
      new Set(names.filter((name) => isWorldSource(name) || declarations.has(relative(root, name))).map((name) => relative(root, name)));
    return new Map(
      configs.map((config) => {
        const project = snapshot.getConfiguredProject(`${root}/${config}`);
        return [config, { held: relatives(project?.program.getSourceFileNames() ?? []), roots: relatives(project?.parsedCommandLine.fileNames ?? []) }];
      }),
    );
  }

  /** Run request generators in pages of {@link BATCH}, keeping their order.
   *  @throws When a request generator runs a batch of its own: the outer round's answers would be read around it. */
  batch<T>(requests: readonly APIRequestGenerator<T>[]): T[] {
    if (this.#settling) {
      throw new Error("NativeWorld.batch ran inside a request generator: ask through yield, or settle the data before the batch");
    }
    const results: T[] = [];
    for (let start = 0; start < requests.length; start += BATCH) {
      results.push(...this.#settle(requests.slice(start, start + BATCH)));
    }
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

  /** The symbol at each node, an import alias followed to the symbol it names. */
  symbolsAt(nodes: readonly Node[]): (NativeSymbol | undefined)[] {
    const found = this.batch(nodes.map((node) => this.checker.getSymbolAtLocation.gen(node)));
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

  /** The type at each node. */
  typesAt(nodes: readonly Node[]): Type[] {
    return this.batch(nodes.map((node) => this.checker.getTypeAtLocation.gen(node)));
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

  /** The repository-relative file a declaration lives in, or null for one outside the world's sources. */
  fileOf(handle: NodeHandle): string | null {
    return this.#fileOfPath.get(handle.path) ?? null;
  }

  /** The repository-relative file of one of the world's parsed files. */
  fileOfSource(source: SourceFile): string {
    return this.#fileOfPath.get(source.path) ?? relative(this.#root, source.fileName);
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
  referencesAt(sites: readonly Site[]): Site[][] {
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

  *#referencesOf(site: Site): APIRequestGenerator<Site[]> {
    const file = this.#sourceOf.get(site.file);
    if (file === undefined) {
      return [];
    }
    const node = getTouchingPropertyName(file, site.position);
    const groups = yield* this.#languageService.getReferencedSymbolsForNode.gen(node, site.position);
    const handles = groups.flatMap((group) => group.references.filter((candidate) => this.fileOf(candidate) !== null));
    const references = yield* all(...handles.map((handle) => handle.resolve.gen()));
    return references.flatMap((reference) => (reference === undefined ? [] : [this.siteOf(reference)]));
  }

  /** A node's site in one of the world's files. */
  siteOf(node: Node): Site {
    const source = node.getSourceFile();
    return { file: this.#fileOfPath.get(source.path) ?? relative(this.#root, source.fileName), position: node.getStart(source) };
  }

  [Symbol.dispose](): void {
    this.#api.close();
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
