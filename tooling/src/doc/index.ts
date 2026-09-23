// doc's programmatic front door (`pnpm doc`) — the docs system's one writer of structure: numbering,
// status, supersession, work-item transitions, archiving, link rewrites and the generated indexes. The
// rules it enforces are exported for `pnpm check:agents` (`agent-sync` runs `docLayerProblems`).
export type {
  Blocker,
  DescribedDoc,
  DocCommand,
  DocTree,
  DriftFacts,
  GovernedDoc,
  ItemKind,
  ItemPatch,
  ItemSectionFlag,
  ItemState,
  NewDocInput,
  NewItemInput,
  SectionContent,
  WorkItem,
} from "./contract/types.ts";
export { ADR_SECTION_FLAGS, ITEM_SECTION_FLAGS, PLAN_SECTION_FLAGS } from "./contract/types.ts";
export { closesTrailer, driftLines, wakeConditions } from "./lib/drift.ts";
export type { DueDoc } from "./lib/due.ts";
export { changesFromLog, describedDoc, dueDocs, earliestUpdated } from "./lib/due.ts";
export { renderFrontmatter, sectionsOf, splitDocument, titleOf, withFields } from "./lib/frontmatter-write.ts";
export { allItems, expectedGeneratedFiles } from "./lib/generated.ts";
export { isGeneratedPath, planSlugOf, renderAdrIndex, renderPlanIndex, renderTasks, renderWorkIndex } from "./lib/indexes.ts";
export { applyPatch, itemShapeProblems, parseBlocker, parseItem, parseItemBatch } from "./lib/items.ts";
export { numberedName, padId, parseNumberedName, slugify } from "./lib/names.ts";
export { parseDocCommand, USAGE } from "./lib/parse.ts";
export { docProblems, KIND_RULES, LEGACY_ROOTS, nextFreeRulingId } from "./lib/rules.ts";
export { adrTemplate, itemTemplate, planTemplate } from "./lib/templates.ts";
export { archive } from "./ops/archive.ts";
export { drift, driftFacts, overview } from "./ops/board.ts";
export { docFileCount, docLayerProblems, pendingDocProblems } from "./ops/check.ts";
export { regenerateIndexes } from "./ops/indexes.ts";
export type { WriteOutcome } from "./ops/items.ts";
export { landItems, landMerged, loadItems, newItem, newItems, newItemsFrom, setItems } from "./ops/items.ts";
export { newAdr, newPlan, nextAdrId } from "./ops/new.ts";
export { due, review } from "./ops/review.ts";
export { runDocCommand } from "./ops/run.ts";
export { setStatus } from "./ops/status.ts";
export { governedPaths, readDocTree } from "./ops/tree.ts";
