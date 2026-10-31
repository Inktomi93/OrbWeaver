// Engine two: the TypeScript 6 language service, one world at a time, asked only about what engine one reports. A
// second compiler, so one engine's resolution gap cannot report a wired symbol.
import { join, relative } from "node:path";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { siteKey } from "./classify.ts";
import { loadScanWorld, realpath } from "./worlds.ts";

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

  /** The repository-relative site of a node in this program. */
  siteOf(node: ts.Node): Site {
    const source = node.getSourceFile();
    return { file: relative(this.#root, source.fileName), position: node.getStart(source) };
  }
}

/** Ask every world for the references of each site and merge them, so a site counts once however many worlds hold
 *  it. Worlds load one at a time; a site whose file a world lacks is not asked there. */
export function serviceReferences(
  root: string,
  worlds: readonly string[],
  sites: readonly Site[],
  log: (line: string) => void,
): ReadonlyMap<string, readonly Site[]> {
  const merged = new Map<string, Map<string, Site>>(sites.map((site) => [siteKey(site), new Map()]));
  for (const config of worlds) {
    const world = ServiceWorld.open(root, config);
    let asked = 0;
    for (const site of sites) {
      if (world.source(site.file) === undefined) {
        continue;
      }
      asked++;
      const into = merged.get(siteKey(site));
      for (const reference of world.references(site)) {
        into?.set(siteKey(reference), reference);
      }
    }
    log(`${config}: engine two asked about ${asked} sites`);
  }
  return new Map([...merged].map(([key, found]) => [key, [...found.values()]]));
}
