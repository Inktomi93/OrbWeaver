// Engine two: TypeScript 7.1 find-references, batched, one world at a time, asked only about what engine one reports.
// A second algorithm over the same compiler, so one index's resolution gap cannot report a wired symbol. The
// TypeScript 6 language service answers instead under `crossCheck`, and serves the scans' checker walks.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { nameAt as nodeAt, siteKey } from "./classify.ts";
import type { FoundReference, WorldFiles } from "./native.ts";
import { hasFlag, NativeWorld } from "./native.ts";
import { loadScanWorld, realpath } from "./worlds.ts";

const isServiceMember = (symbol: ts.Symbol): boolean =>
  hasFlag(symbol.flags, ts.SymbolFlags.PropertyOrAccessor) || hasFlag(symbol.flags, ts.SymbolFlags.Method);

/** One world's program behind a TypeScript 6 language service. */
export class ServiceWorld {
  readonly config: string;
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly #root: string;
  readonly #service: ts.LanguageService;

  private constructor(root: string, config: string) {
    this.config = config;
    this.#root = root;
    const parsed = loadScanWorld(root, config);
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => parsed.fileNames,
      getScriptVersion: () => "0",
      getScriptSnapshot: (file) => {
        const text = ts.sys.readFile(file);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => parsed.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
      // Without it a workspace package loads through its node_modules link and every cross-package use is lost.
      realpath,
    };
    this.#service = ts.createLanguageService(host, ts.createDocumentRegistry());
    const program = this.#service.getProgram();
    if (program === undefined) {
      throw new Error(`${config}: the language service built no program`);
    }
    this.program = program;
    this.checker = program.getTypeChecker();
  }

  static open(root: string, config: string): ServiceWorld {
    return new ServiceWorld(root, config);
  }

