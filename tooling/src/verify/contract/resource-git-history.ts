import type { GitPathHistory } from "../../floor/git/git-history-contract.ts";

/** Historical membership identities are pinned, not author-selectable revision expressions. */
export const GIT_PATH_HISTORY_DEFINITIONS = {
  "legacy-tests": { path: "tests/legacy", foundation: "06eb6d2eb9beab12115652f07056ab7fa58cee77" },
} as const;
export type GitPathHistoryResourceId = keyof typeof GIT_PATH_HISTORY_DEFINITIONS;

export interface GitPathHistoryResource {
  readonly history: GitPathHistory;
  /** Candidate-index membership stays visible even when an unstaged deletion hides the staged file. */
  readonly candidatePaths: readonly string[];
}
