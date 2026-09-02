// The `--lighthouse` arm's PURE half: the flag vocabulary, the LHR readers, the truncation predicate and
// the accounting lines. No browser, no Lighthouse runtime, no filesystem — so every judgement the arm
// prints is provable from a hand-built report in a unit test (ops/lighthouse.ts owns the impure half).
//
// THE LHR IS READ AS `unknown`, NEVER CAST. Lighthouse's own `details` type is a wide formatted union
// whose arms are told apart by key presence, and the node rows we want (`items[].node.selector`) live
// under three different detail types. A cast would let a shape change land as fabricated selectors on a
// real finding; the structural readers below simply see nothing, and the node COUNT they report is the
// count they actually read.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { LighthouseCategoryScore, LighthouseDevice, LighthouseFailedAudit, LighthouseMode, LighthouseReceipt } from "../contract/lighthouse.ts";
import { LIGHTHOUSE_CATEGORIES, LIGHTHOUSE_DEVICES, LIGHTHOUSE_MODES } from "../contract/lighthouse.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** How many of a failing audit's blamed nodes the accounting block names. Three is what a reader needs to
 *  reach the defect (`--shot-of`, `--map`); the whole list is in the JSON artifact. */
const SELECTOR_SAMPLE = 3;
/** An HTML report shorter than this is a truncated write, not a report — Lighthouse's own renderer emits
 *  ~270KB for a three-category run, and the smallest legitimate shell is still tens of KB. */
const MIN_HTML_REPORT_BYTES = 10_000;
/** Score display modes whose `score` is documented as meaningless — never counted as audited or failed. */
const UNSCORED_DISPLAY_MODES = new Set(["informative", "manual", "notApplicable", "error"]);
/** Lighthouse scores are 0..1; the report and every reviewer speak in percent. */
const PERCENT_SCALE = 100;

export const LIGHTHOUSE_DEVICE_SPELLINGS: readonly string[] = LIGHTHOUSE_DEVICES;
export const LIGHTHOUSE_MODE_SPELLINGS: readonly string[] = LIGHTHOUSE_MODES;

export function parseLighthouseDevice(raw: string): LighthouseDevice | null {
  return LIGHTHOUSE_DEVICES.find((device) => device === raw) ?? null;
}

