// @orb/kit/content — the message-content tokenizer: splits a stored message body into ordered spans. ONE
// parser, two projections (D45-amend): the chat domain's SEND path projects spans → provider content-parts
// (the `{text}|{image,url}` wire shape, gated by `ModelCapability.input.vision`); the Phase-6 client RENDER
// path projects the SAME spans → `MessageContentBlock[]` (D44). Pure + deterministic — no markdown dep, no I/O.
//
// THE ENCODING (D45-amend + the parity-plus §3 span grammar): a message body is `string` (D26 one content
// home). Embedded structured spans:
//   • an image is `![alt](target)` where `target` is `asset:<assetId>` or `http(s)://…` (gated at resolve).
//   • a HIDDEN-class tag is a self-closing `<name key="value" …/>` whose name is in the OPEN `HIDDEN_TAGS`
//     registry (§3.2a — lie/ofilter are the first two REGISTRANTS; a third channel is a registry row).
//   • a DIRECTIVE FENCE is `:::name key="value"` on its own line … body … `:::` on its own line, for any
//     name in the OPEN `DIRECTIVE_FENCE_NAMES` registry (§3.2b — card/choices first; a new fence is a member
//     + a projection arm). Unknown attrs on a fence are IGNORED, never fatal (version-tolerant, graft #V4).
//   • a COMMAND-SHAPED but UNREGISTERED tag/fence (an attr-carrying `<gmnote …/>`, a `:::teleport` fence) is
//     an `unknown-directive` span — the §3.2.1 ALLOWLIST-STRIP class: hidden on the reading surface (model
//     noise, never rendered as raw garbage), kept VERBATIM on the wire (the transcript is honest). A
//     NON-command shape (a bare `<br/>`, a non-self-closing `<div class="x">`, a stray `:::`) stays literal.
//
// THE §3.2.1 ROBUSTNESS CONTRACT (the marinara-audit D1 adopt — model-output parsing, not happy-path):
//   1. QUOTE/ESCAPE-AWARE BALANCED WALKING — attr values are `"…"` with `\` escapes, so JSON-in-attributes
//      and a quoted `/>` or `:::` never false-close; a nested `:::name` open inside a fence body increments
//      depth so an inner directive line doesn't false-close the outer fence.
//   2. STREAM-TRUNCATION SURVIVAL — an unclosed tag/fence (mid-stream, aborted) falls through to literal
//      text IN PLACE; nothing is mangled, nothing throws. DEGRADE-NEVER-THROW on all persisted content (D51).
//   3. MARKDOWN-CODE-FENCE EXCLUSION — tags/fences inside a ``` code fence are the author SHOWING code and
//      stay literal (the §4.8 hard exclusion, applied to the whole new grammar; image refs keep their
//      original code-fence-blind behavior for byte-compatibility with stored bodies).
//
// The LENIENT-HTML arm (§4.8) is DETECTION-ONLY here (pure, opt-in via `lenientHtml` — default OFF, zero
// behavior change): a ≥3-line element-majority naked-HTML block, or a ```html/```svg fence whose body is
// element-majority, becomes an implicit `card` span with `origin:"lenient"` + a derived title. Its product
// wiring (the immersiveHtml gate, trust, teaching) is the P4 wave.

/** A parsed image target: an owned-CAS asset (by id) or an external URL. The chat domain resolves this to a
 *  model-fetchable URL via the injected `resolveImageUrl` op (asset→CAS URL/data-URI; external→gated). */
export type ContentImageRef = { readonly kind: "asset"; readonly assetId: string } | { readonly kind: "external"; readonly url: string };

/** How a card span was recognized: an explicit `:::card` fence, or the §4.8 lenient arm (naked HTML /
 *  html/svg code fence) — provenance for the reveal/debug surfaces; the wire stub is identical either way. */
export type CardSpanOrigin = "fence" | "lenient";

/** One ordered span of a tokenized message body (the §3 content-class grammar — `CONTENT_CLASS_POLICY` in
 *  `@orb/contracts/chat` declares each kind's reading-surface × wire planes; the two projection seams
 *  dispatch on `kind` totally). */
export type ContentSpan =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "image"; readonly ref: ContentImageRef; readonly alt: string }
  | { readonly kind: "hidden"; readonly tag: string; readonly attrs: Readonly<Record<string, string>>; readonly raw: string }
  | { readonly kind: "card"; readonly title: string | null; readonly body: string; readonly origin: CardSpanOrigin; readonly raw: string }
  | { readonly kind: "choices"; readonly options: readonly string[]; readonly raw: string }
  | { readonly kind: "unknown-directive"; readonly raw: string };

/** The span-kind axis the visibility registry (`CONTENT_CLASS_POLICY`) keys off — one member per content
 *  class. A NEW class = a tuple member + a policy row + (if distinct) a projection arm (graft #V1). */
