/** Filename history requests keep all-ref allocation separate from a founded ancestry boundary. */
export type GitPathHistoryRequest =
  | { readonly kind: "all-refs"; readonly path: string }
  | { readonly kind: "founded"; readonly path: string; readonly foundation: string };

export interface GitPathHistory {
  readonly head: string | null;
  readonly foundation: string | null;
  readonly initialPaths: readonly string[];
  readonly addedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
}

export type GitPathHistoryResult =
  | { readonly status: "ready"; readonly value: GitPathHistory }
  | { readonly status: "missing" | "unresolved"; readonly reason: string };
