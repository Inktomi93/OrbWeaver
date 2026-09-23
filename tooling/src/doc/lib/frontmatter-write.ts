// The frontmatter WRITER — the read half is the catalog's flat parser (`#doc-catalog` `parseFrontmatter`).
// Every structural edit the tool makes to a document is a whole-block rewrite here: split the file into
// its block and its body, patch the fields, render the block in one canonical key order. Prose is never
// touched, which is the whole contract ("agents write prose; the tool writes structure").
import { parseFrontmatter } from "#doc-catalog";

const FENCE = "---";
/** Canonical key order. Keys the order does not name follow, sorted. */
const KEY_ORDER: readonly string[] = [
  "kind",
  "status",
  "updated",
  "supersedes",
  "superseded-by",
  "priority",
  "area",
  "lane",
  "blocked",
  "plan",
  "evidence",
  "reviewed",
];
const HEADING_RE = /^# (.+?)\s*$/mu;

export interface SplitDocument {
  /** `null` when the file has no frontmatter block at all. */
  readonly fields: Readonly<Record<string, string>> | null;
  readonly body: string;
}

/** The block's fields and the bytes after it. A malformed block (no closing fence) reads as no block
 *  with the whole file as body, which the schema rules then report. */
export function splitDocument(source: string): SplitDocument {
  const parsed = parseFrontmatter(source);
  if (!parsed.present || parsed.malformed) {
    return { fields: null, body: source };
  }
  const close = source.indexOf(`\n${FENCE}\n`, FENCE.length + 1);
  return { fields: parsed.fields, body: source.slice(close + FENCE.length + 2) };
}

function rank(key: string): number {
  const index = KEY_ORDER.indexOf(key);
  return index === -1 ? KEY_ORDER.length : index;
}

export function renderFrontmatter(fields: Readonly<Record<string, string>>): string {
  const keys = Object.keys(fields).toSorted((left, right) => rank(left) - rank(right) || left.localeCompare(right));
  return `${FENCE}\n${keys.map((key) => `${key}: ${fields[key] ?? ""}`).join("\n")}\n${FENCE}\n`;
}

/** The document with `patch` applied to its block. A `null` value deletes the key. A file with no block
 *  gains one. The body's leading blank line is normalised so a rewrite never grows a gap. */
export function withFields(source: string, patch: Readonly<Record<string, string | null>>): string {
  const { fields, body } = splitDocument(source);
  const next: Record<string, string> = { ...(fields ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return `${renderFrontmatter(next)}\n${body.replace(/^\n+/u, "")}`;
}

/** The first `# ` heading of a body, or null. */
export function titleOf(body: string): string | null {
  return HEADING_RE.exec(body)?.[1] ?? null;
}

/** The `## ` headings of a body, in order. */
export function sectionsOf(body: string): readonly string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    const heading = inFence ? undefined : /^## (.+?)\s*$/u.exec(line)?.[1];
    if (heading !== undefined) {
      out.push(heading);
    }
  }
  return out;
}
