// One anchored pattern for a list of exact paths, with every shared directory written once. A checker that validates
// or compiles each pattern pays for its length, and a flat alternation of whole paths repeats each directory per file.

const SYNTAX = /[\\^$.*+?()[\]{}|]/gu;
const literal = (text: string): string => text.replaceAll(SYNTAX, "\\$&");

interface Folder {
  /** A listed path ends at this segment. */
  file: boolean;
  readonly children: Map<string, Folder>;
}

const group = (arms: readonly string[]): string => (arms.length === 1 ? (arms[0] ?? "") : `(?:${arms.join("|")})`);

// Siblings that continue the same way share one tail: `(?:a|b)/index\.ts` for `a/index.ts` and `b/index.ts`.
function branch(folder: Folder): string {
  const byTail = new Map<string, string[]>();
  for (const [segment, child] of folder.children) {
    const below = child.children.size === 0 ? "" : `/${branch(child)}`;
    const tail = below !== "" && child.file ? `(?:${below})?` : below;
    byTail.set(tail, [...(byTail.get(tail) ?? []), literal(segment)]);
  }
  return group([...byTail].map(([tail, segments]) => `${group(segments)}${tail}`));
}

/** The pattern that matches exactly the given `/`-separated paths and nothing else. */
export function exactPathPattern(paths: readonly string[]): string {
  const root: Folder = { file: false, children: new Map() };
  for (const path of paths) {
    let folder = root;
    for (const segment of path.split("/")) {
      const next: Folder = folder.children.get(segment) ?? { file: false, children: new Map() };
      folder.children.set(segment, next);
      folder = next;
    }
    folder.file = true;
  }
  // No path: the empty alternation, which matches only the empty string, as a joined empty list did.
  return `^${root.children.size === 0 ? "(?:)" : branch(root)}$`;
}