export function parseLighthouseMode(raw: string): LighthouseMode | null {
  return LIGHTHOUSE_MODES.find((mode) => mode === raw) ?? null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function scoreOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Every `{ node: { selector } }` row an audit's details blamed, plus how many rows there were. Reads the
 *  two shapes Lighthouse actually emits for a11y findings: a top-level `items` array, and a `list` whose
 *  own items each carry a table. */
export function auditNodes(details: unknown): { readonly count: number; readonly selectors: readonly string[] } {
  const items = record(details)?.["items"];
  if (!Array.isArray(items)) {
    return { count: 0, selectors: [] };
  }
  const selectors: string[] = [];
  let count = 0;
  for (const item of items) {
    const row = record(item);
    const nested = row === null ? null : record(row["value"])?.["items"];
    if (Array.isArray(nested)) {
      const inner = auditNodes(record(row?.["value"]));
      count += inner.count;
      selectors.push(...inner.selectors);
      continue;
    }
    count += 1;
    const selector = record(row?.["node"])?.["selector"];
    if (typeof selector === "string" && selector !== "") {
      selectors.push(selector);
    }
  }
  return { count, selectors: selectors.slice(0, SELECTOR_SAMPLE) };
}

function auditRows(lhr: unknown): readonly Record<string, unknown>[] {
  const audits = record(record(lhr)?.["audits"]);
  return audits === null ? [] : Object.values(audits).flatMap((audit) => (record(audit) === null ? [] : [record(audit) as Record<string, unknown>]));
}

function isScored(audit: Record<string, unknown>): boolean {
  return scoreOf(audit["score"]) !== null && !UNSCORED_DISPLAY_MODES.has(text(audit["scoreDisplayMode"], "error"));
}

/** The DENOMINATOR: audits that produced a real pass/fail. A zero here is an instrument error at the call
 *  site, never a clean sheet — the report described a page nothing was judged on. */
export function auditedCount(lhr: unknown): number {
  return auditRows(lhr).filter(isScored).length;
}

export function failedAudits(lhr: unknown): readonly LighthouseFailedAudit[] {
  return auditRows(lhr)
    .filter((audit) => isScored(audit) && (scoreOf(audit["score"]) ?? 1) < 1)
    .map((audit): LighthouseFailedAudit => {
      const nodes = auditNodes(audit["details"]);
      return {
        id: text(audit["id"], "(unnamed audit)"),
        title: text(audit["title"], ""),
        score: scoreOf(audit["score"]) ?? 0,
        scoreDisplayMode: text(audit["scoreDisplayMode"], "binary"),
        nodeCount: nodes.count,
        selectors: nodes.selectors,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function categoryScores(lhr: unknown): readonly LighthouseCategoryScore[] {
  const categories = record(record(lhr)?.["categories"]);
  if (categories === null) {
    return [];
  }
  return Object.entries(categories).map(([id, value]) => ({
    id,
    title: text(record(value)?.["title"], id),
    score: scoreOf(record(value)?.["score"]),
  }));
}

/** Why this report is not a verdict, or null when it is whole. Three ways a Lighthouse run comes back
 *  looking like a result and is not one: a fatal `runtimeError`, a category we asked for that never
 *  landed, and an HTML render that stopped short. */
export function reportTruncation(lhr: unknown, html: string): string | null {
  const runtimeError = record(record(lhr)?.["runtimeError"]);
  if (runtimeError !== null) {
    return `Lighthouse reported a runtime error: ${text(runtimeError["code"], "unknown")} — ${text(runtimeError["message"], "no message")}`;
  }
  const present = new Set(categoryScores(lhr).map((category) => category.id));
  const missing = LIGHTHOUSE_CATEGORIES.filter((category) => !present.has(category));
  if (missing.length > 0) {
    return `the report is missing the requested categor${missing.length === 1 ? "y" : "ies"} ${missing.join(", ")}`;
  }
  return html.length < MIN_HTML_REPORT_BYTES
    ? `the HTML report is ${html.length} bytes, below the ${MIN_HTML_REPORT_BYTES}-byte floor for a complete render`
    : null;
}

function scoreLabel(score: number | null): string {
  return score === null ? "n/a" : String(Math.round(score * PERCENT_SCALE));
}

/** The accounting block, exactly as the operator reads it. One line per category, one per failing audit
 *  with its node count and first three selectors, and the header carrying the audited denominator. */
export function lighthouseLines(receipt: LighthouseReceipt): readonly string[] {
  const scores = receipt.categories.map((category) => `${category.id}=${scoreLabel(category.score)}`).join(" ");
  const lines = [
    `\n--- LIGHTHOUSE (${receipt.device}, ${receipt.mode}, v${receipt.lighthouseVersion}) ---`,
    `  url          ${receipt.url}`,
    `  scores       ${scores === "" ? "(none)" : scores}`,
    `  accounting   audited=${receipt.auditedCount} failed-audits=${receipt.failed.length}`,
  ];
  for (const audit of receipt.failed) {
    lines.push(`  FAIL ${audit.id}  score=${audit.score} nodes=${audit.nodeCount}  ${audit.title}`);
    for (const selector of audit.selectors) {
      lines.push(`       → ${selector}`);
    }
    if (audit.nodeCount > audit.selectors.length) {
      lines.push(`       … +${audit.nodeCount - audit.selectors.length} more node(s) — the complete list is in ${receipt.jsonPath}`);
    }
  }
  lines.push(`  report       ${receipt.jsonPath}`);
  lines.push(`  report       ${receipt.htmlPath}`);
  return lines;
}
