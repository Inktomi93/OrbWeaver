// One world on the TypeScript 7.1 API, judging one mutant per layer snapshot. An importer reads a file only through
// its declaration, so the importers are checked only when the mutant changed the file's declaration emit, and the
// whole program when that emit, or any transitive importer's source, augments a global or a module.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Location, Mutant, Position } from "@stryker-mutator/api/core";
import type { Node, StringLiteralLikeNode } from "@typescript/native/ast";
import { isNoSubstitutionTemplateLiteral, isStringLiteral } from "@typescript/native/ast/is";
import type { APIRequestGenerator, Diagnostic, Program, Snapshot } from "@typescript/native/sync";
import { API, all, DiagnosticCategory, formatDiagnostics } from "@typescript/native/sync";

// Far under the server's batch page and V8's spread-argument ceiling.
const BATCH = 5000;

// The classic Stryker checker's own overrides: an emptied body or an orphaned local is a code-quality finding, not a type error.
const CHECKER_OPTION_OVERRIDES = { allowUnreachableCode: true, noUnusedLocals: false, noUnusedParameters: false } as const;

/** What one mutant broke, and every file the judgement read. */
export interface MutantVerdict {
  /** The errors of each file whose error count rose over the unmutated world; empty when the mutant compiles. */
  readonly errors: readonly Diagnostic[];
  readonly checked: readonly string[];
}

/** The mutant fields a judgement reads. */
export type MutantEdit = Pick<Mutant, "fileName" | "location" | "replacement">;

interface Original {
  readonly text: string;
  readonly lineStarts: readonly number[];
}

// The same line breaks TypeScript counts, so a Stryker line and column land where the classic checker puts them.
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/gu;

function original(text: string): Original {
  return { text, lineStarts: [0, ...[...text.matchAll(LINE_BREAK)].map((match) => match.index + match[0].length)] };
}

function offsetOf({ lineStarts }: Original, { line, column }: Position): number {
  const start = lineStarts[line];
  if (start === undefined) {
    throw new Error(`a mutant names line ${String(line)} past the end of its file`);
  }
  return start + column;
}

function mutatedText(file: Original, { start, end }: Location, replacement: string): string {
  return `${file.text.slice(0, offsetOf(file, start))}${replacement}${file.text.slice(offsetOf(file, end))}`;
}

// The wire carries a diagnostic's category as a plain number.
const ERROR_CATEGORY: number = DiagnosticCategory.Error;

const errorsOf = (diagnostics: readonly Diagnostic[]): readonly Diagnostic[] => diagnostics.filter(({ category }) => category === ERROR_CATEGORY);

function* fileErrors(program: Program, file: string): APIRequestGenerator<readonly Diagnostic[]> {
  const [syntactic, semantic] = yield* all(program.getSyntacticDiagnostics.gen(file), program.getSemanticDiagnostics.gen(file));
  return [...errorsOf(syntactic), ...errorsOf(semantic)];
}

const isModuleSpecifier = (node: Node): node is StringLiteralLikeNode => isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);

const isWorldSource = (name: string): boolean => !(name.includes("/node_modules/") || name.endsWith(".d.ts"));

