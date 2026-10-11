// The importable MODULE a package source path belongs to, and the one spelling that enters it from another
// module. A grouping dir (a server tier, client `features/`, inference `backends/`, every ui group) holds
// modules; any other top-level dir is itself a module. A file directly in a grouping dir or at the package
// root is a single-file module, entered by its own path.

/** The grouping dirs per workspace package; `*` makes every top-level dir a grouping dir. */
const GROUPING_DIRS: Readonly<Record<string, readonly string[]>> = {
  server: ["entry", "transport", "domain", "infra", "foundation", "primitives"],
  inference: ["backends"],
  client: ["features"],
  ui: ["*"],
};

/** A package-relative module: its key, and the specifier that enters it from outside. */
export interface PackageModule {
  /** The module dir, or the file itself for a single-file module. */
  readonly key: string;
  /** `#<dir>` for a dir module (its `index.ts` front door); `#src/<file>` for a single-file module. */
  readonly door: string;
  readonly kind: "dir" | "file";
}

/** The subpath pattern that spells any file inside the package, beside the `#*` module doors. */
export const SOURCE_SUBPATH_PREFIX = "#src/";

/** The module of `relative`, a path under `packages/<pkg>/src/`. */
export function packageModuleOf(pkg: string, relative: string): PackageModule {
  const segments = relative.split("/");
  const [head, second] = segments;
  if (segments.length === 1 || head === undefined) {
    return { key: relative, door: `${SOURCE_SUBPATH_PREFIX}${relative}`, kind: "file" };
  }
  const grouping = GROUPING_DIRS[pkg] ?? [];
  if (!(grouping.includes("*") || grouping.includes(head))) {
    return { key: head, door: `#${head}`, kind: "dir" };
  }
  if (segments.length === 2 || second === undefined) {
    return { key: relative, door: `${SOURCE_SUBPATH_PREFIX}${relative}`, kind: "file" };
  }
  return { key: `${head}/${second}`, door: `#${head}/${second}`, kind: "dir" };
}
