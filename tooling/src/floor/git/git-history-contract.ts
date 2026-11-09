/** Filename history requests keep all-ref allocation separate from a founded ancestry boundary; `head`
 *  reads only what HEAD's ancestry holds. */
export type GitPathHistoryRequest =
  | { readonly kind: "all-refs"; readonly path: string }
  | { readonly kind: "head"; readonly path: string }
  | { readonly kind: "founded"; readonly path: string; readonly foundation: string };

/** The paths one commit added and deleted, so a caller can tell a rename (both in one commit) from a reuse. */
export interface GitPathChangeSet {
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

export interface GitPathHistory {
  readonly head: string | null;
  readonly foundation: string | null;
  readonly initialPaths: readonly string[];
  readonly addedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly changeSets: readonly GitPathChangeSet[];
}

export type GitPathHistoryResult =
  | { readonly status: "ready"; readonly value: GitPathHistory }
  | { readonly status: "missing" | "unresolved"; readonly reason: string };
