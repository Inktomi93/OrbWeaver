// Ledger-specific Markdown admission. The generic line reader deliberately does not model Markdown
// containment, but the refutation ledger is executable evidence: only a rendered, top-level GFM table can
// contribute rows, and a row-shaped paragraph inside its fence is an unreadable ledger rather than prose.

import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { MarkdownTable } from "./markdown-tables.ts";
import { markdownTables } from "./markdown-tables.ts";

export interface LedgerLineSpan {
  /** 1-based line of the opening heading; excluded. */
  readonly start: number;
  /** 1-based line of the closing heading, or one past EOF; excluded. */
  readonly end: number;
}

export interface LocatedLedgerTable {
  readonly table: MarkdownTable;
  readonly startLine: number;
  readonly endLine: number;
}

interface LocatedLedgerHeading {
  readonly depth: number;
  readonly text: string;
  readonly line: number;
}

export interface LedgerMarkdown {
  readonly source: string;
  readonly lineCount: number;
  readonly headings: readonly LocatedLedgerHeading[];
  readonly tables: readonly LocatedLedgerTable[];
  readonly rowParagraphs: readonly { readonly line: number; readonly text: string }[];
}

const parser = remark().use(remarkGfm, { singleTilde: false });
const TABLE_LIKE_START = /^(?:\\?\|)/u;
const TABLE_LIKE_END = /(?<!\\)\|\s*$/u;
const MINIMUM_ROW_DELIMITERS = 3;
type RootChild = ReturnType<typeof parser.parse>["children"][number];

function looksLikeTableRow(line: string): boolean {
  if (!(TABLE_LIKE_START.test(line) && TABLE_LIKE_END.test(line))) {
    return false;
  }
  const unescaped = line.match(/(?<!\\)\|/gu)?.length ?? 0;
  const escapedLeading = line.startsWith("\\|") ? 1 : 0;
  return unescaped + escapedLeading >= MINIMUM_ROW_DELIMITERS;
}

function locatedTable(node: RootChild, lines: readonly string[], source: string): LocatedLedgerTable | undefined {
  const position = node.position;
  if (node.type !== "table" || position === undefined) {
    return;
  }
  const decoded = markdownTables(lines.slice(position.start.line - 1, position.end.line), position.start.line);
  const table = decoded[0];
  // GFM can absorb rows the line decoder does not support; one returned table can still be a truncated prefix.
  if (decoded.length !== 1 || table === undefined || table.rows.length !== node.children.length - 1) {
    throw new Error(
      `ledger-admission: ${source}:${String(position.start.line)} is a top-level GFM table whose authored spelling the ledger cell reader cannot preserve. Use the column-1 \`| header |\` plus alignment-row form.`,
    );
  }
  return { table, startLine: position.start.line, endLine: position.end.line };
}

function paragraphRows(node: RootChild, lines: readonly string[]): readonly { readonly line: number; readonly text: string }[] {
  const position = node.position;
  if (node.type !== "paragraph" || position === undefined) {
    return [];
  }
  return lines
    .slice(position.start.line - 1, position.end.line)
    .map((text, index) => ({ line: position.start.line + index, text }))
    .filter(({ text }) => looksLikeTableRow(text));
}

/** Actual top-level GFM tables plus row-shaped top-level paragraphs, with authored source positions. */
export function readLedgerMarkdown(text: string, source = "refutation ledger"): LedgerMarkdown {
  const lines = text.split("\n");
  const tree = parser.parse(text);
  const tables: LocatedLedgerTable[] = [];
  const headings: LocatedLedgerHeading[] = [];
  const rowParagraphs: { line: number; text: string }[] = [];
  for (const node of tree.children) {
    const position = node.position;
    if (position === undefined) {
      continue;
    }
    if (node.type === "heading") {
      headings.push({ depth: node.depth, text: lines[position.start.line - 1]?.replace(/^#{1,6}\s+/u, "").trim() ?? "", line: position.start.line });
      continue;
    }
    const table = locatedTable(node, lines, source);
    if (table !== undefined) {
      tables.push(table);
    } else {
      rowParagraphs.push(...paragraphRows(node, lines));
    }
  }
  return { source, lineCount: lines.length, headings, tables, rowParagraphs };
}

/** One direct-root h2 section, closed by the next direct-root h2. */
export function ledgerHeadingSpan(markdown: LedgerMarkdown, heading: string): LedgerLineSpan | undefined {
  const at = markdown.headings.findIndex(({ depth, text }) => depth === 2 && text === heading);
  if (at < 0) {
    return;
  }
  const start = markdown.headings[at]?.line;
  if (start === undefined) {
    return;
  }
  const next = markdown.headings.slice(at + 1).find(({ depth }) => depth === 2);
  return { start, end: next?.line ?? markdown.lineCount + 1 };
}

/** Refuse unreadable row-shaped paragraphs, then return actual tables wholly inside the ledger fence. */
export function admitLedgerTables(markdown: LedgerMarkdown, span: LedgerLineSpan): readonly LocatedLedgerTable[] {
  const orphan = markdown.rowParagraphs.find(({ line }) => line > span.start && line < span.end);
  if (orphan !== undefined) {
    throw new Error(
      `ledger-admission: ${markdown.source}:${String(orphan.line)} table-like row is a Markdown paragraph, so ledger readers would silently omit it. Restore its GFM header/alignment rule or fence it as an example: ${JSON.stringify(orphan.text)}`,
    );
  }
  return markdown.tables.filter(({ startLine, endLine }) => startLine > span.start && endLine < span.end);
}
