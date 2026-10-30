// How one area imports another's type: its front door (a server area's index.ts, or any package `exports` entry,
// the root `.` included), the name the door exports it under, and whether the import would close a cycle.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { aliased } from "./foreign-types.ts";
import { isProduction } from "./worlds.ts";

/** A module another area imports through: its specifier and its repository-relative file. */
export interface Door {
  readonly specifier: string;
  readonly file: string;
}

const SERVER_AREA = /^packages\/server\/src\/([^/]+\/[^/]+)\//u;
const PACKAGE_FILE = /^packages\/([^/]+)\/(.+)$/u;

/** The server area (`domain/chat`), else the package, a file belongs to. */
export const areaOf = (file: string): string => SERVER_AREA.exec(file)?.[1] ?? /^packages\/([^/]+)\//u.exec(file)?.[1] ?? file;

function exportTarget(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry !== null && typeof entry === "object") {
    const conditions = entry as Readonly<Record<string, unknown>>;
    return exportTarget(conditions["import"] ?? conditions["default"] ?? conditions["types"]);
  }
  return null;
}

// Every `exports` entry whose file is an index.ts above `ownerFile`, nearest first. Subpath and root doors alike.
function packageDoors(root: string, ownerFile: string): readonly Door[] {
  const [, pkg = "", inner = ""] = PACKAGE_FILE.exec(ownerFile) ?? [];
  const manifestPath = join(root, "packages", pkg, "package.json");
  if (!existsSync(manifestPath)) {
    return [];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { readonly exports?: Readonly<Record<string, unknown>> };
  const doors: (Door & { readonly depth: number })[] = [];
  for (const [key, entry] of Object.entries(manifest.exports ?? {})) {
    const target = exportTarget(entry)?.replace(/^\.\//u, "") ?? null;
    if (target === null || !target.endsWith("index.ts") || !(inner === target || inner.startsWith(`${dirname(target)}/`))) {
      continue;
    }
    const specifier = key === "." ? `@orb/${pkg}` : `@orb/${pkg}/${key.replace(/^\.\//u, "")}`;
    doors.push({ specifier, file: `packages/${pkg}/${target}`, depth: target.split("/").length });
  }
  return doors.sort((a, b) => b.depth - a.depth).map(({ specifier, file }) => ({ specifier, file }));
}

/** The doors a file in another area can import `ownerFile`'s exports through, nearest first. */
export function doorsOf(root: string, ownerFile: string): readonly Door[] {
  const server = SERVER_AREA.exec(ownerFile);
  if (server === null) {
    return packageDoors(root, ownerFile);
  }
  const file = `packages/server/src/${server[1]}/index.ts`;
  return existsSync(join(root, file)) ? [{ specifier: `#${server[1]}`, file }] : [];
}

/** A loaded world and the repository root its relative paths start from. */
export interface LoadedWorld {
  readonly program: ts.Program;
  readonly root: string;
}

function moduleExports(world: LoadedWorld, file: string): readonly ts.Symbol[] {
  const checker = world.program.getTypeChecker();
  const source = world.program.getSourceFile(join(world.root, file));
  const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  return module === undefined ? [] : checker.getExportsOfModule(module);
}

/** The name `file` `target` under (an `X as Y` alias counts), or null when it does not export it. */
export function exportNameOf(world: LoadedWorld, file: string, target: ts.Symbol): string | null {
  const checker = world.program.getTypeChecker();
  return moduleExports(world, file).find((symbol) => aliased(checker, symbol) === target)?.name ?? null;
}

/** Does `file` already export some other symbol as `name`? A second export of that name is TS2300. */
export function exportsOtherAs(world: LoadedWorld, file: string, name: string, target: ts.Symbol): boolean {
  const named = moduleExports(world, file).find((symbol) => symbol.name === name);
  return named !== undefined && aliased(world.program.getTypeChecker(), named) !== target;
}

export function relativeSpecifier(fromFile: string, toFile: string): string {
  const path = relative(dirname(fromFile), toFile).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}

/** The import graph of production files, walked lazily, for the cycle check. */
export class ImportGraph {
  readonly #program: ts.Program;
  readonly #root: string;
  readonly #edges = new Map<string, readonly string[]>();

  constructor(program: ts.Program, root: string) {
    this.#program = program;
    this.#root = root;
  }

  #importsOf(file: string): readonly string[] {
    const known = this.#edges.get(file);
    if (known !== undefined) {
      return known;
    }
    const checker = this.#program.getTypeChecker();
    const source = this.#program.getSourceFile(join(this.#root, file));
    const found = (source?.statements ?? []).flatMap((statement) => {
      const specifier = ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement) ? statement.moduleSpecifier : undefined;
      const module = specifier !== undefined && ts.isStringLiteral(specifier) ? checker.getSymbolAtLocation(specifier) : undefined;
      const target = module?.valueDeclaration?.getSourceFile().fileName ?? module?.declarations?.[0]?.getSourceFile().fileName;
      const rel = target === undefined ? "" : relative(this.#root, target);
      return isProduction(rel) ? [rel] : [];
    });
    this.#edges.set(file, found);
    return found;
  }

  /** Would `importer` importing `module` close a cycle? dependency-cruiser refuses one, type-only or not. */
  reaches(module: string, importer: string): boolean {
    const seen = new Set<string>([module]);
    const queue = [module];
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      if (next === importer) {
        return true;
      }
      for (const file of this.#importsOf(next).filter((candidate) => !seen.has(candidate))) {
        seen.add(file);
        queue.push(file);
      }
    }
    return false;
  }
}

const tierOf = (file: string): string | null => /^packages\/server\/src\/([^/]+)\//u.exec(file)?.[1] ?? null;

/** Where a shape goes when its consumer cannot import its current home: `entry/contract/` between two entry files,
 *  else the contract directory of the owner's area. */
export function lowerHome(importer: string, ownerFile: string): string {
  if (tierOf(importer) === "entry" && tierOf(ownerFile) === "entry") {
    return "packages/server/src/entry/contract/";
  }
  return `packages/server/src/${areaOf(ownerFile)}/contract/`;
}
