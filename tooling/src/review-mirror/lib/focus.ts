// The semantic residue E5/E6 cannot honestly turn into a generic AST rule. This named inventory is review
// scope, not a verdict: every row resolves to a live symbol and therefore cannot silently rot into folklore.
import type { Project } from "ts-morph";
import type { ResolvedReviewFocus, ReviewFocus } from "../contract/types.ts";

export const REVIEW_FOCUS: readonly ReviewFocus[] = [
  {
    id: "E5-persona-last-delete",
    family: "E5",
    title: "persona last-delete convergence",
    path: "packages/server/src/domain/persona/verbs/remove.ts",
    symbol: "createRemove",
    why: "prove concurrent deletes cannot remove the owner's final persona",
  },
  {
    id: "E5-preset-fork-convergence",
    family: "E5",
    title: "preset copy-on-write fork convergence",
    path: "packages/server/src/domain/preset/verbs/update.ts",
    symbol: "createUpdate",
    why: "prove concurrent updates converge on one owned fork",
  },
  {
    id: "E5-refinery-name-uniqueness",
    family: "E5",
    title: "refinery schema-name uniqueness",
    path: "packages/server/src/domain/refinery/persistence/queries.ts",
    symbol: "insertOwnedSchemaIfNameFree",
    why: "prove case-folded owner/name uniqueness survives concurrent creates",
  },
  {
    id: "E5-world-primary-convergence",
    family: "E5",
    title: "world-info primary-book convergence",
    path: "packages/server/src/domain/world-info/persistence/import-write.ts",
    symbol: "createAttachOwnedBooksByName",
    why: "prove import attachment leaves at most one primary book per character",
  },
  {
    id: "E5-tag-prune-recheck",
    family: "E5",
    title: "tag prune usage recheck",
    path: "packages/server/src/domain/tag/persistence/queries.ts",
    symbol: "pruneZeroUsageTags",
    why: "prove an attachment appearing during prune prevents deletion",
  },
  {
    id: "E6-digest-speaker-atomicity",
    family: "E6",
    title: "digest and speaker replacement atomicity",
    path: "packages/server/src/domain/embeddings/verbs/store.ts",
    symbol: "createStore",
    why: "prove a retry cannot accept a new digest hash beside stale speaker joins",
  },
  {
    id: "E6-stats-rebuild-delta",
    family: "E6",
    title: "stats rebuild versus delta serialization",
    path: "packages/server/src/domain/stats/write/rebuild-from-canon.ts",
    symbol: "reconcileStats",
    why: "prove a delta committing during rebuild is not clobbered by replacement",
  },
  {
    id: "E6-wal-backup",
    family: "E6",
    title: "WAL-complete database backup",
    path: "packages/db/src/client/index.ts",
    symbol: "backupBeforeMigrate",
    why: "prove a recent WAL-resident commit is present in the backup",
  },
];

export function resolveReviewFocus(project: Project, root: string): readonly ResolvedReviewFocus[] {
  return REVIEW_FOCUS.map((focus) => {
    const source = project.getSourceFile(`${root}/${focus.path}`);
    if (source === undefined) {
      throw new Error(`review focus disappeared: ${focus.path}`);
    }
    const declaration = source.getFunction(focus.symbol);
    if (declaration === undefined) {
      throw new Error(`review focus symbol disappeared: ${focus.path}::${focus.symbol}`);
    }
    return { ...focus, line: declaration.getStartLineNumber() };
  });
}