// A declaration that augments a global or another module reaches files that never import it: they read the augmented
// name through the module they do import. Its readers are not on the import graph, so the whole program is.
const AUGMENTATION = /^[ \t]*(?:export[ \t]+)?declare[ \t]+(?:global\b|module[ \t]+["'])/mu;

function* declarationOf(program: Program, file: string): APIRequestGenerator<string> {
  const emit = yield* program.getDeclarationEmit.gen([file]);
  return [...emit.outputFiles.values()].map(({ text }) => text).join("\n");
}

/** One world's program in its own TypeScript 7.1 process, with the classic checker's option overrides. */
export class MutantWorld implements Disposable {
  readonly #api: API;
  readonly #layer: Readonly<Record<string, string>>;
  readonly #config: string;
  readonly #base: Snapshot;
  readonly #baseProgram: Program;
  readonly #held: ReadonlySet<string>;
  readonly #originals = new Map<string, Original>();
  readonly #baseErrors = new Map<string, number>();
  readonly #baseDeclarations = new Map<string, string>();
  #importers: ReadonlyMap<string, ReadonlySet<string>> | undefined;

  private constructor(api: API, config: string) {
    this.#api = api;
    this.#config = config;
    const read = api.readConfigFile(config);
    if (read.error !== undefined) {
      throw new Error(`${config}: ${read.error.text}`);
    }
    const json = read.config as { readonly compilerOptions?: Readonly<Record<string, unknown>> };
    this.#layer = { [config]: JSON.stringify({ ...json, compilerOptions: { ...json.compilerOptions, ...CHECKER_OPTION_OVERRIDES } }) };
    this.#base = this.#snapshot({});
    this.#baseProgram = this.#programOf(this.#base);
    this.#held = new Set(this.#baseProgram.getSourceFileNames());
  }

  /** Open `config`, a path relative to `root`, in a new API process. */
  static open(root: string, config: string): MutantWorld {
    return new MutantWorld(new API({ cwd: root }), resolve(root, config));
  }

  #snapshot(files: Readonly<Record<string, string>>): Snapshot {
    return this.#api.createSnapshot({ openProjects: [this.#config], fileSystem: { kind: "layer", files: { ...this.#layer, ...files } } });
  }

  #programOf(snapshot: Snapshot): Program {
    const project = snapshot.getConfiguredProject(this.#config);
    if (project === undefined) {
      throw new Error(`${this.#config}: the TypeScript 7.1 API loaded no project`);
    }
    return project.program;
  }

  #batch<T>(requests: readonly APIRequestGenerator<T>[]): T[] {
    const results: T[] = [];
    for (let start = 0; start < requests.length; start += BATCH) {
      results.push(...this.#api.batch(...requests.slice(start, start + BATCH)));
    }
    return results;
  }

  /** Whether the world's program holds the absolute file. A mutant outside it passes, as in the classic checker. */
  has(file: string): boolean {
    return this.#held.has(file);
  }

  #original(file: string): Original {
    const known = this.#originals.get(file);
    if (known !== undefined) {
      return known;
    }
    const read = original(readFileSync(file, "utf8"));
    this.#originals.set(file, read);
    return read;
  }

  // Counted, not required to be zero: a world that already carries an error still judges a mutant by what it adds.
  #baseErrorCounts(files: readonly string[]): readonly number[] {
    const missing = files.filter((file) => !this.#baseErrors.has(file));
    const found = this.#batch(missing.map((file) => fileErrors(this.#baseProgram, file)));
    for (const [at, file] of missing.entries()) {
      this.#baseErrors.set(file, found[at]?.length ?? 0);
    }
    return files.map((file) => this.#baseErrors.get(file) ?? 0);
  }

  #baseDeclaration(file: string): string {
    const known = this.#baseDeclarations.get(file);
    if (known !== undefined) {
      return known;
    }
    const [declaration = ""] = this.#batch([declarationOf(this.#baseProgram, file)]);
    this.#baseDeclarations.set(file, declaration);
    return declaration;
  }

  // Built on the first changed declaration only: most runs never need it, and it reads every source file's imports.
  #importGraph(): ReadonlyMap<string, ReadonlySet<string>> {
    if (this.#importers !== undefined) {
      return this.#importers;
    }
    const program = this.#baseProgram;
    const sources = this.#batch([...this.#held].filter(isWorldSource).map((name) => program.getSourceFile.gen(name)));
    const edges = sources.flatMap((source) =>
      source === undefined ? [] : source.imports.filter(isModuleSpecifier).map((specifier) => ({ from: source.fileName, specifier })),
    );
    const resolved = this.#batch(edges.map(({ from, specifier }) => program.getResolvedModuleFromModuleSpecifier.gen(specifier, from)));
    const importers = new Map<string, Set<string>>();
    for (const [at, { from }] of edges.entries()) {
      const target = resolved[at]?.resolvedFileName;
      if (target !== undefined && target !== from) {
        importers.set(target, (importers.get(target) ?? new Set()).add(from));
      }
    }
    this.#importers = importers;
    return importers;
  }

  #transitiveImporters(file: string): readonly string[] {
    const graph = this.#importGraph();
    const seen = new Set([file]);
    const queue = [file];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const importer of graph.get(next) ?? []) {
        if (!seen.has(importer)) {
          seen.add(importer);
          queue.push(importer);
        }
      }
    }
    seen.delete(file);
    return [...seen];
  }

  #otherSources(file: string): readonly string[] {
    return [...this.#held].filter((name) => name !== file && isWorldSource(name));
  }

  #errorsIn(program: Program, files: readonly string[]): readonly Diagnostic[] {
    const bases = this.#baseErrorCounts(files);
    const found = this.#batch(files.map((file) => fileErrors(program, file)));
    return found.flatMap((errors, at) => (errors.length > (bases[at] ?? 0) ? errors : []));
  }

  /** Judge one mutant against the unmutated world. */
  judge({ fileName, location, replacement }: MutantEdit): MutantVerdict {
    const file = resolve(fileName);
    if (!this.has(file)) {
      return { errors: [], checked: [] };
    }
    using held = new DisposableStack();
    const snapshot = held.adopt(this.#snapshot({ [file]: mutatedText(this.#original(file), location, replacement) }), (made) => made.dispose());
    const program = this.#programOf(snapshot);
    const own = this.#errorsIn(program, [file]);
    if (own.length > 0) {
      return { errors: own, checked: [file] };
    }
    const [declaration = ""] = this.#batch([declarationOf(program, file)]);
    const base = this.#baseDeclaration(file);
    if (declaration === base) {
      return { errors: [], checked: [file] };
    }
    const importers = this.#transitiveImporters(file);
    // An importer that augments carries the mutated file's shape to readers that import neither of them.
    const augments =
      AUGMENTATION.test(declaration) || AUGMENTATION.test(base) || importers.some((importer) => AUGMENTATION.test(this.#original(importer).text));
    const readers = augments ? this.#otherSources(file) : importers;
    return { errors: this.#errorsIn(program, readers), checked: [file, ...readers] };
  }

  /** The errors as compiler-formatted text. */
  format(errors: readonly Diagnostic[]): string {
    return formatDiagnostics(errors, this.#api);
  }

  [Symbol.dispose](): void {
    this.#base.dispose();
    this.#api.close();
  }
}
