// doc-catalog's programmatic front door — the documentation control plane (D139): one catalog, one
// receipt per document, one markdown formatter. Fronts `pnpm doc-catalog:*`, `check:doc-catalog`,
// `format:docs`, `check:docs`.
export type {
  ArtifactForm,
  CatalogMode,
  DebtPaths,
  Doc,
  FormatMode,
  Frontmatter,
  Lane,
  LaneConfig,
  Receipt,
  ReceiptClaim,
  ReceiptEntry,
  ReceiptEvidence,
  ReceiptFacts,
  State,
} from "./contract/types.ts";
export { CATALOG_MODES, FORMAT_MODES } from "./contract/types.ts";
export { debtPathErrors, migrationDebt, migrationMetrics } from "./lib/debt.ts";
export { countLines, frontmatterErrors, parseFrontmatter } from "./lib/frontmatter.ts";
export { catalogReceipt, validateReceiptEntry } from "./lib/receipt-rules.ts";
export { authoredArtifacts, offCanonicalPaths, unformattedArtifacts } from "./ops/catalog.ts";
export type { FormatOutcome } from "./ops/format.ts";
export { formatDocs, formatTargets } from "./ops/format.ts";
export { runCatalog, runFormat } from "./ops/run.ts";
export { documents, laneAssignments, loadReceipts } from "./ops/tree.ts";
export { validate } from "./ops/validate.ts";
