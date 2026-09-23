// The catalog's closed vocabularies, tree coordinates, and grammars — one home, so a new frontmatter
// kind or authority class is a single reviewed edit (Documentation-Law: the authored schema grows only
// through this validation with a ledgered reason).

export const SCHEMA_VERSION = 2;
export const CATALOG_DIR = "docs/catalog";
export const LANES_PATH = `${CATALOG_DIR}/lanes.json`;
export const STATE_PATH = `${CATALOG_DIR}/state.json`;
export const OUTPUT_PATH = `${CATALOG_DIR}/catalog.json`;
export const RECEIPTS_DIR = `${CATALOG_DIR}/receipts`;
export const CORE_PATH_REGISTRY_PATH = "docs/architecture/core/Core-Path-Registry.md";

export const FRONTMATTER_FENCE_LENGTH = 4;
export const FRONTMATTER_LINE_OFFSET = 2;

export const FRONTMATTER_FIELD_RE = /^([a-z][a-z-]*):\s*(.*?)\s*$/u;
export const INDENTED_YAML_RE = /^\s+/u;
export const QUOTED_SCALAR_RE = /^(["'])(.*)\1$/u;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/** The document kinds the `doc` tool owns (`docs/plans/doc-system/design.md`): one decision per `adr`,
 *  one program per `plan`, and the four work-item kinds under `docs/work/`. They live here because this
 *  module is the one home of the frontmatter vocabulary, but they are NOT members of `VALID_KINDS`,
 *  `VALID_STATUSES` or `ALLOWED_FRONTMATTER_KEYS`: those sets are the LEGACY catalog's, and a legacy doc
 *  carrying `kind: bug` or `status: doing` stays invalid there. The governed trees' vocabulary is
 *  `tooling/src/doc/lib/rules.ts#KIND_RULES`. */
export const ADR_KIND = "adr";
export const PLAN_KIND = "plan";
export const ITEM_KINDS = ["bug", "work", "decision", "tooling"] as const;
/** The four work-item states. Any transition is legal; the `doc` tool validates only the final shape. */
export const ITEM_STATES = ["open", "doing", "blocked", "done"] as const;
export const VALID_KINDS = new Set([
  "artifact",
  "design",
  "handoff",
  "history",
  "index",
  "law",
  "program",
  "reference",
  "research",
  "review",
  "runbook",
  "spec",
  "vendor",
]);
export const VALID_STATUSES = new Set(["active", "archived", "complete", "draft", "parked", "snapshot", "superseded"]);
/** The human classification per document. `dangling-refs` reads `normative`/`current-reference`/
 *  `operational` as law and `design` as design; `unclassified` is what `--sync` adopts a new document as. */
export const VALID_AUTHORITIES = new Set([
  "current-reference",
  "design",
  "generated",
  "historical",
  "normative",
  "operational",
  "review",
  "unclassified",
  "vendor",
]);

/** The D-numbers reserved by the ledger's own renumbering window. The `doc` tool refuses an ADR inside it
 *  from here, so the window outlives the registry's note. */
export const FIRST_RESERVED_RULING = 79;
export const LAST_RESERVED_RULING = 105;

export const LEDGER_ENTRY_HEADING_RE = /^## D([1-9]\d*)(?:\s|\(|$)/u;
export const LEDGER_ENTRY_BOLD_RE = /^- \*\*D([1-9]\d*)\b/u;

export const REQUIRED_FRONTMATTER_KEYS = ["kind", "status", "updated"];
export const ALLOWED_FRONTMATTER_KEYS = new Set([...REQUIRED_FRONTMATTER_KEYS, "supersedes"]);

export const VENDOR_PREFIX = "docs/vendor/";
/** The trees the `doc` tool governs, checked by `pnpm check:agents` and OUTSIDE this catalog's corpus
 *  (`ops/tree.ts#trackedDocs`): a document there needs no lane row and no inventory row. The formatter
 *  still owns them (`ops/format.ts`). One home for the four paths. */
export const DOC_TOOL_TREES = { adr: "docs/adr/", plans: "docs/plans/", work: "docs/work/", law: "docs/law/" } as const;
export const DOC_TOOL_TREE_PREFIXES: readonly string[] = Object.values(DOC_TOOL_TREES);
