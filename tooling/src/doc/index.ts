// doc's programmatic front door (`pnpm doc`) — the docs system's one writer of structure: numbering,
// status, supersession, work-item transitions, archiving, link rewrites and the generated indexes. The
// rules it enforces are exported for `pnpm check:agents` (`agent-sync` runs `docLayerProblems`).
export type {
  Blocker,
  DescribedDoc,
  DocCommand,
  DocEdit,
  DocTree,
  DriftFacts,
  Frontmatter,
  GovernedDoc,
  ItemKind,
  ItemPatch,
  ItemSectionFlag,
  ItemState,
  NewDocInput,
  NewItemInput,
  PlanState,
  SectionContent,
  WorkItem,
} from "./contract/types.ts";
export { ADR_SECTION_FLAGS, ITEM_SECTION_FLAGS, PLAN_SECTION_FLAGS } from "./contract/types.ts";
export {
  ADR_KIND,
  DATE_RE,
  DOC_TOOL_TREE_PREFIXES,
  DOC_TOOL_TREES,
  FIRST_RESERVED_RULING,
  ITEM_KINDS,
  ITEM_STATES,
  LAST_RESERVED_RULING,
  PLAN_KIND,
} from "./contract/vocab.ts";
export { closesTrailer, driftLines, planWakeConditions, wakeConditions } from "./lib/drift.ts";
export type { DueDoc } from "./lib/due.ts";
export { changesFromLog, describedDoc, dueDocs, earliestUpdated } from "./lib/due.ts";
export { parseFrontmatter } from "./lib/frontmatter.ts";
export { renderFrontmatter, sectionsOf, splitDocument, titleOf, withFields } from "./lib/frontmatter-write.ts";
export { allItems, expectedGeneratedFiles } from "./lib/generated.ts";
export { isGeneratedPath, planSlugOf, renderAdrIndex, renderPlanIndex, renderTasks, renderWorkIndex } from "./lib/indexes.ts";
export type { LandingRecord } from "./lib/items.ts";
export { applyPatch, itemShapeProblems, landingMessage, parseBlocker, parseItem, parseItemBatch } from "./lib/items.ts";
export { numberedName, padId, parseNumberedName, slugify } from "./lib/names.ts";
export { parseDocCommand, USAGE } from "./lib/parse.ts";
export { docProblems, KIND_RULES, nextFreeRulingId, PARKED } from "./lib/rules.ts";
export { adrTemplate, itemTemplate, lawTemplate, planTemplate } from "./lib/templates.ts";
export { drift, driftFacts, loadPlans, overview } from "./ops/board.ts";
export { docFileCount, docLayerProblems, introducedDocProblems, pendingDocProblems } from "./ops/check.ts";
export type { FormatOutcome, FormatRefusal } from "./ops/format.ts";
export { formatDocs, formatMarkdown, formatTargets } from "./ops/format.ts";
export { regenerateIndexes } from "./ops/indexes.ts";
export type { WriteOutcome } from "./ops/items.ts";
export { loadItems, newItem, newItems, newItemsFrom, setItems } from "./ops/items.ts";
export { landItems, landMerged } from "./ops/land.ts";
export { newAdr, newLaw, newPlan, nextAdrId } from "./ops/new.ts";
export { removeDocs, textCiters } from "./ops/remove.ts";
export { due, review } from "./ops/review.ts";
export { runDocCommand } from "./ops/run.ts";
export { setStatus } from "./ops/status.ts";
export { governedPaths, readDocTree } from "./ops/tree.ts";