export const CONTENT_SPAN_KINDS = ["text", "image", "hidden", "card", "choices", "unknown-directive"] as const;
export type ContentSpanKind = (typeof CONTENT_SPAN_KINDS)[number];

// ── The OPEN registries (§3.2 — P3/P4/P5 REGISTER rows; the mechanism never changes) ─────────────────────

/** One hidden-channel tag class (§3.2a): the tag name the tokenizer matches + the attrs the host-reveal
 *  surface displays (in order) + its reveal-section heading. */
export interface HiddenTagDef {
  readonly tag: string;
  readonly fields: readonly string[];
  readonly revealLabel: string;
}

/** The hidden-tag registry — lie/ofilter are the FIRST TWO REGISTRANTS (graft #V2: a third hidden channel
 *  is a row here + a teaching constant; zero tokenizer/filter/wire changes — they all read this registry).
 *  `<ofilter>`'s optional `who` attr is tokenized like any attr but IGNORED by the v1 uniform-hide filter
 *  (the per-player-perception doorway, graft #V7). */
export const HIDDEN_TAGS: readonly HiddenTagDef[] = [
  { tag: "lie", fields: ["character", "type", "truth", "reason"], revealLabel: "Deception" },
  { tag: "ofilter", fields: ["event", "reason"], revealLabel: "Unperceived" },
];

/** The directive-fence registry — card/choices are the FIRST TWO REGISTRANTS (graft #V3: a new fence is a
 *  member here + a `FENCE_BUILDERS` row + a render/wire projection arm; the fence recognizer is shared). */
export const DIRECTIVE_FENCE_NAMES = ["card", "choices"] as const;
export type DirectiveFenceName = (typeof DIRECTIVE_FENCE_NAMES)[number];

/** Tokenizer options. `lenientHtml` enables the §4.8 implicit-card detection (default OFF — the P4 wave
 *  wires the product gate; the DETECTOR ships with the grammar so the tokenizer stays ONE parser family). */
export interface TokenizeContentOptions {
  readonly lenientHtml?: boolean | undefined;
}

// ── Image refs (the original D51 grammar — unchanged) ────────────────────────────────────────────────────

// `![alt](target)` — `alt` excludes `]`, `target` excludes whitespace + `)` (both linear, no backtracking →
// ReDoS-safe). The title form `![a](u "t")` intentionally fails to match (the space) and falls through to text.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const ASSET_SCHEME = "asset:";

function parseTarget(target: string): ContentImageRef {
  if (target.startsWith(ASSET_SCHEME)) {
    return { kind: "asset", assetId: target.slice(ASSET_SCHEME.length) };
  }
  return { kind: "external", url: target };
}

/** The original image tokenization over one maximal text run (no empty-fallback — the caller owns that). */
function tokenizeImages(text: string): ContentSpan[] {
  const spans: ContentSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(IMAGE_RE)) {
    const idx = m.index;
    const full = m[0];
    const alt = m[1] ?? "";
    const target = m[2] ?? "";
    if (idx > last) {
      spans.push({ kind: "text", text: text.slice(last, idx) });
    }
    spans.push({ kind: "image", ref: parseTarget(target), alt });
    last = idx + full.length;
  }
  if (last < text.length) {
    spans.push({ kind: "text", text: text.slice(last) });
  }
  return spans;
}

// ── The §3.2.1 balance-aware walkers ─────────────────────────────────────────────────────────────────────

// Caps the tag walker so a stray `<name ` in a huge body never scans the whole document (linear + bounded).
const MAX_TAG_SCAN = 4096;
// The window a tag/attr identifier is matched inside (identifiers are short; the window bounds the regex).
const IDENT_WINDOW = 64;

const TAG_NAME_RE = /^<([A-Za-z][A-Za-z0-9_-]*)/;
const ATTR_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*/;

function skipSpaces(src: string, from: number, limit: number): number {
  let i = from;
  while (i < limit && (src[i] === " " || src[i] === "\t")) {
    i += 1;
  }
  return i;
}

/** Walk one `"…"` attr value from its opening quote (§3.2.1 #1): `\` escapes the next char, so a quoted
 *  `/>` / `:::` / JSON never false-closes; newlines are legal inside. Null = unclosed (truncation). */