  /** The program's parse of a repository-relative file, if the world holds it. */
  source(file: string): ts.SourceFile | undefined {
    return this.program.getSourceFile(join(this.#root, file));
  }

  /** Every reference find-references reports for the name at `site`, the site itself and library files excluded. */
  references(site: Site): readonly FoundReference[] {
    const found: FoundReference[] = [];
    const asked = this.#symbolAt(join(this.#root, site.file), site.position);
    for (const group of this.#service.findReferences(join(this.#root, site.file), site.position) ?? []) {
      const viaRelative = asked !== undefined && isServiceMember(asked) && this.#isRelative(asked, group);
      for (const reference of group.references) {
        const file = relative(this.#root, reference.fileName);
        const at = { file, position: reference.textSpan.start };
        if (!(file.includes("node_modules") || siteKey(at) === siteKey(site))) {
          found.push({ ...at, relative: viaRelative });
        }
      }
    }
    return found;
  }

  #symbolAt(fileName: string, position: number): ts.Symbol | undefined {
    const source = this.program.getSourceFile(fileName);
    const name = source === undefined ? undefined : nodeAt(source, position);
    return name === undefined ? undefined : this.checker.getSymbolAtLocation(name);
  }

  // The TypeScript 6 twin of the native engine's relative test (`tooling/src/unwired/native.ts`).
  #isRelative(asked: ts.Symbol, group: ts.ReferencedSymbol): boolean {
    const symbol = this.#symbolAt(group.definition.fileName, group.definition.textSpan.start);
    const declarations = symbol?.declarations ?? [];
    if (symbol === undefined || !isServiceMember(symbol) || declarations.length === 0) {
      return false;
    }
    const own = new Set(asked.declarations ?? []);
    return !(declarations.some((declaration) => own.has(declaration)) || this.#inherits(symbol, own, new Set()));
  }

  // A library's file as the program loaded it, the native engine's test (`tooling/src/unwired/native.ts`): an external
  // library or the default lib. A declaration file of the tree's own is ours, and a workspace package resolves to its
  // real path through the host's `realpath`, so it is never external.
  #isLibrary(file: ts.SourceFile): boolean {
    return this.program.isSourceFileFromExternalLibrary(file) || this.program.isSourceFileDefaultLibrary(file);
  }

  // Whether `member` overrides a declaration in `own` through its owner's `extends` or `implements` chain. A library
  // member never inherits a tree member, so only a member the world's sources declare is walked.
  #inherits(member: ts.Symbol, own: ReadonlySet<ts.Declaration>, seen: Set<ts.Symbol>): boolean {
    const declarations = member.declarations ?? [];
    if (seen.has(member) || declarations.every((declaration) => this.#isLibrary(declaration.getSourceFile()))) {
      return false;
    }
    seen.add(member);
    return declarations.some((declaration) => {
      const owner = declaration.parent;
      const types = ts.isInterfaceDeclaration(owner) || ts.isClassLike(owner) ? (owner.heritageClauses ?? []).flatMap((clause) => [...clause.types]) : [];
      return types.some((heritage) => {
        const base = this.checker.getPropertyOfType(this.checker.getTypeAtLocation(heritage), member.name);
        return base !== undefined && ((base.declarations ?? []).some((found) => own.has(found)) || this.#inherits(base, own, seen));
      });
    });
  }

  /** The repository-relative site of a node in this program. */
  siteOf(node: ts.Node): Site {
    const source = node.getSourceFile();
    return { file: relative(this.#root, source.fileName), position: node.getStart(source) };
  }
}

// TypeScript 7.1 find-references for each site in one batched pass.
function nativeReferences(root: string, config: string, sites: readonly Site[], merge: (site: Site, references: readonly FoundReference[]) => void): void {
  using world = NativeWorld.open(root, config);
  for (const [at, found] of world.referencesAt(sites).entries()) {
    merge(sites[at] as Site, found);
  }
}

const WORD = /[\p{ID_Start}$_][\p{ID_Continue}$]*/gu;
const NAME_AT = /[\p{ID_Start}$_][\p{ID_Continue}$]*/uy;

// Which files spell each identifier. A reference spells its name, the same filter find-references itself starts from,
// so a world need only be asked about a site when it adds a file that spells the name. Text alone: no engine one input.
function filesSpelling(root: string, files: Iterable<string>): ReadonlyMap<string, readonly string[]> {
  const spelled = new Map<string, string[]>();
  for (const file of files) {
    for (const word of new Set(readFileSync(join(root, file), "utf8").match(WORD))) {
      const held = spelled.get(word);
      if (held === undefined) {
        spelled.set(word, [file]);
      } else {
        held.push(file);
      }
    }
  }
  return spelled;
}

function nameAt(root: string, { file, position }: Site): string | null {
  const scan = new RegExp(NAME_AT);
  scan.lastIndex = position;
  return scan.exec(readFileSync(join(root, file), "utf8"))?.[0] ?? null;
}

// The holders of a site that together hold every file spelling its name, largest gain first. A find-references answer
// is the same in every world that holds the referencing file, so one holder of each file is enough. A site with no
// plain name, a quoted key, goes to every holder.
function worldsFor(holders: readonly string[], lists: ReadonlyMap<string, WorldFiles>, spelling: readonly string[] | null): readonly string[] {
  if (spelling === null) {
    return holders;
  }
  const chosen: string[] = [];
  let left = spelling.filter((file) => holders.some((world) => lists.get(world)?.held.has(file) === true));
  while (left.length > 0) {
    const best = widest(holders, lists, left);
    chosen.push(best);
    left = left.filter((file) => lists.get(best)?.held.has(file) !== true);
  }
  return chosen;
}

function widest(holders: readonly string[], lists: ReadonlyMap<string, WorldFiles>, files: readonly string[]): string {
  const gain = (world: string): number => files.filter((file) => lists.get(world)?.held.has(file) === true).length;
  return holders.reduce((a, b) => (gain(b) > gain(a) ? b : a));
}

// Each world's sites: every site once, in the fewest worlds that still reach all its references.
function nativeAssignment(
  root: string,
  worlds: readonly string[],
  lists: ReadonlyMap<string, WorldFiles>,
  sites: readonly Site[],
): ReadonlyMap<string, readonly Site[]> {
  const spelled = filesSpelling(root, new Set([...lists.values()].flatMap(({ held }) => [...held])));
  const assigned = new Map<string, Site[]>(worlds.map((world) => [world, []]));
  const bySize = worlds.toSorted((a, b) => (lists.get(b)?.held.size ?? 0) - (lists.get(a)?.held.size ?? 0));
  for (const site of new Map(sites.map((one) => [siteKey(one), one])).values()) {
    const holders = bySize.filter((world) => lists.get(world)?.held.has(site.file) === true);
    const name = nameAt(root, site);
    for (const world of worldsFor(holders, lists, name === null ? null : (spelled.get(name) ?? []))) {
      assigned.get(world)?.push(site);
    }
  }
  return assigned;
}

// A site's own name and library files are not uses of it. A site one world reaches through the asked member itself is
// no relative, whatever another world's grouping says.
function keepReferences(into: Map<string, FoundReference> | undefined, site: Site, references: readonly FoundReference[]): void {
  for (const reference of references) {
    const key = siteKey(reference);
    if (!(reference.file.includes("node_modules") || key === siteKey(site))) {
      into?.set(key, { ...reference, relative: reference.relative && into.get(key)?.relative !== false });
    }
  }
}

/** Ask the worlds for the references of each site and merge them, so a site counts once however many worlds hold it.
 *  Worlds load one at a time. TypeScript 7.1 answers in batches, and each site goes only to the holders that together
 *  reach every file spelling its name; `lists` are the worlds' file lists the caller already read for its homes.
 *  `crossCheck` asks the TypeScript 6 language service in every world that holds the site, one site at a time, an
 *  audit of the 7.1 answers; a world that holds none of the sites builds no program. A reference is tagged `relative`
 *  when only a base or sibling member's grouping reached it. */
export function serviceReferences(
  root: string,
  worlds: readonly string[],
  sites: readonly Site[],
  hooks: {
    readonly log: (line: string) => void;
    readonly crossCheck?: boolean | undefined;
    readonly lists: ReadonlyMap<string, WorldFiles>;
  },
): ReadonlyMap<string, readonly FoundReference[]> {
  const merged = new Map<string, Map<string, FoundReference>>(sites.map((site) => [siteKey(site), new Map()]));
  const merge = (site: Site, references: readonly FoundReference[]): void => keepReferences(merged.get(siteKey(site)), site, references);
  const assigned = hooks.crossCheck === true ? new Map<string, readonly Site[]>() : nativeAssignment(root, worlds, hooks.lists, sites);
  for (const config of worlds) {
    const native = assigned.get(config) ?? [];
    if (native.length > 0) {
      nativeReferences(root, config, native, merge);
    }
    const held = hooks.crossCheck === true ? sites.filter((site) => hooks.lists.get(config)?.held.has(site.file) === true) : [];
    if (held.length > 0) {
      const world = ServiceWorld.open(root, config);
      for (const site of held) {
        merge(site, world.references(site));
      }
    }
    hooks.log(`${config}: engine two asked about ${native.length + held.length} sites`);
  }
  return new Map([...merged].map(([key, found]) => [key, [...found.values()]]));
}
