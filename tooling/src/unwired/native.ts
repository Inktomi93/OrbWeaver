// Engine one: the TypeScript 7.1 API (`@typescript/native/sync`), one API process per world so a world's checker is
// freed before the next loads. Every query goes through a batch: one IPC round trip per query is ~500x slower.
import { relative } from "node:path";
import type { Expression, Node, SourceFile } from "@typescript/native/ast";
import { getTouchingPropertyName } from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, LanguageService, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { API, SymbolFlags } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import { bridgedConfigText } from "./worlds.ts";

// Far under the server's batch page and V8's spread-argument ceiling.
const BATCH = 5000;

/** Whether a compiler-owned bitfield carries `flag`. */
export function hasFlag(flags: number, flag: number): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript symbol and type flags are compiler-owned bitfields.
  return (flags & flag) !== 0;
}

const isWorldSource = (name: string): boolean => !(name.includes("/node_modules/") || name.endsWith(".d.ts"));

type Request = APIRequestGenerator extends Generator<infer Yielded, unknown, unknown> ? Yielded : never;

interface Pending<T> {
  readonly generator: APIRequestGenerator<T>;
  readonly at: number;
  readonly key: string;
  readonly request: Request;
}

function* ask(request: Request): APIRequestGenerator<unknown> {
  return yield request;
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
  readonly #answers = new Map<string, unknown>();

  private constructor(root: string, config: string, api: API) {
    this.config = config;
    this.#root = root;
    this.#api = api;
    const path = `${root}/${config}`;
    // The world config is overlaid with the source bridge, the same programs engine two loads.
    const snapshot = api.createSnapshot({ openProjects: [path], fileSystem: { kind: "layer", files: { [path]: bridgedConfigText(root, config) } } });
    const project = snapshot.getConfiguredProject(path);
    if (project === undefined) {
      throw new Error(`${config}: the TypeScript 7.1 API loaded no project`);
    }
    this.checker = project.checker;
    this.#languageService = project.languageService;
    const names = project.program.getSourceFileNames().filter(isWorldSource);
    this.files = this.batch(names.map((name) => project.program.getSourceFile.gen(name))).flatMap((file) => (file === undefined ? [] : [file]));
    this.#fileOfPath = new Map(this.files.map((file) => [file.path, relative(root, file.fileName)]));
    this.#sourceOf = new Map(this.files.map((file) => [relative(root, file.fileName), file]));
  }

  static open(root: string, config: string): NativeWorld {
    return new NativeWorld(root, config, new API({ cwd: root }));
  }

  /** The repository-relative source files of every world, listed in one session rather than one process per world. */
  static fileLists(root: string, configs: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> {
    using api = new API({ cwd: root });
    const files = Object.fromEntries(configs.map((config) => [`${root}/${config}`, bridgedConfigText(root, config)]));
    const snapshot = api.createSnapshot({ openProjects: Object.keys(files), fileSystem: { kind: "layer", files } });
    return new Map(
      configs.map((config) => {
        const names = snapshot.getConfiguredProject(`${root}/${config}`)?.program.getSourceFileNames() ?? [];
        return [config, new Set(names.filter(isWorldSource).map((name) => relative(root, name)))];
      }),
    );
  }

  /** Run request generators in pages of {@link BATCH}, keeping their order. */
  batch<T>(requests: readonly APIRequestGenerator<T>[]): T[] {
    const results: T[] = [];
    for (let start = 0; start < requests.length; start += BATCH) {
      results.push(...this.#settle(requests.slice(start, start + BATCH)));
    }
    return results;
  }

  // Every query is pure in one snapshot, so each distinct request crosses to the compiler once in this world's life:
  // later asks and same-round repeats share its answer. `API.batch` itself only deduplicates `initialize`.
  #settle<T>(generators: readonly APIRequestGenerator<T>[]): T[] {
    const results: T[] = [];
    let waiting: Pending<T>[] = [];
    const advance = (generator: APIRequestGenerator<T>, at: number, first: unknown): void => {
      let step = generator.next(first);
      while (step.done !== true) {
        const key = JSON.stringify(step.value);
        if (!this.#answers.has(key)) {
          waiting.push({ generator, at, key, request: step.value as Request });
          return;
        }
        step = generator.next(this.#answers.get(key));
      }
      results[at] = step.value;
    };
    for (const [at, generator] of generators.entries()) {
      advance(generator, at, undefined);
    }
    while (waiting.length > 0) {
      const round = waiting;
      waiting = [];
      const distinct = new Map(round.map(({ key, request }) => [key, request]));
      for (const start of pageStarts(distinct.size)) {
        const page = [...distinct].slice(start, start + BATCH);
        const answers = this.#api.batch(...page.map(([, request]) => ask(request)));
        for (const [at, [key]] of page.entries()) {
          this.#answers.set(key, answers[at]);
        }
      }
      for (const { generator, at, key } of round) {
        advance(generator, at, this.#answers.get(key));
      }
    }
    return results;
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

  /** The repository-relative file a declaration lives in, or null for one outside the world's sources. */
  fileOf(handle: NodeHandle): string | null {
    return this.#fileOfPath.get(handle.path) ?? null;
  }

  /** Whether the world holds the repository-relative file. */
  has(file: string): boolean {
    return this.#sourceOf.has(file);
  }

  /** The sites TypeScript 7.1 find-references reports for the name at each site, the site itself included. A
   *  reference in a file outside the world's sources (a library or `node_modules`) is not resolved. */
  referencesAt(sites: readonly Site[]): Site[][] {
    return this.batch(sites.map((site) => this.#referencesOf(site)));
  }

  *#referencesOf(site: Site): APIRequestGenerator<Site[]> {
    const file = this.#sourceOf.get(site.file);
    const found: Site[] = [];
    if (file === undefined) {
      return found;
    }
    const node = getTouchingPropertyName(file, site.position);
    for (const group of yield* this.#languageService.getReferencedSymbolsForNode.gen(node, site.position)) {
      for (const handle of group.references.filter((candidate) => this.fileOf(candidate) !== null)) {
        const reference = yield* handle.resolve.gen();
        if (reference !== undefined) {
          found.push(this.siteOf(reference));
        }
      }
    }
    return found;
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

/** A union's member types, or the type itself. */
export function* constituents(type: Type): APIRequestGenerator<readonly Type[]> {
  return type.isUnionType() ? yield* type.getTypes.gen() : [type];
}

/** The properties named `name` on `type`, one per union member when the type is a union. */
export function* propertiesNamed(checker: Checker, type: Type, name: string): APIRequestGenerator<(NativeSymbol | undefined)[]> {
  const members = yield* constituents(type);
  const found: (NativeSymbol | undefined)[] = [];
  for (const member of members) {
    found.push(yield* checker.getPropertyOfType.gen(member, name));
  }
  return found;
}

/** The keys a symbol's declarations go by: one occurrence counts toward every declaration it resolves to. */
export function declarationKeys(symbol: NativeSymbol): readonly string[] {
  return symbol.declarations.map((handle) => `${handle.path}#${handle.index}`);
}
