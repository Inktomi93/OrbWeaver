/** The sniff outcome: the importer to route to + the staging-path prefix that normalizes the tree, or a
 *  typed reject carrying the top-level names found (so the caller can tell the user what it saw). The importer consumes the classification before any staging write. */
export type TreeLayout =
  | { readonly kind: "st"; readonly stagePrefix: string }
  | { readonly kind: "orb"; readonly stagePrefix: string }
  | { readonly kind: "reject"; readonly found: readonly string[] };

export interface TreeChild {
  readonly files: Set<string>;
  readonly dirs: Set<string>;
}

/** The top-level shape derived from a set of relative paths, plus a one-level-down child index used only to
 *  recognize a multi-profile ST root (a parent dir whose subdirs are each an ST profile). */
export interface TreeShape {
  readonly topFiles: Set<string>;
  readonly topDirs: Set<string>;
  /** For each top-level dir: the names of its immediate child files + child dirs (for multi-profile detection). */
  readonly childrenByDir: Map<string, TreeChild>;
}
