// The frontmatter WRITER — the read half is `./frontmatter.ts#parseFrontmatter`.
// Every structural edit the tool makes to a document is a whole-block rewrite here: split the file into
// its block and its body, patch the fields, render the block in one canonical key order. Prose is never
// touched, which is the whole contract ("agents write prose; the tool writes structure").
import { parseFrontmatter } from "./frontmatter.ts";

const FENCE = "---";
/** Canonical key order. Keys the order does not name follow, sorted. */
const KEY_ORDER: readonly string[] = [
  "kind",
  "status",
  "updated",
  "rank",
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
      Reflect.deleteProperty(next, key);
    } else {
      next[key] = value;
    }
  }
  return `${renderFrontmatter(next)}\n${body.replace(/^\n+/u, "")}`;
}

/** The document with its first `# ` heading replaced; a body with no heading is returned as given. */
export function withTitle(source: string, title: string): string {
  const { body } = splitDocument(source);
  if (!HEADING_RE.test(body)) {
    return source;
  }
  return `${source.slice(0, source.length - body.length)}${body.replace(HEADING_RE, () => `# ${title}`)}`;
}

/** The first `# ` heading of a body, or null. */
export function titleOf(body: string): string | null {
  return HEADING_RE.exec(body)?.[1] ?? null;
}

/** One ATX heading outside a code fence: its line index, level (1 to 6) and text. */
interface Heading {
  readonly line: number;
  readonly level: number;
  readonly text: string;
}

const FENCE_LINE_RE = /^\s*(`{3,}|~{3,})(.*)$/u;
const HEADING_LINE_RE = /^(#{1,6}) (.+?)\s*$/u;

/** THE heading scanner: every ATX heading outside a code fence. A fence closes only on the same character,
 *  at least as long as its opener, with nothing after it, so a four-backtick block can hold three-backtick
 *  lines and a `## ` line. An unclosed fence swallows the rest of the text. */
function scanHeadings(lines: readonly string[]): readonly Heading[] {
  const found: Heading[] = [];
  let opener: string | null = null;
  for (const [index, line] of lines.entries()) {
    const [, marker = "", rest = ""] = FENCE_LINE_RE.exec(line) ?? [];
    if (opener !== null) {
      if (marker !== "" && marker.startsWith(opener.charAt(0)) && marker.length >= opener.length && rest.trim() === "") {
        opener = null;
      }
    } else if (marker !== "") {
      opener = marker;
    } else {
      const [, hashes = "", text = ""] = HEADING_LINE_RE.exec(line) ?? [];
      if (hashes !== "") {
        found.push({ line: index, level: hashes.length, text });
      }
    }
  }
  return found;
}

/** The H1 and H2 headings of a text, in order: the ones that would restructure an item if they landed in
 *  a section body. */
export function structuralHeadings(text: string): readonly string[] {
  return scanHeadings(text.split(/\r?\n/u))
    .filter((heading) => heading.level <= 2)
    .map((heading) => `${"#".repeat(heading.level)} ${heading.text}`);
}

/** The `## ` headings of a body, in order. */
export function sectionsOf(body: string): readonly string[] {
  return scanHeadings(body.split(/\r?\n/u))
    .filter((heading) => heading.level === 2)
    .map((heading) => heading.text);
}

/** The line range of one `## ` section: its heading line up to the next `## ` heading (or the end). Null
 *  when the lines have no such section. */
function sectionRange(lines: readonly string[], name: string): { readonly start: number; readonly end: number } | null {
  const sections = scanHeadings(lines).filter((heading) => heading.level === 2);
  const at = sections.findIndex((heading) => heading.text === name);
  const start = sections[at]?.line;
  return start === undefined ? null : { start, end: sections[at + 1]?.line ?? lines.length };
}

/** The text under one `## ` heading of a body, trimmed; empty when the section is absent. */
export function sectionText(body: string, name: string): string {
  const lines = body.split(/\r?\n/u);
  const range = sectionRange(lines, name);
  return range === null
    ? ""
    : lines
        .slice(range.start + 1, range.end)
        .join("\n")
        .trim();
}

/** The document with the body of one `## ` section replaced by `text`; its heading and the other sections
 *  are untouched here (the caller's format pass may still normalise a sibling that was not canonical).
 *  Null when the document has no such section. */
export function withSectionText(source: string, name: string, text: string): string | null {
  const lines = source.split("\n");
  const range = sectionRange(lines, name);
  if (range === null) {
    return null;
  }
  return [...lines.slice(0, range.start + 1), "", ...text.trim().split("\n"), "", ...lines.slice(range.end)].join("\n");
}
