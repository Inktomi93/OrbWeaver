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
//     + a projection arm). Unknown attrs on a fence are IGNORED, never fatal (version-tolerant, graft #V4),
//     and a REGISTERED name's open line tolerates ONE measured malformation — the trailing HTML-tag-close
//     reflex `:::card title="…">` (spike §4h; see `FENCE_OPEN_TAG_CLOSE_RE` for the observed distribution and
//     the exact scope). Everything else about the open line, the close line, and attr parsing stays strict.
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
//      ONE exception, opt-in per call: `committed: true` says no more bytes are coming, so an unterminated
//      REGISTERED fence closes at EOF (degrade PRESERVING VALUE — see `TokenizeContentOptions.committed`).
//      Streaming callers never pass it, so mid-stream behavior is byte-identical.
//   3. MARKDOWN-CODE-FENCE EXCLUSION — tags/fences inside a ``` code fence are the author SHOWING code and
//      stay literal (the §4.8 hard exclusion, applied to the whole new grammar; image refs keep their
//      original code-fence-blind behavior for byte-compatibility with stored bodies).
//
// The LENIENT-HTML arm (§4.8) is DETECTION-ONLY here (pure, opt-in via `lenientHtml` — default OFF, zero
// behavior change): a ≥3-line element-majority naked-HTML block, or a ```html/```svg fence whose body is
// element-majority, becomes an implicit `card` span with `origin:"lenient"` + a derived title. Its product
// wiring (the immersiveHtml gate, trust, teaching) is the P4 wave.

import type { AssetId } from "#ids";
import { castId } from "#ids";
import { speakerTagsToPlain } from "#speaker-label";

/** A parsed image target: an owned-CAS asset (by id) or an external URL. The chat domain resolves this to a
 *  model-fetchable URL via the injected `resolveImageUrl` op (asset→CAS URL/data-URI; external→gated). */
export type ContentImageRef = { readonly kind: "asset"; readonly assetId: AssetId } | { readonly kind: "external"; readonly url: string };

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
  /**
   * The body is COMMITTED canon (no more bytes are coming), so an unterminated REGISTERED fence is closed at
   * EOF instead of degrading to literal text. Default OFF — a live stream MUST keep the strict rule (an
   * "unclosed" fence mid-stream means the close hasn't arrived yet, and a §4.5 forming card must not
   * flip-flop into a finished one on every token).
   *
   * WHY (owner ruling, the RV-2 root cause): a truncated or nested-closer body left the reader looking at a
   * raw `:::card title="…"` line in the transcript with nothing in the card archive — the user WATCHED the
   * card stream in, and committing must not vanish it. Degrade PRESERVING VALUE once the bytes are final.
   * The EOF-closed span is an ordinary span of its class — it renders on the reading surface and STUBS on
   * the wire exactly like a terminated card (D110 §3 both planes; a multi-KB unterminated blob no longer
   * rides the prompt verbatim).
   *
   * Scope is deliberately narrow: only a name in `DIRECTIVE_FENCE_NAMES` closes at EOF. An unterminated
   * UNREGISTERED command-shaped fence stays literal, because closing it would put the message's whole tail
   * behind the `unknown-directive` allowlist-STRIP and hide it from the reader.
   */
  readonly committed?: boolean | undefined;
}

// ── Image refs (the original D51 grammar — unchanged) ────────────────────────────────────────────────────

// `![alt](target)` — `alt` excludes `]`, `target` excludes whitespace + `)` (both linear, no backtracking →
// ReDoS-safe). The title form `![a](u "t")` intentionally fails to match (the space) and falls through to text.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const ASSET_SCHEME = "asset:";

