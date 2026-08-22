// The catalog's closed vocabularies, tree coordinates, and evidence grammars — one home, so a new
// frontmatter kind or evidence class is a single reviewed edit (Documentation-Law: the authored schema
// grows only through this validation with a ledgered reason).

export const SCHEMA_VERSION = 1;
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
export const SHA256_RE = /^[a-f0-9]{64}$/u;
export const COMMIT_RE = /^[a-f0-9]{40}$/u;

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
export const VALID_DISPOSITIONS = new Set([
  "archive",
  "current",
  "delete-candidate",
  "generated-artifact",
  "needs-owner",
  "pending",
  "repaired",
  "superseded",
  "vendor-snapshot",
]);
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
export const VALID_EVIDENCE_KINDS = new Set(["code", "test", "gate", "issue", "law", "ruling", "upstream", "provenance"]);
export const LOCAL_EVIDENCE_KINDS = new Set(["code", "test", "gate"]);

export const LOCAL_EVIDENCE_RE = /^([^:\n]+):(\d+)$/u;
export const LAW_EVIDENCE_RE = /^([^\s\n]+) §([1-9]\d*)$/u;
export const RULING_EVIDENCE_RE = /^D([1-9]\d*)$/u;
export const ISSUE_EVIDENCE_RE = /^#\d+$/u;
export const URL_EVIDENCE_RE = /^https:\/\/\S+$/u;
export const PROVENANCE_EVIDENCE_RE = /^git:([a-f0-9]{40})$/u;

/** The D-numbers reserved by the ledger's own renumbering window — citing one is a distinct error from
 *  citing a number that never existed. */
export const FIRST_RESERVED_RULING = 79;
export const LAST_RESERVED_RULING = 105;

export const LEDGER_ENTRY_HEADING_RE = /^## D([1-9]\d*)(?:\s|\(|$)/u;
export const LEDGER_ENTRY_BOLD_RE = /^- \*\*D([1-9]\d*)\b/u;
export const NUMERIC_HEADING_RE = /^#{1,6} ([1-9]\d*)\.\s/u;

export const TEXT_EVIDENCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".json",
  ".js",
  ".md",
  ".mjs",
  ".mts",
  ".svg",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
export const REQUIRED_FRONTMATTER_KEYS = ["kind", "status", "updated"];
export const ALLOWED_FRONTMATTER_KEYS = new Set([...REQUIRED_FRONTMATTER_KEYS, "supersedes"]);

export const VENDOR_PREFIX = "docs/vendor/";
