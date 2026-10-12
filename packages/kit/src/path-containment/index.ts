// The lexical containment test every path-guarding caller shares. It takes the separator instead of importing
// `node:path`, so the isomorphic kit stays free of node and a test can drive both flavours from one platform.

const WINDOWS_SEP = "\\";

/** The slice of `node:path` (or `path.win32` / `path.posix`) the check needs; production callers pass `{ sep }`. */
export interface PathFlavour {
  readonly sep: string;
}

// A directory with its trailing separator, so a sibling sharing the root's name as a prefix (`/staging-other`)
// never matches. A Windows filesystem is case-insensitive (`C:\Staging` and `c:\staging\x` are one tree); POSIX stays exact.
function asDirectory(path: string, flavour: PathFlavour): string {
  const directory = path.endsWith(flavour.sep) ? path : path + flavour.sep;
  return flavour.sep === WINDOWS_SEP ? directory.toLowerCase() : directory;
}

/** Is `target` `root` itself or inside it? Both paths must already be resolved: absolute, no `.` or `..` segments. */
export function isWithinRoot(root: string, target: string, flavour: PathFlavour): boolean {
  return asDirectory(target, flavour).startsWith(asDirectory(root, flavour));
}

/**
 * Is `target` inside `root`, excluding `root` itself? The same resolved-path precondition as {@link isWithinRoot}.
 * A string check cannot see symlinks, so a caller that guards the filesystem follows it with a `realpath` comparison.
 */
export function isStrictDescendant(root: string, target: string, flavour: PathFlavour): boolean {
  return isWithinRoot(root, target, flavour) && asDirectory(target, flavour) !== asDirectory(root, flavour);
}
