// Node's package `exports`/`imports` resolution over the authored tree, both directions: a specifier to
// the repo file it names, and a repo file to the specifier a package map can spell for it. Text only —
// no compiler program — so a whole-tree rewrite stays a fast, deterministic pass.
import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { WorkspacePackage } from "../contract/relocate.ts";

/** The tracked tree a specifier resolves against. */
export interface SpecifierWorld {
  readonly files: ReadonlySet<string>;
  readonly dirs: ReadonlySet<string>;
  readonly packages: readonly WorkspacePackage[];
}

/** What a relative literal names: a file, a directory, or a file reached by an implied suffix. */
export interface LiteralEntity {
  readonly path: string;
  /** The suffix the literal leaves implicit (`.ts`, `/index.ts`), "" when it names the entity exactly. */
  readonly suffix: string;
}

const IMPLIED_SUFFIXES = [".ts", ".tsx", ".mts", ".d.ts", ".js", ".json", "/index.ts", "/index.tsx"] as const;
const MANIFEST = "package.json";

function mapOf(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Every authored workspace manifest that names a package. */
export function readWorkspacePackages(root: string, tracked: readonly string[]): readonly WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const path of tracked) {
    if (posix.basename(path) !== MANIFEST || path.split("/").includes("node_modules")) {
      continue;
    }
    const manifest: unknown = JSON.parse(readFileSync(join(root, path), "utf8"));
    if (typeof manifest !== "object" || manifest === null || !("name" in manifest) || typeof manifest.name !== "string") {
      continue;
    }
    const dir = dirname(path) === "." ? "" : dirname(path);
    packages.push({
      name: manifest.name,
      dir,
      exports: mapOf("exports" in manifest ? manifest.exports : undefined),
      imports: mapOf("imports" in manifest ? manifest.imports : undefined),
    });
  }
  return packages;
}

/** The innermost package whose directory holds `path`. */
export function packageOf(path: string, packages: readonly WorkspacePackage[]): WorkspacePackage | undefined {
  let best: WorkspacePackage | undefined;
  for (const pkg of packages) {
    const inside = pkg.dir === "" || path === pkg.dir || path.startsWith(`${pkg.dir}/`);
    if (inside && (best === undefined || pkg.dir.length > best.dir.length)) {
      best = pkg;
    }
  }
  return best;
}

function starOf(pattern: string, value: string): string | undefined {
  const star = pattern.indexOf("*");
  if (star === -1) {
    return pattern === value ? "" : undefined;
  }
  const head = pattern.slice(0, star);
  const tail = pattern.slice(star + 1);
  if (value.length < head.length + tail.length || !value.startsWith(head) || !value.endsWith(tail)) {
    return;
  }
  return value.slice(head.length, value.length - tail.length);
}

/** Node's PATTERN_KEY_COMPARE: an exact key wins, then the longest prefix before the `*`. */
function resolveMap(map: Readonly<Record<string, string>>, key: string): string | undefined {
  const exact = map[key];
  if (exact !== undefined && !key.includes("*")) {
    return exact;
  }
  let bestKey: string | undefined;
  let bestStar = "";
  for (const candidate of Object.keys(map)) {
    if (!candidate.includes("*")) {
      continue;
    }
    const star = starOf(candidate, key);
    if (star === undefined || star === "") {
      continue;
    }
    if (bestKey === undefined || candidate.indexOf("*") > bestKey.indexOf("*")) {
      bestKey = candidate;
      bestStar = star;
    }
  }
  return bestKey === undefined ? undefined : map[bestKey]?.replace("*", bestStar);
}

function joinTarget(pkg: WorkspacePackage, target: string): string {
  return posix.normalize(pkg.dir === "" ? target : `${pkg.dir}/${target}`);
}

/** The repo file a bare (`@scope/name/sub`) or `#` specifier names, seen from `importer`. */
export function resolvePackageSpecifier(spec: string, importer: string, world: SpecifierWorld): string | undefined {
  if (spec.startsWith("#")) {
    const pkg = packageOf(importer, world.packages);
    const target = pkg === undefined ? undefined : resolveMap(pkg.imports, spec);
    return pkg === undefined || target === undefined ? undefined : joinTarget(pkg, target);
  }
  const owner = world.packages.filter((pkg) => spec === pkg.name || spec.startsWith(`${pkg.name}/`)).sort((a, b) => b.name.length - a.name.length)[0];
  if (owner === undefined) {
    return;
  }
  const target = resolveMap(owner.exports, `.${spec.slice(owner.name.length)}`);
  return target === undefined ? undefined : joinTarget(owner, target);
}

/** The specifier `map` spells for `target` (a file inside `pkg`), verified by resolving it forward. */
export function reversePackageSpecifier(target: string, pkg: WorkspacePackage, map: "exports" | "imports"): string | undefined {
  const entries = map === "exports" ? pkg.exports : pkg.imports;
  const relative = `./${pkg.dir === "" ? target : target.slice(pkg.dir.length + 1)}`;
  const spell = (key: string): string => (map === "imports" ? key : `${pkg.name}${key.slice(1)}`);
  const candidates = Object.entries(entries).flatMap(([key, value]) => {
    const star = starOf(value, relative);
    if (star === undefined || (key.includes("*") && star === "")) {
      return [];
    }
    return [key.replace("*", star)];
  });
  return candidates.map((key) => (resolveMap(entries, key) === relative ? spell(key) : undefined)).find((spec) => spec !== undefined);
}

/** What the literal path names in the tracked tree, or undefined when it names nothing. */
export function literalEntity(literalPath: string, world: SpecifierWorld): LiteralEntity | undefined {
  if (literalPath === "." || literalPath === "") {
    return { path: "", suffix: "" };
  }
  if (world.files.has(literalPath) || world.dirs.has(literalPath)) {
    return { path: literalPath, suffix: "" };
  }
  const suffix = IMPLIED_SUFFIXES.find((candidate) => world.files.has(`${literalPath}${candidate}`));
  return suffix === undefined ? undefined : { path: `${literalPath}${suffix}`, suffix };
}

/** A `./`-anchored POSIX relative path from `fromDir` to `to`. */
export function relativeSpecifier(fromDir: string, to: string): string {
  const rel = posix.relative(fromDir === "" ? "." : fromDir, to === "" ? "." : to);
  if (rel === "") {
    return ".";
  }
  return rel.startsWith("../") || rel === ".." ? rel : `./${rel}`;
}

/** Every directory that holds a tracked file. */
export function directoriesOf(files: Iterable<string>): ReadonlySet<string> {
  const dirs = new Set<string>();
  for (const file of files) {
    for (let dir = posix.dirname(file); dir !== "." && !dirs.has(dir); dir = posix.dirname(dir)) {
      dirs.add(dir);
    }
  }
  return dirs;
}
