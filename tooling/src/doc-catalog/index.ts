// doc-catalog's programmatic front door — the legacy docs inventory (one lane and one authority row per
// tracked document under the legacy tree, frontmatter validated, no content hash) and the one markdown
// formatter. Fronts `pnpm doc-catalog:*`, `check:doc-catalog`, `format:docs`, `check:docs`. The trees
// the `doc` tool governs are outside its corpus.
export type {
  ArtifactForm,
  CatalogDocumentRow,
  CatalogMode,
  DebtPaths,
  Doc,
  FormatMode,
  Frontmatter,
  Lane,
  LaneConfig,
  Receipt,
  ReceiptEntry,
  State,
} from "./contract/types.ts";
export { CATALOG_MODES, FORMAT_MODES } from "./contract/types.ts";
export { debtPathErrors, migrationDebt, migrationMetrics } from "./lib/debt.ts";
export { countLines, frontmatterErrors, parseFrontmatter } from "./lib/frontmatter.ts";
export {
  ADR_KIND,
  DATE_RE,
  DOC_TOOL_KEYS,
  DOC_TOOL_TREE_PREFIXES,
  DOC_TOOL_TREES,
  FIRST_RESERVED_RULING,
  ITEM_KINDS,
  ITEM_STATES,
  LAST_RESERVED_RULING,
  PLAN_KIND,
} from "./lib/vocab.ts";
export { authoredArtifacts, expectedCatalog, offCanonicalPaths, unformattedArtifacts } from "./ops/catalog.ts";
export type { FormatOutcome, FormatRefusal } from "./ops/format.ts";
export { formatDocs, formatMarkdown, formatTargets } from "./ops/format.ts";
export { runCatalog, runFormat } from "./ops/run.ts";
export { documents, laneAssignments, loadReceipts, stableRulingAnchors } from "./ops/tree.ts";
export { validate, validateReceiptEntry } from "./ops/validate.ts";
