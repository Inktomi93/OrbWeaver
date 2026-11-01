// Engine two: TypeScript 7.1 find-references, batched, one world at a time, asked only about what engine one reports.
// A second algorithm over the same compiler, so one index's resolution gap cannot report a wired symbol. The
// TypeScript 6 language service answers instead under `crossCheck`, and serves the scans' checker walks.
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { siteKey } from "./classify.ts";
import type { WorldFiles } from "./native.ts";
import { NativeWorld } from "./native.ts";
import type { PortMember } from "./restated-port.ts";
import { effectiveMember, flowMembers, flowsAt } from "./restated-port.ts";
import { isProduction, loadScanWorld, realpath } from "./worlds.ts";

// The scan key of a member declared directly in an interface or an object type alias; null for any other member.
function memberKey(root: string, member: PortMember): string | null {
  const holder = member.parent;
  const alias = ts.isTypeLiteralNode(holder) && ts.isTypeAliasDeclaration(holder.parent) ? holder.parent : null;
  const home = ts.isInterfaceDeclaration(holder) ? holder : alias;
  return home === null ? null : `${relative(root, member.getSourceFile().fileName)}:${home.name.text}.${member.name.getText()}`;
}

function addFlow(flows: Map<string, Set<string>>, value: string | null, slot: string | null): void {
  if (value !== null && slot !== null && value !== slot) {
    flows.set(value, (flows.get(value) ?? new Set()).add(slot));
  }
}

// A value handed into a slot, and a member derived from another (`readonly m: Owner["m"]`): a use of the slot or of
// the derived member is a use of the member it comes from.
function recordFlows(root: string, checker: ts.TypeChecker, node: ts.Node, flows: Map<string, Set<string>>): void {
  for (const flow of flowsAt(checker, node).members) {
    const joined = flowMembers(checker, flow);
    addFlow(flows, joined === null ? null : memberKey(root, joined.owner), joined === null ? null : memberKey(root, joined.port));
  }
  if (ts.isPropertySignature(node)) {
    addFlow(flows, memberKey(root, effectiveMember(checker, node)), memberKey(root, node));
  }
}

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
  references(site: Site): readonly Site[] {
    const found: Site[] = [];
    for (const group of this.#service.findReferences(join(this.#root, site.file), site.position) ?? []) {
      for (const reference of group.references) {
        const file = relative(this.#root, reference.fileName);
        const at = { file, position: reference.textSpan.start };
        if (!(file.includes("node_modules") || siteKey(at) === siteKey(site))) {
          found.push(at);
        }
      }
    }
    return found;
  }

  /** The member flows of the world's production files. */
  flows(): Map<string, Set<string>> {
    const flows = new Map<string, Set<string>>();
    const visit = (node: ts.Node): void => {
      recordFlows(this.#root, this.checker, node, flows);
      ts.forEachChild(node, visit);
    };
    for (const source of this.program.getSourceFiles()) {
      if (!source.isDeclarationFile && isProduction(this.siteOf(source).file)) {
        visit(source);
      }
    }
    return flows;
  }

  /** The repository-relative site of a node in this program. */
  siteOf(node: ts.Node): Site {
    const source = node.getSourceFile();
    return { file: relative(this.#root, source.fileName), position: node.getStart(source) };
  }
}

// TypeScript 7.1 find-references for each site in one batched pass.
function nativeReferences(root: string, config: string, sites: readonly Site[], merge: (site: Site, references: readonly Site[]) => void): void {
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
function nativeAssignment(root: string, worlds: readonly string[], sites: readonly Site[]): ReadonlyMap<string, readonly Site[]> {
  const lists = NativeWorld.fileLists(root, worlds);
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

// A site's own name and library files are not uses of it.
function keepReferences(into: Map<string, Site> | undefined, site: Site, references: readonly Site[]): void {
  for (const reference of references) {
    if (!(reference.file.includes("node_modules") || siteKey(reference) === siteKey(site))) {
      into?.set(siteKey(reference), reference);
    }
  }
}

/** Ask the worlds for the references of each site and merge them, so a site counts once however many worlds hold it.
 *  Worlds load one at a time. TypeScript 7.1 answers in batches, and each site goes only to the holders that together
 *  reach every file spelling its name; `crossCheck` asks the TypeScript 6 language service in every world that holds
 *  the site, one site at a time, an audit of the 7.1 answers. `visit` reads a TypeScript 6 program of each world
 *  before the next replaces it. */
export function serviceReferences(
  root: string,
  worlds: readonly string[],
  sites: readonly Site[],
  hooks: {
    readonly log: (line: string) => void;
    readonly visit?: (world: ServiceWorld) => void;
    readonly crossCheck?: boolean | undefined;
  },
): ReadonlyMap<string, readonly Site[]> {
  const merged = new Map<string, Map<string, Site>>(sites.map((site) => [siteKey(site), new Map()]));
  const merge = (site: Site, references: readonly Site[]): void => keepReferences(merged.get(siteKey(site)), site, references);
  const assigned = hooks.crossCheck === true ? new Map<string, readonly Site[]>() : nativeAssignment(root, worlds, sites);
  for (const config of worlds) {
    const native = assigned.get(config) ?? [];
    if (native.length > 0) {
      nativeReferences(root, config, native, merge);
    }
    const asked = native.length;
    if (hooks.crossCheck === true || hooks.visit !== undefined) {
      const world = ServiceWorld.open(root, config);
      const held = hooks.crossCheck === true ? sites.filter((site) => world.source(site.file) !== undefined) : [];
      for (const site of held) {
        merge(site, world.references(site));
      }
      hooks.visit?.(world);
      hooks.log(`${config}: engine two asked about ${asked + held.length} sites`);
    } else {
      hooks.log(`${config}: engine two asked about ${asked} sites`);
    }
  }
  return new Map([...merged].map(([key, found]) => [key, [...found.values()]]));
}
