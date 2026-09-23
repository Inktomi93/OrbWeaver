// The legacy ledger reader for `pnpm doc migrate-ledger`: `Core-Path-Registry.md` holds each ruling in
// one of TWO shapes — a bullet row (`- **D<n> — title.** text`, with continuation lines) under a range
// heading, or a `## D<n> (…)` section whose first bullet restates the id. Both parse to one `Ruling`;
// the ADR file a ruling becomes keeps its number, so nothing that cites `D<n>` moves.
import type { RegistryParse, Ruling, RulingRange } from "../contract/types.ts";
import { adrTemplateFromRuling } from "./ledger-render.ts";
import { slugify } from "./names.ts";

const RANGE_HEADING_RE = /^## D(\d+)(?:[-–]D?\d+)?\b/u;
const SECTION_HEADING_RE = /^## D(\d+)\s*(?:\((.*)\))?\s*$/u;
const BULLET_RE = /^- \*\*D(\d+)\b\s*[—–-]?\s*(.*)$/u;
const RESERVED_RE = /\*\*RESERVED RANGE\s*[—-]\s*D(\d+)[–-]D(\d+)/u;
const BOLD_CLOSE = "**";

/** The two bullet shapes: `- **D<n>** — text` (a bare bold id; the title falls back to the id) and
 *  `- **D<n> — title.** text` (the bold run carries the title). The rest of the line is body. */
function splitBullet(id: number, rest: string): { readonly title: string; readonly text: string } {
  if (rest.startsWith(BOLD_CLOSE)) {
    return {
      title: `D${String(id)}`,
      text: rest
        .slice(BOLD_CLOSE.length)
        .replace(/^\s*[—–-]\s*/u, "")
        .trim(),
    };
  }
  const close = rest.indexOf(BOLD_CLOSE);
  if (close === -1) {
    return { title: rest.trim(), text: "" };
  }
  return {
    title: rest
      .slice(0, close)
      .replace(/[.\s]+$/u, "")
      .trim(),
    text: rest.slice(close + BOLD_CLOSE.length).trim(),
  };
}

function sectionTitle(id: number, heading: string | undefined, firstLine: string | undefined): string {
  const bullet = firstLine === undefined ? null : BULLET_RE.exec(firstLine);
  if (bullet !== null && Number(bullet[1]) === id) {
    return splitBullet(id, bullet[2] ?? "").title;
  }
  return (heading ?? `D${String(id)}`).trim();
}

interface Block {
  readonly heading: string;
  readonly lines: readonly string[];
}

function blocks(source: string): readonly Block[] {
  const out: Block[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  for (const line of source.split("\n")) {
    if (line.startsWith("## ")) {
      if (current !== null) {
        out.push(current);
      }
      current = { heading: line, lines: [] };
      continue;
    }
    if (current !== null) {
      current.lines.push(line);
    }
  }
  if (current !== null) {
    out.push(current);
  }
  return out;
}

/** Bullet rows inside a range block: a row is its anchor line plus every following line until the next
 *  anchor or a blank line that precedes one. */
function bulletRulings(lines: readonly string[]): readonly Ruling[] {
  const rulings: Ruling[] = [];
  let open: { id: number; title: string; text: string[] } | null = null;
  const close = (): void => {
    if (open !== null) {
      rulings.push({ id: open.id, title: open.title, body: open.text.join("\n").trim(), shape: "bullet" });
    }
  };
  for (const line of lines) {
    const anchor = BULLET_RE.exec(line);
    if (anchor !== null) {
      close();
      const { title, text } = splitBullet(Number(anchor[1]), anchor[2] ?? "");
      open = { id: Number(anchor[1]), title, text: text === "" ? [] : [text] };
      continue;
    }
    if (open !== null) {
      open.text.push(line);
    }
  }
  close();
  return rulings;
}

function sectionRuling(block: Block): Ruling {
  const match = SECTION_HEADING_RE.exec(block.heading) as RegExpExecArray;
  const id = Number(match[1]);
  const first = block.lines.find((line) => line.trim() !== "");
  const bullet = first === undefined ? null : BULLET_RE.exec(first);
  const rest =
    bullet !== null && Number(bullet[1]) === id
      ? [splitBullet(id, bullet[2] ?? "").text, ...block.lines.slice(block.lines.indexOf(first as string) + 1)]
      : block.lines;
  return { id, title: sectionTitle(id, match[2], first), body: rest.join("\n").trim(), shape: "section" };
}

export function reservedRange(source: string): RulingRange | null {
  const note = RESERVED_RE.exec(source);
  return note?.[1] === undefined || note[2] === undefined ? null : { lo: Number(note[1]), hi: Number(note[2]) };
}

/** Every ruling in the registry, in file order, plus the ids anchored more than once. */
export function parseRegistry(source: string): RegistryParse {
  const rulings: Ruling[] = [];
  for (const block of blocks(source)) {
    if (SECTION_HEADING_RE.test(block.heading)) {
      rulings.push(sectionRuling(block));
    } else if (RANGE_HEADING_RE.test(block.heading)) {
      rulings.push(...bulletRulings(block.lines));
    }
  }
  const seen = new Map<number, number>();
  for (const ruling of rulings) {
    seen.set(ruling.id, (seen.get(ruling.id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  return { rulings, duplicates, reserved: reservedRange(source) };
}

export function adrSlug(ruling: Ruling): string {
  const slug = slugify(ruling.title);
  return slug === "" ? `ruling-${String(ruling.id)}` : slug;
}

export function renderAdr(ruling: Ruling, today: string): string {
  return adrTemplateFromRuling(ruling, today);
}

/** What one line does to the skip state: a `## D<n>` heading opens a section whose fate is its id's; any
 *  other heading closes a skip; a bullet anchor opens a row whose fate is its id's; a blank line ends a
 *  skipped bullet row (a section skip runs until the next heading). `null` means "no change". */
function skipAfter(line: string, ids: ReadonlySet<number>, skipping: "section" | "row" | null): "section" | "row" | null {
  const section = SECTION_HEADING_RE.exec(line);
  if (section !== null) {
    return ids.has(Number(section[1])) ? "section" : null;
  }
  if (line.startsWith("## ")) {
    return null;
  }
  const bullet = BULLET_RE.exec(line);
  if (bullet !== null && skipping !== "section") {
    return ids.has(Number(bullet[1])) ? "row" : null;
  }
  if (skipping === "row" && line.trim() === "") {
    return null;
  }
  return skipping;
}

/** The registry with the named rulings removed as whole rows or whole sections. A range heading whose
 *  rows are all gone stays, empty, until the batch that empties the file deletes it. */
export function withoutRulings(source: string, ids: ReadonlySet<number>): string {
  const out: string[] = [];
  let skipping: "section" | "row" | null = null;
  for (const line of source.split("\n")) {
    const was = skipping;
    skipping = skipAfter(line, ids, skipping);
    // The blank line that ends a skipped row is dropped with the row, so no double gap survives.
    if (skipping === null && !(was === "row" && line.trim() === "")) {
      out.push(line);
    }
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trimEnd()}\n`;
}