function parseTarget(target: string): ContentImageRef {
  if (target.startsWith(ASSET_SCHEME)) {
    // castId at the untrusted seam: the id is parsed out of message PROSE (`asset:<id>` markup) — the
    // consumer (`resolveImageUrl`) treats an unknown id as a miss, never as trust.
    return { kind: "asset", assetId: castId<AssetId>(target.slice(ASSET_SCHEME.length)) };
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

// The MEASURED OPEN-LINE reflex (spike §4h) — the `committed` EOF-close's sibling: another measured-leniency
// arm, not a general loosening. Hosted Sonnet closes a fence opener like an HTML tag —
// `:::card title="Maintenance Terminal — LOGIN">` — and the strict parse rejected the whole line, so a
// well-formed card degraded to LITERAL bytes instead of a card span (§4h reports the reader's end of it: the
// prose arrives and the card is a hole). Worse, the malformed opener lands in the assistant history and the
// model imitates itself (one slip cost eight consecutive cards). Measured: 114/120 emitted, 87/120 rendered.
//
// THE OBSERVED DISTRIBUTION (the receipt, `scripts/probes/rpg-extraction/card-teach-out{,-run2,-run3,-run4}
// .json` + the other probe corpora — 203 fence-open lines, of which 78 are `:::choices`): exactly 27 lines
// failed to parse, and EVERY ONE carried the identical residue `">"` after a well-formed attr list. ZERO
// leading-space opens, ZERO single-quoted attrs, ZERO `/>`. §4h's prose also proposed recovering the
// single-quoted title and the leading-space open; both are UNMEASURED (0/203) and both would loosen the attr
// grammar / the line anchor rather than the trailing junk, so they are deliberately NOT shipped.
//
// SCOPE, exhaustively: the tolerance is trailing junk AFTER a well-formed attr list, on a REGISTERED fence
// name only (`tryDirectiveFence` — tolerating it on an unregistered fence would turn literal text into a
// HIDDEN span, the same reason the EOF close is registered-only). Attr parsing itself never loosens — a `>`
// INSIDE quotes stays exact bytes of the title. The CLOSE line never loosens. `stripHiddenSpans` and the
// mid-stream scrubber are untouched: the §3.6 member trust boundary stays strict + fail-closed.
const FENCE_OPEN_TAG_CLOSE_RE = /^>[ \t]*$/;

/** The fence-open attr list (`:::name key="value" key2="…"`), same quote/escape rules as the tag walker.
 *  Empty/whitespace rest → `{}`; any malformed rest → null (the line is NOT a directive open — literal).
 *  `lenient` adds ONLY the §4h measured arm above: a leftover that is exactly the HTML-tag-close reflex keeps
 *  the attrs parsed so far. The rejecting arm survives for genuinely unparseable opens — an unquoted value
 *  (`:::card title=broken`), an unclosed quote, a stray `>` with more attrs behind it — and those still
 *  degrade loudly. */
function parseFenceAttrs(rest: string, lenient: boolean): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  let i = 0;
  for (;;) {
    i = skipSpaces(rest, i, rest.length);
    if (i >= rest.length) {
      return attrs;
    }
    const pair = scanAttrPair(rest, i, rest.length);
    if (pair === null) {
      return lenient && FENCE_OPEN_TAG_CLOSE_RE.test(rest.slice(i)) ? attrs : null;
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

/** A `:::name` directive fence at line `i` → its span + tail, or null (not a fence / unclosed → literal,
 *  unless `committed` lets a registered fence close at EOF). */
function tryDirectiveFence(content: string, lines: readonly Line[], i: number, committed: boolean): BlockResult | null {
  const line = lines[i];
  if (line === undefined) {
    return null;
  }
  const open = FENCE_OPEN_RE.exec(matchText(line));
  if (open === null) {
    return null;
  }
  const name = open[1] ?? "";
  // The §4h open-line leniency rides the ALLOWLIST (`FENCE_OPEN_TAG_CLOSE_RE`): `card`/`choices` share the one
  // recognizer, so the registry is what widens — an unregistered `:::teleport …>` still degrades to literal.
  const attrs = parseFenceAttrs(open[2] ?? "", isDirectiveFenceName(name));
  if (attrs === null) {
    return null;
  }
  const closeIdx = findFenceClose(lines, i + 1);
  const closeLine = lines[closeIdx];
  if (closeIdx === -1 || closeLine === undefined) {
    // The `committed` EOF close (see `TokenizeContentOptions.committed`): an unterminated REGISTERED fence in
    // a FINAL body consumes the rest of the content as its body. Everything to `content.length` becomes the
    // span's `raw`, so the re-emit invariant (`contentSpanRaw` join === body) holds with no tail piece.
    if (!(committed && isDirectiveFenceName(name))) {
      return null;
    }
    const eofBody = sliceTexts(lines, i + 1, lines.length).join("\n");
    const eofRaw = content.slice(line.start);
    return { pieces: [{ kind: "span", span: FENCE_BUILDERS[name](attrs, eofBody, eofRaw) }], next: lines.length };
  }
  const body = sliceTexts(lines, i + 1, closeIdx).join("\n");
  const raw = content.slice(line.start, closeLine.end);
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
  /** Final-body semantics: a registered fence with no close consumes to EOF (`TokenizeContentOptions`). */
  readonly committed: boolean;
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
  const fence = tryDirectiveFence(env.content, env.lines, i, env.committed);
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
function structuralPass(content: string, lines: readonly Line[], lenient: boolean, committed: boolean): Piece[] {
  const env: ScanEnv = { content, lines, lenient, committed };
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
  const expanded = expandPieces(content, structuralPass(content, splitLines(content), options?.lenientHtml === true, options?.committed === true));
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
  // Deliberately NOT `committed` even though this runs at commit: an EOF-closed card would SWALLOW a hidden
  // tag sitting in the unterminated tail, and this projection re-emits a card's raw bytes verbatim — the
  // truth would ride into the member payload. Strict-close keeps that tail as scannable text. Fail-closed
  // beats consistent here (§3.6 is the trust boundary; the card window is only a rendering nicety).
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

// ── The GHOST card scan (§4.5 — the streaming placeholder's pure half) ───────────────────────────────────
//
// The ghost row streams raw model text per-token; once a card's OPENING fence line completes (the line plus
// its newline — unambiguous, no body speculation), the reader should see a pretty forming-state chip instead
// of the accumulating raw HTML. This scanner is that recognition, PURE: split the accumulating ghost text
// into ordered text / forming-card / card segments. Markdown code-fence regions are excluded exactly like
// the committed grammar (a ```-shown fence stays text).
//
// THE TWO CARD ARMS ARE THE §4.5 TRUST LINE, MADE STRUCTURAL (2026-08-14 — the granularity fix). A card
// that is still FORMING carries NO bytes on its segment at all, so a renderer CANNOT paint partial HTML
// even by mistake; a card whose fence has CLOSED carries its `body`, because those bytes are final:
//
//   TERMINATION IS REQUIRED ON BOTH FENCE LINES. The open line is recognized only once its newline arrived
//   (`completedCardOpen`), and — the arm this note exists for — the CLOSE line counts only once ITS newline
//   arrived (`ghostCardStep`). Without that, an accumulating text whose last three bytes are `:::` matches
//   `FENCE_CLOSE_RE` and reads as closed, and the very next token (`:::x`) REVOKES it: a "final" body that
//   is not final, a card that flickers back to a chip, and a close a model can spoof by merely typing a
//   line that LOOKS like one. With it, a closed card's byte range is provably immutable under append: every
//   line up to and including the close is newline-terminated, so no later token can edit them; the scan is
//   left-to-right, so no later token can change the code-fence state or the open-line parse that precedes
//   them; and `findFenceClose` returns the FIRST balanced close, which those frozen lines already fix.
//
// A card whose close never arrives (aborted stream, truncation) stays a `forming-card` forever and dies
// with the ghost row — no false card, per the §4.5 abort rule. The client renders: chip for `forming-card`,
// the REAL card for `card`, markdown for text.

/** One segment of the accumulating ghost text: literal text to stream as markdown, a card still FORMING
 *  (open fence recognized, body deliberately not exposed — see the section note), or a CLOSED card whose
 *  `body` bytes are final and safe to mount. */
export type GhostContentSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "forming-card"; readonly title: string | null }
  | { readonly kind: "card"; readonly title: string | null; readonly body: string };

/** True when line `i` is a COMPLETED `:::card …` open (its newline arrived — §4.5's unambiguous trigger). */
function completedCardOpen(content: string, lines: readonly Line[], i: number): Readonly<Record<string, string>> | null {
  const line = lines[i];
  if (line === undefined || line.end >= content.length) {
    return null; // the open line is still streaming (no newline yet) — not recognized.
  }
  const open = FENCE_OPEN_RE.exec(matchText(line));
  if (open === null || open[1] !== "card") {
    return null;
  }
  // `card` is registered, so the ghost chip gets the same §4h leniency as the committed parse — otherwise a
  // malformed opener would stream as raw HTML and then snap into a card at commit.
  return parseFenceAttrs(open[2] ?? "", true);
}

/** One consumed card block: its segment + where the next text run / line scan resumes. A card whose close
 *  hasn't arrived (or hasn't been TERMINATED — see the section note) consumes the REST of the text and stays
 *  a `forming-card`; everything after the open is the card's still-accumulating body. */
interface GhostCardStep {
  readonly segment: GhostContentSegment;
  readonly pendingStart: number;
  readonly next: number;
}

function ghostCardStep(content: string, lines: readonly Line[], i: number, attrs: Readonly<Record<string, string>>): GhostCardStep {
  const title = attrs["title"] ?? null;
  const closeIdx = findFenceClose(lines, i + 1);
  const closeLine = closeIdx === -1 ? undefined : lines[closeIdx];
  // `closeLine.end >= content.length` means the close line is the buffer's TAIL with no newline yet: a
  // trailing `:::` that the next token can still turn into `:::x`. Not a close — the body is not final.
  if (closeLine === undefined || closeLine.end >= content.length) {
    return { segment: { kind: "forming-card", title }, pendingStart: content.length, next: lines.length };
  }
  const body = sliceTexts(lines, i + 1, closeIdx).join("\n");
  return { segment: { kind: "card", title, body }, pendingStart: lines[closeIdx + 1]?.start ?? content.length, next: closeIdx + 1 };
}

/** Split accumulating GHOST text into text / forming-card / card segments (§4.5). Pure + degrade-never-throw:
 *  text with no completed `:::card` open is one text segment (byte-identical). A `card` segment's `body` is
 *  the SAME projection the committed grammar produces for the same bytes (`tryDirectiveFence`), so the ghost
 *  mount and the settled mount render one card, not two spellings of one. */
export function scanGhostContent(content: string): GhostContentSegment[] {
  const lines = splitLines(content);
  const segments: GhostContentSegment[] = [];
  let pendingStart = 0;
  const flushText = (endExclusive: number): void => {
    if (endExclusive > pendingStart) {
      segments.push({ kind: "text", text: content.slice(pendingStart, endExclusive) });
    }
  };
  let inCode = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const text = line === undefined ? "" : matchText(line);
    if (text.startsWith(CODE_FENCE_MARK)) {
      inCode = !inCode;
      i += 1;
      continue;
    }
    const attrs = inCode ? null : completedCardOpen(content, lines, i);
    if (line === undefined || attrs === null) {
      i += 1;
      continue;
    }
    flushText(line.start);
    const step = ghostCardStep(content, lines, i, attrs);
    segments.push(step.segment);
    pendingStart = step.pendingStart;
    i = step.next;
  }
  flushText(content.length);
  if (segments.length === 0) {
    segments.push({ kind: "text", text: content });
  }
  return segments;
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
  // COMMITTED: compaction only ever reads finalized canon, and an EOF-closed card is strictly safer here —
  // the whole unterminated blob collapses to the stub instead of being fed to the summarizer verbatim.
  return tokenizeContent(content, { committed: true })
    .map((s) => {
      if (s.kind === "hidden") {
        return "";
      }
      return s.kind === "card" ? cardWireStub(s.title) : contentSpanRaw(s);
    })
    .join("");
}

/** The default preview width — one truncated list-row line (`ChatSummary.lastMessagePreview`). */
export const PREVIEW_MAX_CHARS = 120;

/** The truncation marker: a single-char ellipsis, so the budget stays a character count. */
const PREVIEW_ELLIPSIS = "…";

/** Markdown INLINE emphasis / inline-code markers (asterisk, underscore, tilde, backtick). Dropped whole
 *  (the wrapped text survives): a glance line reads the words, never the syntax. */
const PREVIEW_INLINE_MARKERS_RE = /[*_~`]+/g;

/** A markdown LINK / image ref (`[label](target)`, a leading `!` for an image) — collapsed to its label, so
 *  a preview never spends its 120 chars on a URL. Nested brackets are not matched (a degrade, not a parse:
 *  the leftover literal is still plain text). */
const PREVIEW_LINK_RE = /!?\[([^\]]*)\]\([^)]*\)/g;

/** A line's leading BLOCK markers — heading, quote, bullet, ordered-list — plus the markdown code-fence
 *  OPEN/CLOSE line itself (triple-backtick + its language tag, which carries no prose; the fenced body is
 *  kept, since a code block a character actually wrote is still what was last said). */
const PREVIEW_BLOCK_PREFIX_RE = /^[ \t]*(?:```[^\n]*|>+|#{1,6}|[-*+]|\d+[.)])[ \t]*/gm;

/** Any whitespace run (incl. the newlines a body is full of) — collapsed to ONE space: the preview is a
 *  SINGLE line, so a multi-paragraph body must not smuggle its layout into a one-line slot. */
const PREVIEW_WHITESPACE_RE = /\s+/g;

/**
 * The PREVIEW-plane body projection: a message body → ONE line of plain text, capped at `maxChars`.
 *
 * Structure comes off the SAME tokenizer every other projection uses (never a hand-rolled markdown parse of
 * the span grammar): only `text` spans survive — HIDDEN-class spans are dropped (the §3.6 trust boundary: a
 * preview is a durable, member-reachable artifact, exactly the class `projectBodyForSummary` fail-closes on,
 * so the strip here is UNCONDITIONAL rather than viewer-dependent), and `image` / `card` / `choices` /
 * `unknown-directive` spans carry no glanceable prose (a `[card: …]` stub or a raw fence would spend the whole
 * line on chrome). What remains is markdown-FLATTENED — inline emphasis/code markers dropped, links collapsed
 * to their label, leading block markers and code-fence lines removed, every whitespace run collapsed to one
 * space — then trimmed and truncated with a single-char ellipsis. Empty (a body that was all structure) ⇒
 * `""`; the caller decides what an empty preview means.
 */
export function projectBodyForPreview(content: string, maxChars: number = PREVIEW_MAX_CHARS): string {
  // COMMITTED: a preview only ever reads finalized canon, and an EOF-closed card is strictly safer — an
  // unterminated card blob collapses to a dropped span instead of leaking its raw markup into the line.
  const prose = tokenizeContent(content, { committed: true })
    .map((s) => (s.kind === "text" ? s.text : ""))
    .join("");
  // A NARRATOR row carries inline `<speaker>NAME</speaker>` markers (§12.4) — the SAME markup the message-list
  // renderer splits + tints. `tokenizeContent` leaves them inside `text` spans (they are not span-tokens), so a
  // raw `<speaker>` would leak into the one-line scent. Flatten through the ONE kit speaker engine
  // (`speakerTagsToPlain` — the prompt-history home) to `NAME: ` plain attribution rather than re-spelling the
  // tag grammar here (the content-class-wire duplication ban). A tagless per-speaker/solo row is a cheap no-op.
  const flat = speakerTagsToPlain(prose)
    .replace(PREVIEW_LINK_RE, "$1")
    .replace(PREVIEW_BLOCK_PREFIX_RE, "")
    .replace(PREVIEW_INLINE_MARKERS_RE, "")
    .replace(PREVIEW_WHITESPACE_RE, " ")
    .trim();
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1).trimEnd()}${PREVIEW_ELLIPSIS}`;
}