function scanQuotedValue(src: string, openQuote: number, limit: number): { readonly value: string; readonly end: number } | null {
  let value = "";
  let i = openQuote + 1;
  while (i < limit) {
    const ch = src[i];
    if (ch === "\\" && i + 1 < limit) {
      value += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value, end: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

/** One `key="value"` attr pair starting at `from` (which must be at the key). Null = not an attr pair. */
function scanAttrPair(src: string, from: number, limit: number): { readonly key: string; readonly value: string; readonly end: number } | null {
  const key = ATTR_KEY_RE.exec(src.slice(from, Math.min(limit, from + IDENT_WINDOW)));
  if (key === null) {
    return null;
  }
  let i = skipSpaces(src, from + key[0].length, limit);
  if (src[i] !== "=") {
    return null;
  }
  i = skipSpaces(src, i + 1, limit);
  if (src[i] !== '"') {
    return null;
  }
  const value = scanQuotedValue(src, i, limit);
  return value === null ? null : { key: key[0], value: value.value, end: value.end };
}

interface TagScan {
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly attrCount: number;
  /** The index just past the closing `/>`. */
  readonly end: number;
}

/** The quote/escape-aware self-closing-tag walker (§3.2.1 #1): `<name key="value" …/>`. Newlines are legal
 *  INSIDE a quoted value, illegal between attrs. Returns null on ANY malformed/unclosed shape — the caller
 *  leaves the bytes as literal text (stream-truncation survival). */
function scanSelfClosingTag(content: string, start: number): TagScan | null {
  const name = TAG_NAME_RE.exec(content.slice(start, start + IDENT_WINDOW));
  if (name === null) {
    return null;
  }
  const tag = name[1] ?? "";
  const limit = Math.min(content.length, start + MAX_TAG_SCAN);
  let i = start + 1 + tag.length;
  const attrs: Record<string, string> = {};
  let attrCount = 0;
  for (;;) {
    i = skipSpaces(content, i, limit);
    if (content[i] === "/" && content[i + 1] === ">") {
      return { tag, attrs, attrCount, end: i + "/>".length };
    }
    const pair = scanAttrPair(content, i, limit);
    if (pair === null) {
      return null;
    }
    attrs[pair.key] = pair.value;
    attrCount += 1;
    i = pair.end;
  }
}

/** The fence-open attr list (`:::name key="value" key2="…"`), same quote/escape rules as the tag walker.
 *  Empty/whitespace rest → `{}`; any malformed rest → null (the line is NOT a directive open — literal). */
function parseFenceAttrs(rest: string): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  let i = 0;
  for (;;) {
    i = skipSpaces(rest, i, rest.length);
    if (i >= rest.length) {
      return attrs;
    }
    const pair = scanAttrPair(rest, i, rest.length);
    if (pair === null) {
      return null;
    }
    attrs[pair.key] = pair.value;
    i = pair.end;
  }
}

// ── The line-anchored structural pass (fences + code-fence exclusion + the lenient arm) ──────────────────

const FENCE_OPEN_RE = /^:::([A-Za-z][A-Za-z0-9_-]*)(.*)$/;
const FENCE_NESTED_OPEN_RE = /^:::[A-Za-z]/;
const FENCE_CLOSE_RE = /^:::[ \t]*$/;
const CODE_FENCE_MARK = "```";
const LENIENT_CODE_FENCE_RE = /^```(?:html|svg)[ \t]*$/i;
const CHOICE_LINE_RE = /^[ \t]*\d{1,3}[.)][ \t]+(\S.*)$/;
const TAGGED_LINE_RE = /<\/?[A-Za-z]/;

// §4.8: the naked-HTML arm only triggers on a BLOCK-LEVEL opening tag (an inline `<b>` never wraps).
const LENIENT_BLOCK_OPEN_RE =
  /^[ \t]{0,3}<(?:div|section|article|aside|main|header|footer|nav|table|form|figure|canvas|svg|style|ul|ol|dl|blockquote|details|p|h[1-6])\b/i;
const LENIENT_HTML_MIN_LINES = 3;
// The ```html/```svg arm has an explicit language tag — one markup line is already a deliberate block.
const LENIENT_MARKUP_FENCE_MIN_LINES = 1;
const CARD_TITLE_RE = /<(?:h[1-3]|title)[^>]*>([^<]{1,120})/i;

interface Line {
  readonly start: number;
  /** Exclusive end of the line's text (the `\n` itself is NOT included). */
  readonly end: number;
  readonly text: string;
}

function splitLines(content: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const nl = content.indexOf("\n", start);
    if (nl === -1) {
      lines.push({ start, end: content.length, text: content.slice(start) });
      return lines;
    }
    lines.push({ start, end: nl, text: content.slice(start, nl) });
    start = nl + 1;
  }
}

/** Line text for grammar matching — a trailing `\r` (CRLF body) is invisible to the line-anchored grammar
 *  but preserved in the raw bytes. */
function matchText(line: Line): string {
  return line.text.endsWith("\r") ? line.text.slice(0, -1) : line.text;
}

/** §4.8 element-majority: enough non-empty lines and MORE than half of them carry a tag. */
function isElementMajorityHtml(texts: readonly string[], minLines: number): boolean {
  const nonEmpty = texts.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < minLines) {
    return false;
  }
  const tagged = nonEmpty.filter((l) => TAGGED_LINE_RE.test(l)).length;
  return tagged * 2 > nonEmpty.length;
}

/** §4.8 derived stub title: first `<h1-3>`/`<title>` text, else null (the stub renders `[card]`). */
function deriveCardTitle(html: string): string | null {
  const m = CARD_TITLE_RE.exec(html);
  const t = m?.[1]?.trim() ?? "";
  return t.length > 0 ? t : null;
}

function parseChoiceLines(body: string): string[] {
  const options: string[] = [];
  for (const line of body.split("\n")) {
    const m = CHOICE_LINE_RE.exec(line.endsWith("\r") ? line.slice(0, -1) : line);
    if (m?.[1] !== undefined) {
      options.push(m[1].trimEnd());
    }
  }
  return options;
}

/** Per registered fence name, the span its balanced block projects to (registry-driven — a new fence name
 *  extends `DIRECTIVE_FENCE_NAMES` + adds a builder row; the recognizer is shared, graft #V3). */
const FENCE_BUILDERS: Readonly<Record<DirectiveFenceName, (attrs: Readonly<Record<string, string>>, body: string, raw: string) => ContentSpan>> = {
  card: (attrs, body, raw) => ({ kind: "card", title: attrs["title"] ?? null, body, origin: "fence", raw }),
  // A `:::choices` with zero parseable `N. text` lines is model noise, not a choice set → allowlist-strip.
  choices: (_attrs, body, raw) => {
    const options = parseChoiceLines(body);
    return options.length > 0 ? { kind: "choices", options, raw } : { kind: "unknown-directive", raw };
  },
};

function isDirectiveFenceName(name: string): name is DirectiveFenceName {
  return (DIRECTIVE_FENCE_NAMES as readonly string[]).includes(name);
}

type Piece =
  | { readonly kind: "text"; readonly start: number; readonly end: number; readonly allowTags: boolean }
  | { readonly kind: "span"; readonly span: ContentSpan };

/** A consumed block's result: the pieces it produced + the next line index to scan from. */
interface BlockResult {
  readonly pieces: readonly Piece[];
  readonly next: number;
}

function sliceTexts(lines: readonly Line[], from: number, to: number): string[] {
  return lines.slice(from, to).map((l) => l.text);
}

/** The text piece for one whole line INCLUDING its trailing `\n` (byte preservation). */
function linePiece(content: string, lines: readonly Line[], idx: number, allowTags: boolean): readonly Piece[] {
  const line = lines[idx];
  if (line === undefined) {
    return [];
  }
  return [{ kind: "text", start: line.start, end: lines[idx + 1]?.start ?? content.length, allowTags }];
}

/** The trailing `\n` byte after a consumed block's last line (stays literal text). */
function tailPiece(content: string, lines: readonly Line[], idx: number, allowTags: boolean): readonly Piece[] {
  const line = lines[idx];
  if (line === undefined || line.end >= content.length) {
    return [];
  }
  return [{ kind: "text", start: line.end, end: lines[idx + 1]?.start ?? content.length, allowTags }];
}

/** Find the balanced `:::` close (§3.2.1 #1): nested `:::name` opens increment depth; a bare `:::` at
 *  depth 0 closes. -1 = unclosed (truncation → the open line degrades to literal). */
function findFenceClose(lines: readonly Line[], from: number): number {
  let depth = 0;
  for (let j = from; j < lines.length; j += 1) {
    const line = lines[j];
    if (line === undefined) {
      return -1;
    }
    const t = matchText(line);
    if (FENCE_CLOSE_RE.test(t)) {
      if (depth === 0) {
        return j;
      }
      depth -= 1;
      continue;
    }
    if (FENCE_NESTED_OPEN_RE.test(t)) {
      depth += 1;
    }
  }
  return -1;
}

function findCodeFenceClose(lines: readonly Line[], from: number): number {
  for (let j = from; j < lines.length; j += 1) {
    const line = lines[j];
    if (line !== undefined && matchText(line).startsWith(CODE_FENCE_MARK)) {
      return j;
    }
  }
  return -1;
}

/** A `:::name` directive fence at line `i` → its span + tail, or null (not a fence / unclosed → literal). */
function tryDirectiveFence(content: string, lines: readonly Line[], i: number): BlockResult | null {
  const line = lines[i];
  if (line === undefined) {
    return null;
  }
  const open = FENCE_OPEN_RE.exec(matchText(line));
  if (open === null) {
    return null;
  }
  const attrs = parseFenceAttrs(open[2] ?? "");
  if (attrs === null) {
    return null;
  }
  const closeIdx = findFenceClose(lines, i + 1);
  const closeLine = lines[closeIdx];
  if (closeIdx === -1 || closeLine === undefined) {
    return null;
  }
  const body = sliceTexts(lines, i + 1, closeIdx).join("\n");
  const raw = content.slice(line.start, closeLine.end);
  const name = open[1] ?? "";
  // Allowlist (§3.2.1 #2): a registered name projects; an unregistered command-shaped fence strips.
  const span = isDirectiveFenceName(name) ? FENCE_BUILDERS[name](attrs, body, raw) : ({ kind: "unknown-directive", raw } as const);
  return { pieces: [{ kind: "span", span }, ...tailPiece(content, lines, closeIdx, true)], next: closeIdx + 1 };
}

/** The §4.8 html/svg code-fence arm: a CLOSED, element-majority markup fence becomes an implicit lenient card. */
function tryLenientMarkupFence(content: string, lines: readonly Line[], i: number): BlockResult | null {
  const line = lines[i];
  if (line === undefined || !LENIENT_CODE_FENCE_RE.test(matchText(line))) {
    return null;
  }
  const closeIdx = findCodeFenceClose(lines, i + 1);
  const closeLine = lines[closeIdx];
  if (closeIdx === -1 || closeLine === undefined) {
    return null;
  }
  const bodyLines = sliceTexts(lines, i + 1, closeIdx);
  if (!isElementMajorityHtml(bodyLines, LENIENT_MARKUP_FENCE_MIN_LINES)) {
    return null;
  }
  const body = bodyLines.join("\n");
  const raw = content.slice(line.start, closeLine.end);
  const span: ContentSpan = { kind: "card", title: deriveCardTitle(body), body, origin: "lenient", raw };
  return { pieces: [{ kind: "span", span }, ...tailPiece(content, lines, closeIdx, false)], next: closeIdx + 1 };
}

/** §4.8 naked-HTML arm: a contiguous ≥N-line element-majority run opening with a block-level tag. */
function tryLenientBlock(content: string, lines: readonly Line[], i: number): BlockResult | null {
  const first = lines[i];
  if (first === undefined || !LENIENT_BLOCK_OPEN_RE.test(matchText(first))) {
    return null;
  }
  let j = i;
  while (j < lines.length) {
    const line = lines[j];
    const t = line === undefined ? "" : matchText(line);
    if (t.trim().length === 0 || t.startsWith(CODE_FENCE_MARK)) {
      break;
    }
    j += 1;
  }
  const runLines = sliceTexts(lines, i, j);
  const last = lines[j - 1];
  if (last === undefined || !isElementMajorityHtml(runLines, LENIENT_HTML_MIN_LINES)) {
    return null;
  }
  const body = runLines.join("\n");
  const raw = content.slice(first.start, last.end);
  const span: ContentSpan = { kind: "card", title: deriveCardTitle(body), body, origin: "lenient", raw };
  return { pieces: [{ kind: "span", span }, ...tailPiece(content, lines, j - 1, true)], next: j };
}

interface StepState {
  readonly pieces: readonly Piece[];
  readonly next: number;
  readonly inCode: boolean;
}

/** The immutable per-body scan environment the line steps read (bundled — the steps stay small + pure). */
interface ScanEnv {
  readonly content: string;
  readonly lines: readonly Line[];
  readonly lenient: boolean;
}

/** A code-fence delimiter line: toggle the fence state (its own line stays literal); the lenient html arm may
 *  consume a whole markup fence instead. */
function stepCodeFenceLine(env: ScanEnv, i: number, inCode: boolean): StepState {
  if (!inCode && env.lenient) {
    const r = tryLenientMarkupFence(env.content, env.lines, i);
    if (r !== null) {
      return { ...r, inCode: false };
    }
  }
  return { pieces: linePiece(env.content, env.lines, i, false), next: i + 1, inCode: !inCode };
}

/** One line of the structural walk (decomposed so each recognizer stays a small pure step). */
function stepLine(env: ScanEnv, i: number, inCode: boolean): StepState {
  const line = env.lines[i];
  const text = line === undefined ? "" : matchText(line);
  if (text.startsWith(CODE_FENCE_MARK)) {
    return stepCodeFenceLine(env, i, inCode);
  }
  if (inCode) {
    return { pieces: linePiece(env.content, env.lines, i, false), next: i + 1, inCode };
  }
  const fence = tryDirectiveFence(env.content, env.lines, i);
  if (fence !== null) {
    return { ...fence, inCode };
  }
  if (env.lenient) {
    const block = tryLenientBlock(env.content, env.lines, i);
    if (block !== null) {
      return { ...block, inCode };
    }
  }
  return { pieces: linePiece(env.content, env.lines, i, true), next: i + 1, inCode };
}

/** The line walk: recognizes directive fences (balance-aware), excludes markdown code-fence regions from
 *  the new grammar, and (opt-in) runs the §4.8 lenient detection. Text is emitted as offset pieces so bytes
 *  are preserved exactly. */
function structuralPass(content: string, lines: readonly Line[], lenient: boolean): Piece[] {
  const env: ScanEnv = { content, lines, lenient };
  const pieces: Piece[] = [];
  let inCode = false;
  let i = 0;
  while (i < lines.length) {
    const step = stepLine(env, i, inCode);
    pieces.push(...step.pieces);
    inCode = step.inCode;
    i = step.next;
  }
  return pieces;
}

// ── The inline tag pass ──────────────────────────────────────────────────────────────────────────────────

const HIDDEN_TAG_NAMES: ReadonlySet<string> = new Set(HIDDEN_TAGS.map((d) => d.tag));

/** Classify a balanced self-closing tag: registered → hidden span; unregistered WITH attrs → the
 *  allowlist-strip class (`unknown-directive` — command-shaped); unregistered WITHOUT attrs (a `<br/>`, an
 *  `<hr/>`) → null = literal text (ordinary prose markup, never stripped). */
function classifyTag(scan: TagScan, raw: string): ContentSpan | null {
  if (HIDDEN_TAG_NAMES.has(scan.tag)) {
    return { kind: "hidden", tag: scan.tag, attrs: scan.attrs, raw };
  }
  return scan.attrCount > 0 ? { kind: "unknown-directive", raw } : null;
}

type Expanded = { readonly kind: "text"; readonly text: string } | { readonly kind: "span"; readonly span: ContentSpan };

function scanTags(text: string): Expanded[] {
  const out: Expanded[] = [];
  let last = 0;
  let i = text.indexOf("<");
  while (i !== -1) {
    const scan = scanSelfClosingTag(text, i);
    const span = scan === null ? null : classifyTag(scan, text.slice(i, scan.end));
    if (scan === null || span === null) {
      i = text.indexOf("<", i + 1);
      continue;
    }
    if (i > last) {
      out.push({ kind: "text", text: text.slice(last, i) });
    }
    out.push({ kind: "span", span });
    last = scan.end;
    i = text.indexOf("<", scan.end);
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last) });
  }
  return out;
}

// ── The tokenizer ────────────────────────────────────────────────────────────────────────────────────────

/** Merge contiguous text pieces sharing an `allowTags` verdict, so the tag walker sees whole multi-line
 *  runs (a quoted attr value may span lines) instead of per-line fragments. */
function coalesceTextPieces(pieces: readonly Piece[]): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    const prev = out.at(-1);
    if (p.kind === "text" && prev !== undefined && prev.kind === "text" && prev.allowTags === p.allowTags && prev.end === p.start) {
      out[out.length - 1] = { ...prev, end: p.end };
      continue;
    }
    out.push(p);
  }
  return out;
}

function expandPieces(content: string, pieces: readonly Piece[]): Expanded[] {
  const expanded: Expanded[] = [];
  for (const p of coalesceTextPieces(pieces)) {
    if (p.kind === "span") {
      expanded.push(p);
      continue;
    }
    const text = content.slice(p.start, p.end);
    if (p.allowTags) {
      expanded.push(...scanTags(text));
    } else {
      expanded.push({ kind: "text", text });
    }
  }
  return expanded;
}

/**
 * Split a message body into ordered spans (§3.2 — ONE grammar family, registry-driven). A body with no
 * structured spans → a single text span (the whole string, incl. `""` for an empty body — the byte-identical
 * text path). Recognition order: directive fences (line-anchored, balance-aware, code-fence-excluded) →
 * hidden-class tags (inline walker, code-fence-excluded) → image refs (the original grammar, everywhere).
 * DEGRADES, never throws, on all persisted content (D51).
 */
export function tokenizeContent(content: string, options?: TokenizeContentOptions): ContentSpan[] {
  const expanded = expandPieces(content, structuralPass(content, splitLines(content), options?.lenientHtml === true));
  // Merge adjacent text runs (maximal text spans — the pre-grammar byte-identical shape), then image-tokenize.
  const spans: ContentSpan[] = [];
  let pending = "";
  const flush = (): void => {
    if (pending.length > 0) {
      spans.push(...tokenizeImages(pending));
      pending = "";
    }
  };
  for (const e of expanded) {
    if (e.kind === "text") {
      pending += e.text;
      continue;
    }
    flush();
    spans.push(e.span);
  }
  flush();
  if (spans.length === 0) {
    spans.push({ kind: "text", text: "" });
  }
  return spans;
}

// ── Span re-emit + the wire/member-strip primitives ──────────────────────────────────────────────────────

/** A span's exact stored bytes (text/image reconstruct; structured spans carry `raw`). `join("")` over a
 *  body's spans reproduces the body byte-identically — the strip/re-emit invariant the member-strip rides. */
export function contentSpanRaw(span: ContentSpan): string {
  if (span.kind === "text") {
    return span.text;
  }
  if (span.kind === "image") {
    return `![${span.alt}](${span.ref.kind === "asset" ? `${ASSET_SCHEME}${span.ref.assetId}` : span.ref.url})`;
  }
  return span.raw;
}

/** The MEMBER-STRIP primitive (§3.6 — the trust boundary's pure half): removes ONLY `hidden`-class spans
 *  from a body, byte-preserving everything else. A body with no hidden spans returns the ORIGINAL string
 *  (identity — the common case is free). A malformed hidden tag that degraded to literal text is NOT
 *  stripped (it is visible, not secret — the D51 posture; the reader seeing raw `<lie` is a visible model
 *  bug, never a silent truth-leak). `unknown-directive` spans are NOT stripped here — they are display
 *  noise, not secrets, and the transcript payload stays honest. */
export function stripHiddenSpans(content: string): { readonly content: string; readonly hadHidden: boolean } {
  const spans = tokenizeContent(content);
  if (!spans.some((s) => s.kind === "hidden")) {
    return { content, hadHidden: false };
  }
  const kept = spans.filter((s) => s.kind !== "hidden").map(contentSpanRaw);
  return { content: kept.join(""), hadHidden: true };
}

// ── The MID-STREAM member scrubber (§3.6 — the delta leak the at-commit strip can't reach) ────────────────
//
// The at-commit strip (`stripHiddenSpans`) runs on a WHOLE stored body; the live token stream hands a member
// raw model text char-by-char, so a `<lie truth="…"/>` leaks byte-by-byte BEFORE it commits (and then vanishes
// at commit — the worst kind of leak: visible only in the network trace, gone from the UI). This is a STATEFUL
// per-subscriber transform over the accumulating text channel: emit the maximal prefix PROVABLY free of a
// hidden tag (open OR in-progress), HOLD BACK any trailing run that could still grow into a hidden-tag open,
// and DROP any hidden tag that completes. FAIL-CLOSED by construction: an unclosed potential-open is withheld
// (never released as "malformed-so-literal" — mid-stream "unclosed" means "the close hasn't arrived yet"); at
// stream end whatever is still held is dropped, and the member keeps the at-commit-stripped committed view.
// Allocation-sane: the held buffer is bounded by ONE tag's in-progress length (a runaway attr value holds only
// until the tag closes or the turn ends), never the whole ghost.

/** The longest hidden-tag name (`ofilter`) bounds how far past a `<` we must look before a name is decidable. */
const MAX_HIDDEN_TAG_NAME_LEN = Math.max(...HIDDEN_TAGS.map((d) => d.tag.length));
// A hold-back run longer than this cannot be a legitimate in-progress hidden tag (an attr value that huge is
// model garbage, not a keyed secret field); force-release it so a stray unclosed `<` never wedges the stream.
// Mirrors the tokenizer's `MAX_TAG_SCAN` bound.
const MAX_HELD_RUN = 4096;
// The leading tag-name identifier of a hold-back run (same shape as the tokenizer's `TAG_NAME_RE` body).
const HELD_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*/;

/** Could the run at `text[lt..]` be a viable hidden-tag NAME prefix (`<`, `<l`, `<lie`, `<ofilter`, …)? This is
 *  the pure name-level test — it does NOT look past the name for a close (that is `scanSelfClosingTag`'s job).
 *  A `<` whose following name can never prefix a hidden tag (`< `, `</`, `<div`) is disqualified here. */
function startsViableHiddenName(text: string, lt: number): boolean {
  const s = text.slice(lt, lt + 1 + MAX_HIDDEN_TAG_NAME_LEN + 1);
  const nameMatch = HELD_NAME_RE.exec(s.slice(1));
  if (nameMatch === null) {
    return s.length === 1; // a bare trailing `<` may still grow into a name.
  }
  const name = nameMatch[0];
  const tags = HIDDEN_TAGS.map((d) => d.tag);
  // Name fully consumed inside the window (a following char exists) ⇒ decide on exact match; still-growing ⇒ prefix.
  return 1 + name.length < s.length ? tags.includes(name) : tags.some((t) => t.startsWith(name));
}

/** Split accumulated text into `{ safe, held }`: `held` is the trailing run from the LEFTMOST `<` that begins a
 *  hidden-tag open which has NOT yet completed (quote-aware, via `scanSelfClosingTag` — so a `<` or a `/>` inside
 *  a quoted attr value never mis-splits the tag). Everything before that `<` is `safe`. When no in-progress
 *  hidden open exists, the whole buffer is safe. FAIL-CLOSED: once a viable hidden open begins, the ENTIRE run
 *  from its `<` is held until the quote-aware walker sees a real close — a `<` inside its attr value can never
 *  release the enclosing tag's prefix (the D106 leak the rightmost-cut logic had). Bounded: past `MAX_HELD_RUN`
 *  a still-open run is released (a keyed secret field never runs that long; mirrors the tokenizer cap). */
function cutAtIncompleteOpen(text: string): { readonly safe: string; readonly held: string } {
  let lt = text.indexOf("<");
  while (lt !== -1) {
    // A COMPLETE self-closing tag (hidden OR not) is consumed WHOLE: skip PAST its `/>` so an inner `<` in its
    // attr value is never mistaken for a new open (the D106 mid-stream leak). `stripHiddenSpans` on the released
    // `safe` prefix drops it if it was hidden; a non-hidden complete tag stays literal — both handled downstream.
    const scan = scanSelfClosingTag(text, lt);
    if (scan !== null) {
      lt = text.indexOf("<", scan.end);
      continue;
    }
    // Not a complete tag. If this `<` begins a VIABLE hidden-tag name still growing toward a close, HOLD the
    // whole run from here (fail-closed — the close hasn't arrived). Past the cap, release (fail-open bound: a
    // keyed secret field never runs that long; mirrors the tokenizer's `MAX_TAG_SCAN`).
    if (startsViableHiddenName(text, lt)) {
      return text.length - lt > MAX_HELD_RUN ? { safe: text, held: "" } : { safe: text.slice(0, lt), held: text.slice(lt) };
    }
    lt = text.indexOf("<", lt + 1);
  }
  return { safe: text, held: "" };
}

/** A stateful per-subscriber scrubber over ONE turn's text-delta stream (§3.6). Feed each delta's text; get
 *  back the bytes safe to emit to a NON-HOST member (complete hidden tags removed, in-progress opens withheld).
 *  Call {@link HiddenSpanStreamScrubber.flush} at turn end to release any tail that is provably not a hidden
 *  open (an unclosed hidden open is DROPPED — the member keeps the at-commit-stripped view). ONE scrubber per
 *  subscriber per turn; a host subscriber never constructs one (they read the stream verbatim). */
export interface HiddenSpanStreamScrubber {
  /** Feed a text-channel delta; returns the substring safe to forward to the member this tick (may be `""`). */
  readonly push: (text: string) => string;
  /** Turn/stream end: release the held tail IFF it holds no in-progress hidden open, else drop it. */
  readonly flush: () => string;
}

export function createHiddenSpanStreamScrubber(): HiddenSpanStreamScrubber {
  let held = "";
  return {
    push(text: string): string {
      const { safe, held: nextHeld } = cutAtIncompleteOpen(held + text);
      held = nextHeld;
      // `safe` may contain COMPLETE hidden tags (a `<lie …/>` that finished this tick) — strip them.
      return safe.length > 0 ? stripHiddenSpans(safe).content : "";
    },
    flush(): string {
      // `held` is, BY CONSTRUCTION (`cutAtIncompleteOpen`), always an UNCLOSED viable hidden open starting at
      // its own `<`. The stream ended, so it can never close → FAIL-CLOSED: drop it whole (never emit a
      // half-formed secret). The member's authoritative final content is the at-commit-stripped view.
      held = "";
      return "";
    },
  };
}

/** The deterministic card WIRE STUB (§3.5): same bytes every assembly (cache-stable), compact, honest —
 *  `[card: <title>]`, or `[card]` when the card carries no title. ONE home so the turn wire, compaction /
 *  summarize reads, and any future consumer collapse identically. */
export function cardWireStub(title: string | null): string {
  const t = title?.trim() ?? "";
  return t.length > 0 ? `[card: ${t}]` : "[card]";
}

/** The SUMMARY-plane body projection (§3.5 "stub goes to compaction/summarize too"): cards collapse to the
 *  stub (a summarizer never eats the multi-KB blob), and HIDDEN-class spans are STRIPPED — the compaction
 *  marker / a digest is a durable, MEMBER-PEEKABLE artifact, so folding a lie's truth into it would re-open
 *  the §3.6 leak the payload strip closes. Fail-closed trade, named: a covered lie drops out of the model's
 *  summarized long-horizon memory (the live wire keeps it verbatim until coverage; the standing-lie
 *  inventory reads the transcript, not the summary). Everything else re-emits byte-identically. */
export function projectBodyForSummary(content: string): string {
  return tokenizeContent(content)
    .map((s) => {
      if (s.kind === "hidden") {
        return "";
      }
      return s.kind === "card" ? cardWireStub(s.title) : contentSpanRaw(s);
    })
    .join("");
}
