// @orb/kit/content — the message-content tokenizer: splits a stored message body into ordered spans. ONE
// parser, two projections (D45-amend): the chat domain's SEND path projects spans → provider content-parts
// (the `{text}|{image,url}` wire shape, gated by `ModelCapability.input.vision`); the Phase-6 client RENDER
// path projects the SAME spans → `MessageContentBlock[]` (D294). Pure + deterministic — no markdown dep, no I/O.
//
// THE ENCODING (D45-amend + the span grammar): a message body is `string` (D26 one content
// home). Embedded structured spans:
//   • an image is `![alt](target)` where `target` is `asset:<assetId>` or `http(s)://…` (gated at resolve).
//   • a HIDDEN-class tag is a self-closing `<name key="value" …/>` whose name, in any case, is in the OPEN
//     `HIDDEN_TAGS` registry (§3.2a — lie/ofilter are the first two REGISTRANTS; a third channel is a registry row).
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
// THE §3.2.1 ROBUSTNESS CONTRACT (model-output parsing, not happy-path):
//   1. QUOTE/ESCAPE-AWARE BALANCED WALKING — attr values are `"…"` with `\` escapes, so JSON-in-attributes
//      and a quoted `/>` or `:::` never false-close; a nested `:::name` open inside a fence body increments
//      depth so an inner directive line doesn't false-close the outer fence.
//   2. STREAM-TRUNCATION SURVIVAL — on this grammar an unclosed tag/fence (mid-stream, aborted) falls through to
//      literal text IN PLACE; nothing is mangled, nothing throws. DEGRADE-NEVER-THROW on all persisted content (D51).
//      The §3.6 hidden scan below reads two cases the other way: a REGISTERED hidden open that never closes, and one
//      whose name is followed by a `name=` shape that then breaks, are concealed from members to the end of the body
//      (D285), while this grammar keeps both literal for the host's render and the model's wire. D51 says what becomes
//      of bytes that are not a tag; D285 says who may read a secret.
//      ONE exception, opt-in per call: `committed: true` says no more bytes are coming, so an unterminated
//      REGISTERED fence closes at EOF (degrade PRESERVING VALUE — see `TokenizeContentOptions.committed`).
//      Streaming callers never pass it, so mid-stream behavior is byte-identical.
//   3. MARKDOWN-CODE-FENCE EXCLUSION — on this grammar, tags/fences inside a ``` code fence are the author SHOWING code
//      and stay literal (the §4.8 hard exclusion, applied to the whole new grammar; image refs keep their original
//      code-fence-blind behavior for byte-compatibility with stored bodies).
//
// THE §3.6 MEMBER-STRIP READS NO LINE STRUCTURE. The grammar above is the RENDER/WIRE grammar: a closed fence is ONE span
// carrying its whole body as `raw`, and a code block is literal. A trust boundary can neither re-emit an opaque `raw` nor
// leave a secret literal, so the hidden scan walks the whole text with the tag walker alone. Its totality claim: no
// hidden-class tag survives the member projection anywhere in a body, directive fence and code block bodies included, up
// to the pass bound, past which the rest of the body conceals. The host's render and the model's wire keep what this
// grammar keeps.
//
// The LENIENT-HTML arm (§4.8) is DETECTION-ONLY here (pure, opt-in via `lenientHtml` — default OFF, zero
// behavior change): a ≥3-line element-majority naked-HTML block, or a ```html/```svg fence whose body is
// element-majority, becomes an implicit `card` span with `origin:"lenient"` + a derived title. Its product
// wiring (the immersiveHtml gate, trust, teaching) is the P4 wave.

import type { AssetId } from "#ids";
import { castId } from "#ids";
import type { JsonValue } from "#json";
import { parseJsonText } from "#json";
import { speakerTagsToPlain } from "#speaker-label";
import { isSpaceChar } from "#strings";

/** A parsed image target: an owned-CAS asset (by id) or an external URL. The chat domain resolves this to a
 *  model-fetchable URL via the injected `resolveImageUrl` op (asset→CAS URL/data-URI; external→gated). */
export type ContentImageRef = { readonly kind: "asset"; readonly assetId: AssetId } | { readonly kind: "external"; readonly url: string };

const CARD_SPAN_ORIGINS = ["fence", "lenient"] as const;
/** How a card span was recognized: an explicit `:::card` fence, or the §4.8 lenient arm (naked HTML /
 *  html/svg code fence) — provenance for the reveal/debug surfaces; the wire stub is identical either way. */
export type CardSpanOrigin = (typeof CARD_SPAN_ORIGINS)[number];

/** One ordered span of a tokenized message body (the §3 content-class grammar — `CONTENT_CLASS_POLICY` in
 *  `@orb/contracts/chat` declares each kind's reading-surface × wire planes; the two projection seams
 *  dispatch on `kind` totally). */
export type ContentSpan =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "dice"; readonly label: string; readonly total: number; readonly raw: string }
  | { readonly kind: "image"; readonly ref: ContentImageRef; readonly alt: string }
  | { readonly kind: "hidden"; readonly tag: string; readonly attrs: Readonly<Record<string, string>>; readonly raw: string }
  | { readonly kind: "card"; readonly title: string | null; readonly body: string; readonly origin: CardSpanOrigin; readonly raw: string }
  | { readonly kind: "choices"; readonly options: readonly string[]; readonly raw: string }
  | { readonly kind: "unknown-directive"; readonly raw: string };

/** The span-kind axis the visibility registry (`CONTENT_CLASS_POLICY`) keys off — one member per content
 *  class. A NEW class = a tuple member + a policy row + (if distinct) a projection arm (graft #V1). */
const CONTENT_SPAN_KINDS = ["text", "image", "hidden", "card", "choices", "unknown-directive", "dice"] as const;
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

/** The registered hidden-tag NAMES, derived from the registry above — the membership test the tokenizer and
 *  the §3.6 trust boundary both dispatch on (a new registrant is a row above, never a second list). */
const HIDDEN_TAG_NAMES: ReadonlySet<string> = new Set(HIDDEN_TAGS.map((d) => d.tag));

/** Is `tag` a registered hidden name? SECURITY: in any case (D285). A model writes `<Lie …/>` as readily as `<lie …/>`, and
 *  every reader of a hidden name goes through here, because a case-sensitive one hands a member the `truth` attr. */
function isHiddenTagName(tag: string): boolean {
  return HIDDEN_TAG_NAMES.has(tag.toLowerCase());
}

/** The directive-fence registry — card/choices are the FIRST TWO REGISTRANTS (graft #V3: a new fence is a
 *  member here + a `FENCE_BUILDERS` row + a render/wire projection arm; the fence recognizer is shared). */
export const DIRECTIVE_FENCE_NAMES = ["card", "choices"] as const;
type DirectiveFenceName = (typeof DIRECTIVE_FENCE_NAMES)[number];

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

/** The target scheme of an owned-asset image: `![alt](asset:<id>)`. */
export const ASSET_SCHEME = "asset:";

function parseTarget(target: string): ContentImageRef {
  if (target.startsWith(ASSET_SCHEME)) {
    // castId at the untrusted seam: the id is parsed out of message PROSE (`asset:<id>` markup) — the
    // consumer (`resolveImageUrl`) treats an unknown id as a miss, never as trust.
    return { kind: "asset", assetId: castId<AssetId>(target.slice(ASSET_SCHEME.length)) };
  }
  return { kind: "external", url: target };
}

const IMAGE_OPEN = "![";

// The first `)` or whitespace at or after `from`, else the end of the text.
function targetStop(text: string, from: number): number {
  let at = from;
  while (at < text.length && text.charAt(at) !== ")" && !isSpaceChar(text.charAt(at))) {
    at += 1;
  }
  return at;
}

interface ImageMatch {
  readonly start: number;
  readonly end: number;
  readonly alt: string;
  readonly target: string;
}

// Every `![alt](target)` left to right: `alt` excludes `]`, `target` excludes whitespace and `)`, so the title form
// `![a](u "t")` is text. A scan, because `/!\[([^\]]*)\]\(([^)\s]+)\)/g` retries every `![` of an unclosed run against the
// rest of the body.
function* imageMatches(text: string): Generator<ImageMatch> {
  let search = 0;
  // Reused while a later target starts before it, so overlapping `](` runs walk each character once.
  let stop = -1;
  for (;;) {
    const open = text.indexOf(IMAGE_OPEN, search);
    const close = open === -1 ? -1 : text.indexOf("]", open + IMAGE_OPEN.length);
    if (close === -1) {
      return;
    }
    // Every `![` before this `]` shares it as its first closer, so a failure here fails them all.
    search = close + 1;
    if (text.charAt(close + 1) !== "(") {
      continue;
    }
    const target = close + 2;
    stop = stop < target ? targetStop(text, target) : stop;
    if (text.charAt(stop) === ")" && stop > target) {
      yield { start: open, end: stop + 1, alt: text.slice(open + IMAGE_OPEN.length, close), target: text.slice(target, stop) };
      search = stop + 1;
    }
  }
}

/** The image tokenization over one maximal text run (no empty-fallback — the caller owns that). An image written in a
 *  `<style>` or `<script>` element's text is that text, never an image: cutting there would split the element across
 *  blocks and print the rest of its source. */
function tokenizeImages(text: string): ContentSpan[] {
  const spans: ContentSpan[] = [];
  let last = 0;
  let inRawText: ((offset: number) => RawTextElement | undefined) | undefined;
  for (const image of imageMatches(text)) {
    inRawText ??= rawTextCursor(markdownRawTextElements(text));
    if (inRawText(image.start) !== undefined) {
      continue;
    }
    if (image.start > last) {
      spans.push({ kind: "text", text: text.slice(last, image.start) });
    }
    spans.push({ kind: "image", ref: parseTarget(image.target), alt: image.alt });
    last = image.end;
  }
  if (last < text.length) {
    spans.push({ kind: "text", text: text.slice(last) });
  }
  return spans;
}

// ── The §3.2.1 balance-aware walkers ─────────────────────────────────────────────────────────────────────

// Caps the tag walker so a stray `<name ` in a huge body never scans the whole document (linear + bounded).
const MAX_TAG_SCAN = 4096;
// The same bound RAISED, for a REGISTERED HIDDEN tag only (§3.6). The general cap is about walk COST; a
// hidden tag that outruns it is a CONFIDENTIALITY question, because an unrecognised `<lie …/>` degrades to
// literal text and hands the member its `truth` attr verbatim (measured: a 4269-byte tag leaked on
// BOTH planes and reported `hadHidden=false`). So the hidden walker escalates to this bound before any
// verdict, and PAST it the run is concealed rather than released — fail-closed, never fail-open.
// WHY 16 KiB and not "unbounded": the mid-stream scrubber re-walks the held run on every delta, so the
// per-turn cost of a never-closing open is bound² / delta-size. At 16 KiB with token-sized deltas that is
// ~10⁷ char steps (tens of ms); unbounded, it is the whole turn squared. A keyed secret field four times
// past the "model garbage" line is garbage either way — the question this constant answers is only how much
// we are willing to PARSE before we conceal, never how much we are willing to emit.
// ONE constant, read by BOTH planes (the tokenizer and the member stream scrubber). Two independent literals that
// claim to "mirror" each other are how such bounds come to disagree.
const MAX_HIDDEN_TAG_SCAN = 16_384;
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

/** One attr-pair walk's outcome. `truncated` (the pair ran off the END OF THE WINDOW — cursor at `limit`, or
 *  a quoted value still open there) is kept APART from `malformed` (the bytes are not an attr pair) because
 *  the distinction is load-bearing at the §3.6 trust boundary: window exhaustion inside a hidden tag means
 *  "the tag is longer than we looked", which must NOT degrade to literal text; malformed bytes mean "not a
 *  tag", which must (D51). */
type AttrPairScan =
  | { readonly kind: "pair"; readonly key: string; readonly value: string; readonly end: number }
  | { readonly kind: "truncated" }
  | { readonly kind: "malformed" };

const ATTR_TRUNCATED: AttrPairScan = { kind: "truncated" };
const ATTR_MALFORMED: AttrPairScan = { kind: "malformed" };

/** One `key="value"` attr pair starting at `from` (which must be at the key), bounded by `limit`. */
function scanAttrPair(src: string, from: number, limit: number): AttrPairScan {
  if (from >= limit) {
    return ATTR_TRUNCATED;
  }
  const key = ATTR_KEY_RE.exec(src.slice(from, Math.min(limit, from + IDENT_WINDOW)));
  if (key === null) {
    return ATTR_MALFORMED;
  }
  let i = skipSpaces(src, from + key[0].length, limit);
  if (i >= limit) {
    return ATTR_TRUNCATED;
  }
  if (src[i] !== "=") {
    return ATTR_MALFORMED;
  }
  i = skipSpaces(src, i + 1, limit);
  if (i >= limit) {
    return ATTR_TRUNCATED;
  }
  if (src[i] !== '"') {
    return ATTR_MALFORMED;
  }
  const value = scanQuotedValue(src, i, limit);
  return value === null ? ATTR_TRUNCATED : { kind: "pair", key: key[0], value: value.value, end: value.end };
}

interface TagScan {
  readonly tag: string;
  readonly attrs: Record<string, string>;
  readonly attrCount: number;
  /** The index just past the closing `/>`. */
  readonly end: number;
}

/** The outcome of ONE bounded tag walk. `capped` and `truncated` are the distinctions the §3.6 trust boundary
 *  needs: the walk was still consuming a WELL-FORMED attr list when it ran off the scan bound (`capped`, too LONG)
 *  or off the end of the input (`truncated`, the rest never arrived), so the tag is unfinished rather than broken.
 *  `loose` is a registered hidden open with a `name=` shape that breaks the strict grammar: no close it offers can
 *  be trusted, so it conceals to the end of the body.
 *  Collapsing any of these into "null = literal text" hands a member the attr value. */
type TagScanOutcome =
  | { readonly kind: "tag"; readonly scan: TagScan }
  | { readonly kind: "capped"; readonly tag: string }
  | { readonly kind: "truncated"; readonly tag: string }
  | { readonly kind: "loose"; readonly tag: string }
  | { readonly kind: "malformed" };

const TAG_MALFORMED: TagScanOutcome = { kind: "malformed" };

/** The quote/escape-aware self-closing-tag walker (§3.2.1 #1): `<name key="value" …/>`, bounded by `limit`.
 *  Newlines are legal INSIDE a quoted value, illegal between attrs. A walk that runs out of window reports
 *  `capped` when there ARE bytes past the bound and `truncated` at the true end of input. Neither is `malformed`:
 *  D51 keeps a malformed tag literal, which is a rule about bytes that are not a tag. An unfinished tag is a tag,
 *  so what becomes of it is the reader's call: literal on the render and wire grammar, concealed by the §3.6 hidden
 *  scan (D285). `malformed` is this strict walk's verdict alone; {@link scanSelfClosingTag} has the last word. */
function walkSelfClosingTag(content: string, start: number, limit: number): TagScanOutcome {
  const name = TAG_NAME_RE.exec(content.slice(start, start + IDENT_WINDOW));
  if (name === null) {
    return TAG_MALFORMED;
  }
  const tag = name[1] ?? "";
  const outOfWindow: TagScanOutcome = limit < content.length ? { kind: "capped", tag } : { kind: "truncated", tag };
  let i = start + 1 + tag.length;
  const attrs: Record<string, string> = {};
  let attrCount = 0;
  for (;;) {
    i = skipSpaces(content, i, limit);
    // The whole close must lie inside the bound: a close read past it makes a tag the stream has already concealed.
    if (i + 1 < limit && content[i] === "/" && content[i + 1] === ">") {
      return { kind: "tag", scan: { tag, attrs, attrCount, end: i + "/>".length } };
    }
    // A `/` on the last byte is a close whose `>` did not arrive, not a stray byte in the attr list.
    if (content[i] === "/" && i + 1 >= limit) {
      return outOfWindow;
    }
    const pair = scanAttrPair(content, i, limit);
    if (pair.kind !== "pair") {
      return pair.kind === "truncated" ? outOfWindow : TAG_MALFORMED;
    }
    attrs[pair.key] = pair.value;
    attrCount += 1;
    i = pair.end;
  }
}

const ATTR_GAP_RE = /\s/;
// The loose test's attr name: any run of bytes that cannot end or open a tag. SECURITY: wider than the strict
// identifier, so a non-English (`véracité`), namespaced (`x:truth`) or quoted (`"truth"`) name still conceals.
const LOOSE_ATTR_NAME_RE = /^[^\s=<>/]+/u;

/** Past any whitespace, including the newlines the strict walker refuses between attrs. */
function skipAttrGap(src: string, from: number): number {
  let i = from;
  while (i < src.length && ATTR_GAP_RE.test(src.charAt(i))) {
    i += 1;
  }
  return i;
}

/** The verdict on an open the strict walk refused (§3.6, D285). THE TEST IS THE WORD AFTER THE NAME: a registered name
 *  followed by a `name=` shape is a tag however broken its close, and anything else is prose, so `<lie down on the bed`
 *  stays readable. Input that ends before that word is decided is `truncated`: the same bytes may yet grow into a tag.
 *  Past the first word nothing else is read, so a later `a=b` in a sentence never turns prose into a tag. */
function scanLooseHiddenOpen(content: string, start: number): TagScanOutcome {
  const tag = TAG_NAME_RE.exec(content.slice(start, start + IDENT_WINDOW))?.[1];
  if (tag === undefined || !isHiddenTagName(tag)) {
    return TAG_MALFORMED;
  }
  const key = skipAttrGap(content, start + 1 + tag.length);
  const name = LOOSE_ATTR_NAME_RE.exec(content.slice(key, key + IDENT_WINDOW));
  if (name === null) {
    return key < content.length ? TAG_MALFORMED : { kind: "truncated", tag };
  }
  // SECURITY: a word that fills the window may run past it, and the bytes past a bound cannot prove prose.
  if (name[0].length === IDENT_WINDOW) {
    return { kind: "loose", tag };
  }
  const equals = skipAttrGap(content, key + name[0].length);
  if (equals >= content.length) {
    return { kind: "truncated", tag };
  }
  return content[equals] === "=" ? { kind: "loose", tag } : TAG_MALFORMED;
}

/** The strict walk, WITH the §3.6 hidden escalation. A REGISTERED hidden name capped at the
 *  general bound is re-walked at `MAX_HIDDEN_TAG_SCAN` before any verdict, so an oversized-but-well-formed
 *  `<lie …/>` is recognised (and therefore stripped from members, and counted by `hadHidden`) instead of
 *  released verbatim. Still capped past the hidden bound ⇒ the verdict STAYS `capped`, and both callers
 *  conceal from the `<` rather than emitting it. A capped or truncated NON-hidden tag is literal text — it
 *  carries no secret, so cost wins there. */
function walkWithEscalation(content: string, start: number): TagScanOutcome {
  const bounded = walkSelfClosingTag(content, start, Math.min(content.length, start + MAX_TAG_SCAN));
  if (bounded.kind === "tag" || bounded.kind === "malformed") {
    return bounded;
  }
  if (!isHiddenTagName(bounded.tag)) {
    return TAG_MALFORMED;
  }
  return bounded.kind === "capped" ? walkSelfClosingTag(content, start, Math.min(content.length, start + MAX_HIDDEN_TAG_SCAN)) : bounded;
}

/** THE ONE VERDICT ON A `<`, read by the commit strip, the stream's hold and the render grammar alike. Each reader may
 *  only decide what its verdict MEANS for it, never re-derive it, which is what keeps the stream and the strip agreed. */
function scanSelfClosingTag(content: string, start: number): TagScanOutcome {
  const strict = walkWithEscalation(content, start);
  return strict.kind === "malformed" ? scanLooseHiddenOpen(content, start) : strict;
}

const BROKEN_HIDDEN_POSTURES = ["literal", "body"] as const;
/** How a reader treats an unclosed or loose hidden open. `literal` is the render and wire grammar. `body` is the hidden
 *  scan. */
type BrokenHiddenPosture = (typeof BROKEN_HIDDEN_POSTURES)[number];

/** Does this verdict conceal the rest of its text? An over-cap open does for every reader. */
function concealsRest(outcome: TagScanOutcome, posture: BrokenHiddenPosture): outcome is Extract<TagScanOutcome, { kind: "capped" | "truncated" | "loose" }> {
  return outcome.kind === "capped" || (posture === "body" && (outcome.kind === "truncated" || outcome.kind === "loose"));
}

/** One hidden tag's byte range in a body. */
export interface HiddenRun {
  readonly start: number;
  readonly end: number;
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
    // A fence-open line is walked to its own end, so `truncated` here means an unterminated quote on the
    // line — not-a-directive-open exactly like malformed bytes (the hidden-tag scan cap leaves the fence grammar unchanged).
    if (pair.kind !== "pair") {
      return lenient && FENCE_OPEN_TAG_CLOSE_RE.test(rest.slice(i)) ? attrs : null;
    }
    attrs[pair.key] = pair.value;
    i = pair.end;
  }
}

// ── The line-anchored structural pass (fences + code-fence exclusion + the lenient arm) ──────────────────

// The lookahead pins the name to its longest run, so a line that fails on the tail never retries shorter names.
const FENCE_OPEN_RE = /^:::([A-Za-z][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])(.*)$/;
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
  return isElementMajorityCount(nonEmpty.length, nonEmpty.filter((l) => TAGGED_LINE_RE.test(l)).length, minLines);
}

function isElementMajorityCount(nonEmpty: number, tagged: number, minLines: number): boolean {
  return nonEmpty >= minLines && tagged * 2 > nonEmpty;
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

/** One lenient run, read once: its first line, the index past its last line, and for each of its lines the counts of
 *  non-empty and tagged lines from that line to the run's end, which the majority test reads. */
interface LenientRun {
  readonly from: number;
  readonly end: number;
  readonly nonEmpty: readonly number[];
  readonly tagged: readonly number[];
}

// The lenient run from line `i`. A blank or code-fence line ends it, unless it is a raw-text element's text, and that
// text is left out of the counts. A run started from any of its later lines ends at the same line and counts a suffix
// of the same lines, so the run is read once and every opening line inside it reads its counts from the memo: a run
// that fails the majority test is not rescanned for each opener in it.
function lenientRunFrom(env: ScanEnv, i: number, covering: (offset: number) => RawTextElement | undefined): LenientRun {
  const held = env.lenientRun.current;
  if (held !== undefined && held.from <= i && i < held.end) {
    return held;
  }
  const flags: { readonly nonEmpty: boolean; readonly tagged: boolean }[] = [];
  let j = i;
  for (let line = env.lines[j]; line !== undefined; line = env.lines[j]) {
    const t = matchText(line);
    const inside = covering(line.start) !== undefined;
    if (!inside && (t.trim().length === 0 || t.startsWith(CODE_FENCE_MARK))) {
      break;
    }
    const counted = !inside && line.text.trim().length > 0;
    flags.push({ nonEmpty: counted, tagged: counted && TAGGED_LINE_RE.test(line.text) });
    j += 1;
  }
  const run: LenientRun = {
    from: i,
    end: j,
    nonEmpty: suffixCounts(flags.map((flag) => flag.nonEmpty)),
    tagged: suffixCounts(flags.map((flag) => flag.tagged)),
  };
  env.lenientRun.current = run;
  return run;
}

// For each index, how many of the flags from it to the end are set; one entry more, the empty suffix's zero.
function suffixCounts(flags: readonly boolean[]): readonly number[] {
  const counts = Array.from({ length: flags.length + 1 }, () => 0);
  for (let k = flags.length - 1; k >= 0; k -= 1) {
    counts[k] = (counts[k + 1] ?? 0) + (flags[k] === true ? 1 : 0);
  }
  return counts;
}

/** §4.8 naked-HTML arm: a contiguous ≥N-line element-majority run opening with a block-level tag. A `<style>` or
 *  `<script>` element is one unit of the run: a blank line inside one does not end it, and its own lines are not
 *  counted toward the majority. */
function tryLenientBlock(env: ScanEnv, i: number): BlockResult | null {
  const { content, lines } = env;
  const first = lines[i];
  if (first === undefined || !LENIENT_BLOCK_OPEN_RE.test(matchText(first))) {
    return null;
  }
  const covering = rawTextCursor(env.rawText, firstRawTextEndingAfter(env.rawText, first.start));
  // A tag line inside a stylesheet or script is its text, not a block.
  if (covering(first.start) !== undefined) {
    return null;
  }
  const run = lenientRunFrom(env, i, covering);
  const j = run.end;
  const last = lines[j - 1];
  if (last === undefined || !isElementMajorityCount(run.nonEmpty[i - run.from] ?? 0, run.tagged[i - run.from] ?? 0, LENIENT_HTML_MIN_LINES)) {
    return null;
  }
  const runLines = sliceTexts(lines, i, j);
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
  /** The body's `<style>` and `<script>` elements; read only when the lenient arm is on, the one step that needs them. */
  readonly rawText: readonly RawTextElement[];
  /** The last lenient run read (`lenientRunFrom`), so its later opening lines do not read it again. */
  readonly lenientRun: { current: LenientRun | undefined };
}

// The index of the first element in `rawText` that ends after `offset`. Elements are in order, so a binary search: a
// lenient run per block line must not rescan every element before it.
function firstRawTextEndingAfter(rawText: readonly RawTextElement[], offset: number): number {
  let low = 0;
  let high = rawText.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((rawText[middle]?.end ?? Number.POSITIVE_INFINITY) > offset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
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
    const block = tryLenientBlock(env, i);
    if (block !== null) {
      return { ...block, inCode };
    }
  }
  return { pieces: linePiece(env.content, env.lines, i, true), next: i + 1, inCode };
}

/** The line walk: recognizes directive fences (balance-aware), excludes markdown code-fence regions from
 *  the new grammar, and (opt-in) runs the §4.8 lenient detection. Text is emitted as offset pieces so bytes
 *  are preserved exactly. */
function structuralPass(env: ScanEnv): Piece[] {
  const { lines } = env;
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

/** Classify a balanced self-closing tag: registered → hidden span; unregistered WITH attrs → the
 *  allowlist-strip class (`unknown-directive` — command-shaped); unregistered WITHOUT attrs (a `<br/>`, an
 *  `<hr/>`) → null = literal text (ordinary prose markup, never stripped). */
function classifyTag(scan: TagScan, raw: string): ContentSpan | null {
  if (isHiddenTagName(scan.tag)) {
    return { kind: "hidden", tag: scan.tag.toLowerCase(), attrs: scan.attrs, raw };
  }
  return scan.attrCount > 0 ? { kind: "unknown-directive", raw } : null;
}

type Expanded = { readonly kind: "text"; readonly text: string } | { readonly kind: "span"; readonly span: ContentSpan };

function scanTags(text: string, brokenHidden: BrokenHiddenPosture): Expanded[] {
  const out: Expanded[] = [];
  let last = 0;
  let i = text.indexOf("<");
  while (i !== -1) {
    const outcome = scanSelfClosingTag(text, i);
    // FAIL-CLOSED: a registered hidden open too long to parse, or unclosed or loose on the hidden scan, cannot
    // be literal text — that is the `truth` attr reaching the member verbatim — so it becomes ONE hidden span running
    // to the end of this text run. The member strip drops it and `hadHidden` stops lying. Its attrs are deliberately
    // empty: nothing here is a trustworthy parse of the whole tag.
    //
    // WHAT THE HOST GETS, stated exactly (an earlier note here overclaimed it). `raw` carries the
    // bytes, but the rpg reveal's wire shape (`RpgRevealedSpan`) projects only the registry's LABELLED
    // FIELDS and has no `raw`, so the host sees a labelled-but-empty reveal row on that message — "something
    // was concealed here" — and NOT the bytes. That is deliberate: the host already read those bytes
    // verbatim in the live stream (the scrubber is member-only), and re-shipping an unparseable ≥16 KiB blob
    // to a panel buys no decision. An all-empty span is also excluded from the STANDING-LIE inventory
    // (`domain/rpg/substrate/reveal.ts`) — a lie with no character and no truth cannot stand.
    if (concealsRest(outcome, brokenHidden)) {
      if (i > last) {
        out.push({ kind: "text", text: text.slice(last, i) });
      }
      out.push({ kind: "span", span: { kind: "hidden", tag: outcome.tag.toLowerCase(), attrs: {}, raw: text.slice(i) } });
      return out;
    }
    const span = outcome.kind === "tag" ? classifyTag(outcome.scan, text.slice(i, outcome.scan.end)) : null;
    // SECURITY: on the hidden scan only a hidden tag owns its bytes. Another tag's quoted value is text a member receives,
    // so a tag inside it, and a close that lands inside a hidden tag's value, are read like any others (D285).
    if (outcome.kind !== "tag" || span === null || (brokenHidden === "body" && span.kind !== "hidden")) {
      i = text.indexOf("<", i + 1);
      continue;
    }
    if (i > last) {
      out.push({ kind: "text", text: text.slice(last, i) });
    }
    out.push({ kind: "span", span });
    last = outcome.scan.end;
    i = text.indexOf("<", outcome.scan.end);
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

// Body stamps are authored text, not proof that a server roll occurred. Preserve their original bytes.
const DICE_ONLY_RE = /(?<!\\)\[dice: ((?:[^[\]\r\n]* )?\d*d\d+(?:[+-]\d+)?) → (-?\d+)\]/g;

interface StampMatch {
  readonly index: number;
  readonly raw: string;
  /** Only a dice stamp carries these; a code span is matched to be skipped. */
  readonly stamp: { readonly label: string; readonly total: string } | undefined;
}

interface TickRuns {
  readonly starts: number[];
  readonly lengths: number[];
  /** `suffixMax[i]` = the longest run among `i` and every run after it. */
  readonly suffixMax: number[];
}

function tickRunsOf(text: string): TickRuns {
  const starts: number[] = [];
  const lengths: number[] = [];
  for (let at = text.indexOf("`"); at !== -1; ) {
    let end = at;
    while (text.charAt(end) === "`") {
      end += 1;
    }
    starts.push(at);
    lengths.push(end - at);
    at = text.indexOf("`", end);
  }
  const suffixMax = lengths.map(() => 0);
  for (let i = lengths.length - 1; i >= 0; i -= 1) {
    suffixMax[i] = Math.max(lengths[i] ?? 0, suffixMax[i + 1] ?? 0);
  }
  return { starts, lengths, suffixMax };
}

// The end of the inline code span that opens at the tick `at`, or -1. An opener of n ticks closes on the same
// number of ticks, and a shorter opener is tried when the full one finds no closer, so the longest working opener
// has a closed form: k = max(floor(n / 2), min(n, longest later run)). Its closer is the opener's own second half
// when n >= 2k, else the first later run of at least k ticks. Re-scanning the body once per candidate opener goes
// quadratic on a long tick run.
function codeSpanEnd(runs: TickRuns, runIndex: number, at: number): number {
  const runEnd = (runs.starts[runIndex] ?? 0) + (runs.lengths[runIndex] ?? 0);
  const n = runEnd - at;
  const self = Math.floor(n / 2);
  const later = Math.min(n, runs.suffixMax[runIndex + 1] ?? 0);
  if (self >= later) {
    return self === 0 ? -1 : at + 2 * self;
  }
  for (let i = runIndex + 1; i < runs.starts.length; i += 1) {
    if ((runs.lengths[i] ?? 0) >= later) {
      return (runs.starts[i] ?? 0) + later;
    }
  }
  return -1;
}

function execDice(text: string, from: number): RegExpExecArray | null {
  DICE_ONLY_RE.lastIndex = from;
  return DICE_ONLY_RE.exec(text);
}

function runIndexAt(runs: TickRuns, from: number, tick: number): number {
  let index = from;
  while ((runs.starts[index] ?? 0) + (runs.lengths[index] ?? 0) <= tick) {
    index += 1;
  }
  return index;
}

// The offset of the first tick at or after an offset asked in rising order, or -1. Each search is kept until the read
// passes it, so a body with no tick is searched once, not once per stamp.
function nextTickCursor(text: string): (from: number) => number {
  let tick = Number.NEGATIVE_INFINITY;
  return (from) => {
    if (tick !== -1 && tick < from) {
      tick = text.indexOf("`", from);
    }
    return tick;
  };
}

// Every code span and dice stamp in the text, left to right: the matches one pattern of "code span or stamp" would yield.
function* stampMatches(text: string): Generator<StampMatch> {
  const runs = tickRunsOf(text);
  let runIndex = 0;
  let pos = 0;
  let dice: RegExpExecArray | null | undefined;
  const nextTick = nextTickCursor(text);
  for (;;) {
    const tick = nextTick(pos);
    if (dice === undefined || (dice !== null && dice.index < pos)) {
      dice = execDice(text, pos);
    }
    if (dice !== null && (tick === -1 || dice.index < tick)) {
      const [raw, label, total] = dice;
      yield { index: dice.index, raw, stamp: { label: label ?? "", total: total ?? "" } };
      pos = dice.index + raw.length;
      continue;
    }
    if (tick === -1) {
      return;
    }
    runIndex = runIndexAt(runs, runIndex, tick);
    const end = codeSpanEnd(runs, runIndex, tick);
    if (end === -1) {
      pos = tick + 1;
      continue;
    }
    yield { index: tick, raw: text.slice(tick, end), stamp: undefined };
    pos = end;
  }
}

function scanDiceStamps(text: string): Expanded[] {
  const out: Expanded[] = [];
  let last = 0;
  for (const match of stampMatches(text)) {
    const label = match.stamp?.label;
    const total = Number(match.stamp?.total);
    if (label === undefined || !Number.isSafeInteger(total)) {
      continue;
    }
    if (match.index > last) {
      out.push({ kind: "text", text: text.slice(last, match.index) });
    }
    out.push({ kind: "span", span: { kind: "dice", label, total, raw: match.raw } });
    last = match.index + match.raw.length;
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last) });
  }
  return out;
}

function appendAll<T>(into: T[], items: readonly T[]): void {
  for (const item of items) {
    into.push(item);
  }
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
      // Appended one by one: a body of many tags makes more parts than a spread call can pass.
      for (const part of scanTags(text, "literal")) {
        appendAll(expanded, part.kind === "text" ? scanDiceStamps(part.text) : [part]);
      }
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
  const lenient = options?.lenientHtml === true;
  const env: ScanEnv = {
    content,
    lines: splitLines(content),
    lenient,
    committed: options?.committed === true,
    rawText: lenient ? rawTextElements(content) : [],
    lenientRun: { current: undefined },
  };
  const expanded = expandPieces(content, structuralPass(env));
  const spans: ContentSpan[] = [];
  let pending = "";
  const flush = (): void => {
    if (pending.length > 0) {
      appendAll(spans, tokenizeImages(pending));
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

/** The distinct `asset:<id>` image refs a stored body cites, first-seen order. It reads the committed grammar
 *  the transcript renders and the model wire converts, so an image an EOF-closed card swallowed is no ref here. */
export function assetIdsInContent(content: string): AssetId[] {
  return [
    ...new Set(tokenizeContent(content, { committed: true }).flatMap((span) => (span.kind === "image" && span.ref.kind === "asset" ? [span.ref.assetId] : []))),
  ];
}

/** `content` with each `asset:<id>` image ref that `relink` names pointed at its new id. Reads the same
 *  committed grammar as {@link assetIdsInContent} and re-emits every other span byte-for-byte. */
export function relinkContentAssets(content: string, relink: ReadonlyMap<AssetId, AssetId>): string {
  if (relink.size === 0) {
    return content;
  }
  return tokenizeContent(content, { committed: true })
    .map((span) => {
      if (span.kind !== "image" || span.ref.kind !== "asset") {
        return contentSpanRaw(span);
      }
      const to = relink.get(span.ref.assetId);
      return contentSpanRaw(to === undefined ? span : { ...span, ref: { kind: "asset", assetId: to } });
    })
    .join("");
}

/** One hidden-class span — the §3.6 secret carrier. Named here so the strip, the host-reveal projection, and
 *  any future hidden-channel consumer share ONE spelling instead of re-`Extract`ing the union member. */
export type HiddenContentSpan = Extract<ContentSpan, { kind: "hidden" }>;

/** One pass of THE §3.6 HIDDEN SCAN: the tag walker over the whole text, and nothing else. No directive fence swallows a
 *  tag into an opaque `raw`, no code block leaves one literal, no other tag shelters one in a quoted value, and no line
 *  split cuts one in two, so the strip, the reveal and the stream all read one grammar. SECURITY: the render grammar's
 *  fence rules are a question of how a reader sees a document, and a member must never receive these bytes however a
 *  document reads. */
function scanHiddenLayer(text: string): LocatedHiddenSpan[] {
  let cursor = 0;
  return scanTags(text, "body").flatMap((part) => {
    const start = cursor;
    cursor += part.kind === "text" ? part.text.length : contentSpanRaw(part.span).length;
    return part.kind === "span" && part.span.kind === "hidden" ? [{ start, end: cursor, span: part.span }] : [];
  });
}

/** The MEMBER-STRIP primitive (§3.6 — the trust boundary's pure half): removes ONLY `hidden`-class spans
 *  from a body, byte-preserving everything else (fence bytes included — a stripped card or code block keeps its fence).
 *  A body with no hidden spans returns the ORIGINAL string (identity — the common case is free). A registered
 *  name followed by no `name=` shape is prose and is NOT stripped (the D51 posture). An UNCLOSED open, and a LOOSE one
 *  whose `name=` shape breaks the strict grammar, ARE stripped, to the end of the body (D285; see
 *  {@link scanSelfClosingTag}). `unknown-directive` spans are NOT stripped here — they are display noise, not secrets,
 *  and the transcript payload stays honest. */
export function stripHiddenSpans(content: string): { readonly content: string; readonly hadHidden: boolean } {
  const projected = projectHiddenSpans(content, []);
  return { content: projected.content, hadHidden: projected.hadHidden };
}

// Keys are stripped as well as values: a tool payload's keys are whatever the model wrote. Two keys that strip to one
// name collapse, the later winning, as a repeated JSON key does.
function stripHiddenInJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return stripHiddenSpans(value).content;
  }
  if (Array.isArray(value)) {
    return value.map(stripHiddenInJsonValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [stripHiddenSpans(key).content, stripHiddenInJsonValue(entry)]));
  }
  return value;
}

/** The member bytes of one JSON text: decoded, every key and string value stripped with {@link stripHiddenSpans}, then
 *  re-encoded. `undefined` when the text is not JSON; each caller decides what an unreadable payload shows.
 *
 *  @remarks Decoded first because a tag inside a JSON string has escaped quotes, which the strip reads as a broken tag
 *  and conceals to the end of the text, so the result would no longer parse. SECURITY: always the re-encoding, never the
 *  input text. A repeated key decodes to its last value, so a tag in a shadowed value, literal or escaped, is in the
 *  text but not in the decode, and only the re-encoding drops it. */
export function stripHiddenSpansInJsonText(text: string): string | undefined {
  const decoded = parseJsonText(text);
  return decoded === undefined ? undefined : JSON.stringify(stripHiddenInJsonValue(decoded));
}

/** How many passes the strip gives a body. SECURITY: removing a tag joins the bytes around it, and those bytes can spell a
 *  new tag, so one pass is not final. Repeating until clean is quadratic on a deep nest, so the passes are capped and a
 *  nest past the cap conceals the rest of the body. It never releases it. */
const MAX_HIDDEN_PASSES = 8;

interface LocatedHiddenSpan extends HiddenRun {
  readonly span: HiddenContentSpan;
}

/** A pass's text, and for each of its characters that character's index in the original body. */
interface SurvivingText {
  readonly text: string;
  readonly origin: readonly number[];
}

function originOf(text: string): readonly number[] {
  return Array.from({ length: text.length }, (_, index) => index);
}

function dropRuns({ text, origin }: SurvivingText, runs: readonly HiddenRun[]): SurvivingText {
  const kept: string[] = [];
  const keptOrigin: number[] = [];
  let cursor = 0;
  for (const { start, end } of [...runs, { start: text.length, end: text.length }]) {
    kept.push(text.slice(cursor, start));
    for (let at = cursor; at < start; at += 1) {
      keptOrigin.push(origin[at] ?? 0);
    }
    cursor = end;
  }
  return { text: kept.join(""), origin: keptOrigin };
}

/** Does a removal fall inside this span or right after it? Only then is it new: the first pass saw every other open
 *  followed by bytes and read it as prose. Right after counts, because removing a tag that ends the body leaves the open
 *  in front of it unclosed. */
function touchesRemoval({ start, end }: HiddenRun, origin: readonly number[], joinableEnd: number): boolean {
  return (origin[end] ?? joinableEnd) - (origin[start] ?? 0) !== end - start;
}

/** Where the joinable bytes stop once `layer` goes: a span concealed to the end leaves nothing behind it to rejoin, so
 *  the prose in front of it ends the body, and a tag removed from the end does not. */
function joinableEndAfter(layer: readonly LocatedHiddenSpan[], { text, origin }: SurvivingText, current: number): number {
  const last = layer.at(-1);
  return last !== undefined && last.end === text.length && scanSelfClosingTag(last.span.raw, 0).kind !== "tag" ? (origin[last.start] ?? current) : current;
}

/** Every span the strip removes, in original positions: THE ONE ANSWER the strip, the reveal, the ranges and the position
 *  projection all read. */
function hiddenSpansToFixpoint(content: string): readonly LocatedHiddenSpan[] {
  const first = scanHiddenLayer(content);
  if (first.length === 0) {
    return first;
  }
  const found = [...first];
  let body: SurvivingText = { text: content, origin: originOf(content) };
  let layer = first;
  let joinableEnd = content.length;
  for (let pass = 1; ; pass += 1) {
    joinableEnd = joinableEndAfter(layer, body, joinableEnd);
    body = dropRuns(body, layer);
    const { text, origin } = body;
    const stop = joinableEnd;
    layer = scanHiddenLayer(text).filter((span) => touchesRemoval(span, origin, stop));
    const next = layer[0];
    if (next === undefined) {
      return found;
    }
    if (pass === MAX_HIDDEN_PASSES) {
      const span: HiddenContentSpan = { kind: "hidden", tag: next.span.tag, attrs: {}, raw: text.slice(next.start) };
      return [...found, { start: origin[next.start] ?? 0, end: content.length, span }];
    }
    appendAll(
      found,
      layer.map(({ start, end, span }) => ({ start: origin[start] ?? 0, end: (origin[end - 1] ?? 0) + 1, span })),
    );
  }
}

function mergedRuns(spans: readonly HiddenRun[]): readonly HiddenRun[] {
  const merged: HiddenRun[] = [];
  for (const { start, end } of spans.toSorted((left, right) => left.start - right.start)) {
    const last = merged.at(-1);
    if (last !== undefined && start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, end) };
    } else {
      merged.push({ start, end });
    }
  }
  return merged;
}

/** The byte ranges {@link stripHiddenSpans} removes from `content`, ascending and disjoint. SECURITY: text spliced into one
 *  of these can break the tag into prose and hand its bytes to a member, so a writer places text outside them. */
export function hiddenSpanRanges(content: string): readonly HiddenRun[] {
  return mergedRuns(hiddenSpansToFixpoint(content));
}

/** Project positions with the whole-body strip: positions inside a removed span collapse to its visible start. */
export function projectHiddenSpans(
  content: string,
  offsets: readonly number[],
): { readonly content: string; readonly hadHidden: boolean; readonly offsets: readonly number[] } {
  const removed = hiddenSpanRanges(content);
  if (removed.length === 0) {
    return { content, hadHidden: false, offsets };
  }
  return {
    content: dropRuns({ text: content, origin: [] }, removed).text,
    hadHidden: true,
    offsets: offsets.map((offset) => offset - removed.reduce((count, span) => count + Math.max(0, Math.min(offset, span.end) - span.start), 0)),
  };
}

/** Did the strip lose the rest of this body to a hidden tag? A tag left unfinished counts unless `cutOff` says the output
 *  stopped there: it runs to the end of the body, so it is the cut itself and nothing was written after it. Every other
 *  conceal counts always, because bytes after it were lost: a tag that broke the grammar, a tag past the scan bound, and
 *  a nest past the pass bound (a span whose raw outruns its tag). A tool loop keeps only its last finish reason, so
 *  `cutOff` can describe a later step than the one that wrote the tag. */
export function concealsBrokenHiddenTag(content: string, cutOff: boolean): boolean {
  return scanHiddenSpans(content).some((span) => {
    const verdict = scanSelfClosingTag(span.raw, 0);
    if (verdict.kind === "truncated") {
      return !cutOff;
    }
    return verdict.kind !== "tag" || verdict.scan.end < span.raw.length;
  });
}

/** The STRIP'S TWIN (§3.6): every hidden-class span in a body, in document order — what the host-reveal eye
 *  shows and what {@link stripHiddenSpans} removes, from the ONE fixpoint above. A reveal built on the plain
 *  `tokenizeContent` grammar would miss exactly the spans a fence hides, which is how the host lost in-card
 *  lies from their own standing inventory while members received them. */
export function scanHiddenSpans(content: string): readonly HiddenContentSpan[] {
  return hiddenSpansToFixpoint(content)
    .toSorted((left, right) => left.start - right.start)
    .map(({ span }) => span);
}

// ── The MID-STREAM member scrubber (§3.6 — the delta leak the at-commit strip can't reach) ────────────────
//
// The at-commit strip (`stripHiddenSpans`) runs on a WHOLE stored body; the live token stream hands a member
// raw model text char-by-char, so a `<lie truth="…"/>` leaks byte-by-byte BEFORE it commits (and then vanishes
// at commit — the worst kind of leak: visible only in the network trace, gone from the UI). This is a STATEFUL
// per-subscriber transform over the accumulating text channel: emit the maximal prefix PROVABLY free of a
// hidden tag (open OR in-progress), HOLD BACK any trailing run that could still grow into a hidden-tag open,
// and DROP any hidden tag that completes. FAIL-CLOSED by construction: an unclosed potential-open is withheld
// (mid-stream "unclosed" means "the close hasn't arrived yet"). A registered name that turns out to be prose is
// released: the hold asks {@link scanSelfClosingTag} the same question the commit strip asks, so the two agree.
// Allocation-sane: the held buffer is bounded by the hidden-tag scan and the fragment chain, and a run that outgrows the
// hidden-tag scan bound stops being buffered at all (it is CONCEALED — see below), never the whole ghost.

// THE OVER-CAP RUN (this replaces a force-RELEASE). A hold-back run that outgrows `MAX_HIDDEN_TAG_SCAN`
// is indeed model garbage rather than a keyed secret field — but "garbage" is a claim about the tag's SHAPE,
// never a licence to emit its bytes, and the bytes past `truth="` are the secret whatever their length. The
// old branch released the whole run, opening tag included, so a 4269-byte `<lie truth="…"/>` reached every
// non-host member verbatim and (because the tokenizer's own bound hid it too) committed with `hadHidden=false`.
// It also contradicted this section's own two rules: fail-closed on an unclosed potential-open, and drop at
// stream end. The anti-wedge property that branch was written for survives without it — the stream is never
// BLOCKED, it just stops carrying the concealed run, and the member's authoritative view is the at-commit
// strip either way (which now conceals the same run — one rule, both planes).

const LONGEST_HIDDEN_NAME = Math.max(...HIDDEN_TAGS.map((def) => def.tag.length));
// Bounds the fragments one hold reaches back through, because every later delta re-walks them.
const MAX_FRAGMENT_CHAIN = 256;

/** Does the buffer end inside what may yet be a hidden-tag NAME (`<`, `<l`, `<ofil`)? This covers only the bytes the
 *  tag scan cannot judge, because no complete name exists yet. Past the name, `scanSelfClosingTag` decides. */
function endsInsideHiddenName(text: string, lt: number): boolean {
  if (text.length - lt - 1 > LONGEST_HIDDEN_NAME) {
    return false;
  }
  const name = text.slice(lt + 1).toLowerCase();
  return HIDDEN_TAGS.some((d) => d.tag.startsWith(name));
}

/** Where a hold must start for an open forming at `lt`, and how many fragments it reaches back through. SECURITY: bytes
 *  ahead of the open may be the start of a tag that the open's removal will rejoin, and bytes once released cannot rejoin
 *  anything, so a member would read the far side of the tag. Past {@link MAX_FRAGMENT_CHAIN} the turn conceals. `floor` is
 *  the end of the last complete hidden tag: a `<` before it may sit inside that tag's quoted value, and a cut there splits
 *  the tag. */
function fragmentChain(text: string, lt: number, floor: number): { readonly from: number; readonly depth: number } {
  let from = lt;
  let depth = 0;
  while (from > 0 && depth <= MAX_FRAGMENT_CHAIN) {
    const previous = text.lastIndexOf("<", from - 1);
    if (previous < floor || !mayGrowIntoHiddenTag(text.slice(previous, from))) {
      break;
    }
    from = previous;
    depth += 1;
  }
  return { from, depth };
}

function mayGrowIntoHiddenTag(fragment: string): boolean {
  return scanSelfClosingTag(fragment, 0).kind === "truncated" || endsInsideHiddenName(fragment, 0);
}

/** Split accumulated text at `safe`; what follows it is held: the trailing run from the LEFTMOST `<` that begins a
 *  hidden-tag open which has NOT yet completed (quote-aware, via `scanSelfClosingTag` — so a `<` or a `/>` inside
 *  a quoted attr value never mis-splits the tag). Everything before that `<` is `safe`. When no in-progress
 *  hidden open exists, the whole buffer is safe. FAIL-CLOSED: once a hidden open may have begun, the ENTIRE run
 *  from its `<` is held until the tag scan gives a verdict — a `<` inside its attr value can never
 *  release the enclosing tag's prefix (the D106 leak the rightmost-cut logic had). Past the hidden scan bound
 *  the run turns `conceal`: it can never complete inside the bound, so it can never be released, and holding
 *  it further only re-walks a growing buffer — the scrubber stops emitting for the rest of the turn.
 *
 *  (The `StreamCut` type below carries that second verdict; the walk itself is `cutAtIncompleteOpen`.) */
interface StreamCut {
  readonly kind: "cut" | "conceal";
  readonly safe: string;
}

/** The split itself — the walk whose two verdicts {@link StreamCut} names (documented in full above it). */
function cutAtIncompleteOpen(text: string): StreamCut {
  let lt = text.indexOf("<");
  let floor = 0;
  while (lt !== -1) {
    // A COMPLETE hidden tag is consumed WHOLE: skip PAST its `/>` so an inner `<` in its attr value is never mistaken for
    // a new open (the D106 mid-stream leak), and `settleDelta` drops it from the released `safe` prefix. Any other complete
    // tag owns nothing, as on the strip: a tag inside its quoted value is still a tag (D285).
    const outcome = scanSelfClosingTag(text, lt);
    if (outcome.kind === "tag") {
      if (isHiddenTagName(outcome.scan.tag)) {
        floor = outcome.scan.end;
        lt = text.indexOf("<", floor);
      } else {
        lt = text.indexOf("<", lt + 1);
      }
      continue;
    }
    // Not a complete tag. A hidden open whose close hasn't arrived, or a name still arriving, HOLDS the whole run
    // from here (fail-closed).
    if (outcome.kind === "truncated" || endsInsideHiddenName(text, lt)) {
      const { from, depth } = fragmentChain(text, lt, floor);
      return { kind: depth > MAX_FRAGMENT_CHAIN ? "conceal" : "cut", safe: text.slice(0, from) };
    }
    // A REGISTERED hidden open the commit strip conceals to the end: the stream conceals it the same way.
    if (concealsRest(outcome, "body")) {
      return { kind: "conceal", safe: text.slice(0, fragmentChain(text, lt, floor).from) };
    }
    // A `malformed` verdict is prose on both planes, so it passes.
    lt = text.indexOf("<", lt + 1);
  }
  return { kind: "cut", safe: text };
}

/** One delta's verdict: what a member may read now, what waits for more bytes, and whether the rest of the turn conceals.
 *  A removal joins the bytes around it, so what it leaves is cut again before any of it is emitted. The hold keeps the RAW
 *  bytes, removed tags included, so a later delta and the flush read the seams the commit strip reads. `safe` never ends
 *  on an unfinished open, because {@link fragmentChain} holds those. An open that only a removal exposed holds rather
 *  than ends the turn: the bytes that would complete it may still be arriving behind a tag the same pass removes. */
function settleDelta(buffer: string): { readonly emit: string; readonly held: string; readonly concealing: boolean } {
  let rest: SurvivingText = { text: buffer, origin: originOf(buffer) };
  // One pass past the cap, which only confirms: the commit strip's cap counts removals.
  for (let pass = 0; pass <= MAX_HIDDEN_PASSES; pass += 1) {
    const cut = cutAtIncompleteOpen(rest.text);
    // `safe` may contain COMPLETE hidden tags (a `<lie …/>` that finished this tick).
    const terminal = cut.kind === "conceal" && pass === 0;
    const removed = !terminal && cut.safe.length > 0 ? scanHiddenLayer(cut.safe) : [];
    if (terminal) {
      return { emit: stripHiddenSpans(buffer).content, held: "", concealing: true };
    }
    if (removed.length === 0) {
      const held = buffer.slice(rest.origin[cut.safe.length] ?? buffer.length);
      // Every later delta re-walks the hold, so the removed tags it keeps cost as much as the bytes it is waiting on.
      const overflow = held.length > MAX_HIDDEN_TAG_SCAN || held.length - (rest.text.length - cut.safe.length) > MAX_TAG_SCAN;
      return { emit: cut.safe, held: overflow ? "" : held, concealing: overflow };
    }
    rest = dropRuns(rest, removed);
  }
  return { emit: stripHiddenSpans(buffer).content, held: "", concealing: true };
}

/** A stateful per-subscriber scrubber over ONE turn's text-delta stream (§3.6). Feed each delta's text; get
 *  back the bytes safe to emit to a NON-HOST member (complete hidden tags removed, in-progress opens withheld).
 *  Call {@link HiddenSpanStreamScrubber.flush} at turn end to settle the held tail by the commit strip's own verdict
 *  (an unclosed hidden open is DROPPED, and a name that never grew into one is released). ONE scrubber per
 *  subscriber per turn; a host subscriber never constructs one (they read the stream verbatim). */
export interface HiddenSpanStreamScrubber {
  /** Feed a text-channel delta; returns the substring safe to forward to the member this tick (may be `""`).
   *  Once an over-cap hidden open is seen this returns `""` for the rest of the turn — the run cannot
   *  be parsed and must not be released, and the member's committed view conceals the same bytes. */
  readonly push: (text: string) => string;
  /** Turn/stream end: no more bytes are coming, so the held tail takes the commit strip's verdict. */
  readonly flush: () => string;
}

export function createHiddenSpanStreamScrubber(): HiddenSpanStreamScrubber {
  let held = "";
  // Terminal for the turn once set: an over-cap hidden open has no close we are willing to look for, so every
  // later byte of this stream is potentially still inside its attr value. Fail-closed beats clever.
  let concealing = false;
  return {
    push(text: string): string {
      if (concealing) {
        return "";
      }
      const settled = settleDelta(held + text);
      held = settled.held;
      concealing = settled.concealing;
      return settled.emit;
    },
    flush(): string {
      const tail = held;
      held = "";
      return stripHiddenSpans(tail).content;
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
// THE TWO CARD ARMS ARE THE §4.5 TRUST LINE, MADE STRUCTURAL (the granularity fix). A card
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

// ── The STYLED REPLY hold (D354 — a display-styled reply outside its frame) ─────────────────────────────────
//
// A reply a display script styled draws in its card frame (D354). Until the frame is routed, the row shows the text
// split the way the ghost card scan splits a card: prose as text, and an HTML block as a forming chip that carries NO
// bytes, so a renderer cannot paint a template's markup or its CSS even by mistake. While the frame is on the way the
// split runs on the display output; while the reply streams no display script runs, so it runs on the model's own
// text, whose tags are what the scripts turn into panels, and the prose drops its inline tags ({@link stripTags}).
//
// A styled region is recognized by its markdown block shape, not by provenance (later scripts' lookbehinds and capture
// echoes lose provenance, D354). An HTML block opens where CommonMark's does: a raw-text element (`pre`, `script`,
// `style`, `textarea`), a comment, a block-level tag line, or a lone complete tag line. The tag name may be a preset's
// own (`sola_hud`, `copper:bite`), which CommonMark would print as text. The block is held to the end of the element
// it opens, blank lines included, because a script that turns the element into a panel, or hides or deletes it,
// transforms all of it: a region the finished reply hides must never show while it forms. An element whose close has
// not arrived is held to the end of the text. A block whose opening line closes or opens no element (a close tag, a
// self-closing or void tag, an element closed on its own line) ends at the next blank line, as CommonMark's does.
//
// A `<style>` or `<script>` element is ONE UNIT wherever it opens on a line ({@link rawTextElements}): HTML reads its
// text raw to its close, so no blank line, tag or comment inside it ends a block or opens one. A block ends past the
// close of every such element it opens, and the lines of one opened inside a paragraph stay that paragraph, which the
// strip below then removes whole. Every splitter here reads them from the one reader, `readMarkup`.
//
// Inline markup in a paragraph streams as the paragraph through the inert allowlist, which drops its attributes and
// keeps its text; an inline `<style>` or `<script>` element is removed with its content first, because the allowlist
// would keep that content as prose. A tag still arriving on the last line is held as forming markup, so a half-written
// tag never prints.
//
// The text arm is not immutable under append the way a closed card is: a paragraph's tail can still change. It needs
// no such proof, because it only ever carries bytes the inert allowlist renders anyway; the bytes the trust line keeps
// off the row are the markup arm's, and that arm carries none.

/** One segment of a styled reply shown outside its frame: prose for the inert path, or an HTML block, held. */
export type StyledHoldSegment = { readonly kind: "text"; readonly text: string } | { readonly kind: "forming-markup" };

const RAW_TEXT_BLOCK_RE = /^ {0,3}<(pre|script|style|textarea)(?=[\s>]|$)/i;
const COMMENT_BLOCK_OPEN = "<!--";
const COMMENT_BLOCK_CLOSE = "-->";
// CommonMark's block-level tag names: a line opening with one starts an HTML block, even inside a paragraph.
const BLOCK_TAG_LINE_RE =
  /^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s/>]|$)/i;
// Any indent: markdown would print a tag line indented as code as raw source, so the hold takes it as markup.
const TAG_NAME_START_RE = /^ *<\/?[A-Za-z][\w:.-]*/;
// An opening tag at the start of a line, with its name; `[\w.-]` keeps a prefixed name's part before its `:` apart.
const OPEN_TAG_LINE_RE = /^ *<([A-Za-z][\w.-]*)(?::[\w:.-]*)?(?=[\s/>]|$)/;
// HTML's void elements: their tag opens no element, so nothing closes them.
const VOID_TAG_NAMES: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
/** One `<style>` or `<script>` element: offsets of its `<`, its text, and just past its close's `>`. An element whose
 *  close has not arrived runs to the end of the text. */
export interface RawTextElement {
  readonly name: RawTextName;
  readonly start: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly end: number;
  readonly closed: boolean;
}

// The elements whose text HTML reads raw to their close, each with that close as HTML's tokenizer ends raw text: the
// name in any case, then a space, `/`, `>` or the end.
const RAW_TEXT_CLOSE_RES = { script: /<\/script(?=[\s/>]|$)/gi, style: /<\/style(?=[\s/>]|$)/gi } as const;
type RawTextName = keyof typeof RAW_TEXT_CLOSE_RES;

function isRawTextName(name: string): name is RawTextName {
  return Object.hasOwn(RAW_TEXT_CLOSE_RES, name);
}

/** Every `<style>` and `<script>` element in `content`, in order, as HTML reads them (see {@link readMarkup}). */
export function rawTextElements(content: string): readonly RawTextElement[] {
  return readMarkup(content).rawText;
}

/** One stylesheet a reply draws: its `media` and `title` attributes, when it has them, and its text. */
export interface FrameStyleSheet {
  readonly media: string | undefined;
  readonly title: string | undefined;
  readonly css: string;
}

// One attribute of a tag, from just past the tag's name, as HTML's tokenizer splits them: its name, then its value,
// quoted either way, bare, or absent.
const TAG_ATTRIBUTE_RE = /[\s/]*([^\s/>][^\s/>=]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;
const STYLE_OPENER_NAME_LENGTH = "<style".length;
const CSS_TYPE = "text/css";

// The attributes of a `<style ...>` opener the reader already bounded, each name lower case, the first of a repeated
// name kept as HTML keeps it. One pass over the opener.
function styleOpenerAttributes(opener: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  TAG_ATTRIBUTE_RE.lastIndex = STYLE_OPENER_NAME_LENGTH;
  for (let found = TAG_ATTRIBUTE_RE.exec(opener); found !== null; found = TAG_ATTRIBUTE_RE.exec(opener)) {
    const name = found[1]?.toLowerCase() ?? "";
    if (!attributes.has(name)) {
      attributes.set(name, found[2] ?? found[3] ?? found[4] ?? "");
    }
  }
  return attributes;
}

/** Each closed `<style>` element a Markdown renderer draws from `content` (see {@link liftRawTextBodies}), in order:
 *  the stylesheets every other frame of the same reply carries too. A sample shown as code is not one, nor is a style
 *  element whose `type` names something other than CSS, which a browser does not apply. Only the text, `media` and
 *  `title` are kept, so a carried copy runs no handler and repeats no id. */
export function frameStyleElements(content: string): readonly FrameStyleSheet[] {
  return markdownRawTextElements(content).flatMap((element) => {
    if (element.name !== "style" || !element.closed) {
      return [];
    }
    const attributes = styleOpenerAttributes(content.slice(element.start, element.bodyStart - 1));
    const type = attributes.get("type")?.trim().toLowerCase() ?? "";
    if (type !== "" && type !== CSS_TYPE) {
      return [];
    }
    return [{ media: attributes.get("media"), title: attributes.get("title"), css: content.slice(element.bodyStart, element.bodyEnd) }];
  });
}

/** `content` with the text of each closed `<style>` and `<script>` element a Markdown renderer reads as one replaced by
 *  `mark`, its index and `mark` again, and those texts in order: none in code, in a text element or behind an escape
 *  (see `readMarkup`). The tags stay, so a parser reads the same elements: the frame's Markdown lift, which a blank
 *  line inside an element must not cut. `mark` must be a character neither `content` nor any parse of it can hold. */
export function liftRawTextBodies(content: string, mark: string): { readonly text: string; readonly bodies: readonly string[] } {
  const bodies: string[] = [];
  let text = "";
  let from = 0;
  for (const element of markdownRawTextElements(content)) {
    if (!element.closed || element.bodyEnd === element.bodyStart) {
      continue;
    }
    text += `${content.slice(from, element.bodyStart)}${mark}${String(bodies.length)}${mark}`;
    bodies.push(content.slice(element.bodyStart, element.bodyEnd));
    from = element.bodyEnd;
  }
  return { text: text + content.slice(from), bodies };
}

// The raw-text elements a Markdown renderer reads as elements, in order.
function markdownRawTextElements(content: string): readonly RawTextElement[] {
  return readMarkup(content, MARKDOWN_READING).rawText;
}

/** Where a text's inline units may run, as the code reader reads its blocks: a code span or a comment within one
 *  paragraph, or one HTML block. */
interface InlineBlocks {
  /** Ascending: the start of each line that does not continue a paragraph from the line before it. */
  readonly ends: readonly number[];
  /** Ascending and disjoint: each HTML block's lines, which hold no code span. */
  readonly html: readonly TextRange[];
}

// The paragraph ends and HTML blocks of `content`, read by the same line reader that finds its code, so one reading
// decides both where code is and where an inline unit may run.
function inlineBlocks(content: string): InlineBlocks {
  const state = codeLineState(true);
  const ends: number[] = [];
  const html: TextRange[] = [];
  for (const line of splitLines(content)) {
    readCodeLineKind(state, expandTabs(matchText(line)));
    if (!state.continues && line.start > 0) {
      ends.push(line.start);
    }
    const block = html.at(-1);
    if (state.inHtml === "inside" && block !== undefined) {
      html[html.length - 1] = { start: block.start, end: line.end };
    } else if (state.inHtml !== undefined) {
      html.push({ start: line.start, end: line.end });
    }
  }
  return { ends, html };
}

// Where a comment opening at an offset asked in rising order must close by: the end of the HTML block it opens in, or
// of its paragraph. A renderer reads each block's markup on its own, so a comment closed in a later block is no comment,
// and its `<!--` prints as text.
function commentBound(blocks: InlineBlocks): (offset: number) => number {
  const paragraphEnd = firstPast(blocks.ends);
  const htmlBlock = rangeCursor(blocks.html);
  return (offset) => htmlBlock(offset)?.end ?? paragraphEnd(offset);
}

// The first value of an ascending list past an offset asked in rising order; infinity when none is left.
function firstPast(values: readonly number[]): (offset: number) => number {
  let next = 0;
  return (offset) => {
    while ((values[next] ?? Number.POSITIVE_INFINITY) <= offset) {
      next += 1;
    }
    return values[next] ?? Number.POSITIVE_INFINITY;
  };
}

// The range of ascending, disjoint ranges that holds an offset asked in rising order, or undefined.
function rangeCursor(ranges: readonly TextRange[]): (offset: number) => TextRange | undefined {
  let next = 0;
  return (offset) => {
    while ((ranges[next]?.end ?? Number.POSITIVE_INFINITY) <= offset) {
      next += 1;
    }
    const range = ranges[next];
    return range !== undefined && range.start <= offset ? range : undefined;
  };
}

// Where the inline code span holding `offset` ends, asked in rising order, or undefined when none holds it. A span is
// CommonMark's: a tick run closed by the next run of the same length within its paragraph, and none opens in an HTML
// block, whose lines are HTML. Ticks before `readTo` were read as an element's text or a code block, so they open
// nothing. One pass: each run's closer is found from the right once.
function codeSpanCursor(content: string, blocks: InlineBlocks): (offset: number, readTo: number) => number | undefined {
  const runs = tickRunClosers(content);
  const paragraphEnd = firstPast(blocks.ends);
  const htmlBlock = rangeCursor(blocks.html);
  let run = 0;
  let spanEnd = 0;
  return (offset, readTo) => {
    spanEnd = Math.max(spanEnd, readTo);
    for (let at = runs[run]; at !== undefined && at.start < offset && spanEnd <= offset; at = runs[run]) {
      run += 1;
      const opens = at.start >= spanEnd && htmlBlock(at.start) === undefined;
      if (opens && at.closer !== undefined && at.closer.start < paragraphEnd(at.start)) {
        spanEnd = at.closer.end;
      }
    }
    return offset < spanEnd ? spanEnd : undefined;
  };
}

interface TickRun {
  readonly start: number;
  readonly end: number;
  /** The next run of the same length: the one that would close a code span this run opens. */
  closer: TickRun | undefined;
}

// Each run of ticks in `content` with its closer, found from the right in one pass.
function tickRunClosers(content: string): readonly TickRun[] {
  const runs: TickRun[] = [...content.matchAll(/`+/gu)].map((run) => ({ start: run.index, end: run.index + run[0].length, closer: undefined }));
  const lastOfLength = new Map<number, TickRun>();
  for (const run of runs.toReversed()) {
    run.closer = lastOfLength.get(run.end - run.start);
    lastOfLength.set(run.end - run.start, run);
  }
  return runs;
}

/** Removes every `<style>` and `<script>` element with its content; an element whose close has not arrived is removed
 *  to the end. The inert allowlist drops both tags but keeps their content as prose. Text is read as Markdown shows it
 *  (see {@link liftRawTextBodies}), so a sample shown as code or behind an escape stays as written. The strip runs to a
 *  fixpoint, since the pieces around a removed element can join into a new one (`<sty<style>x</style>le>`); past
 *  {@link MAX_HIDDEN_PASSES} passes it conceals from the first element still standing to the end. */
export function stripStyleElements(text: string): string {
  let kept = text;
  for (let pass = 0; pass < MAX_HIDDEN_PASSES; pass += 1) {
    const elements = markdownRawTextElements(kept);
    if (elements.length === 0) {
      return kept;
    }
    let stripped = "";
    let from = 0;
    for (const element of elements) {
      stripped += kept.slice(from, element.start);
      from = element.end;
    }
    kept = stripped + kept.slice(from);
  }
  return kept.slice(0, markdownRawTextElements(kept)[0]?.start ?? kept.length);
}

// Where the tag that opens at `lt` ends: the first `>` after it, outside a quoted attribute value, or -1 when it has not
// arrived. The line grammar reads a tag on its own line only; a raw-text opener is read across lines, as HTML reads it.
// One pass, so a long line costs its length.
function tagEndFrom(text: string, lt: number, onItsLine = true): number {
  let quote = "";
  for (let index = lt + 1; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "\n" && onItsLine) {
      return -1;
    }
    if (quote !== "") {
      quote = char === quote ? "" : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function tagEnd(line: string): number {
  return tagEndFrom(line, line.indexOf("<"));
}

const TAG_START_RE = /<\/?[A-Za-z]/g;
const TAG_OPENING_TAIL_RE = /<\/?$/;

/** Removes every tag and keeps the text between them: a stream's own markup, shown before the scripts that would
 *  turn it into a panel run. A tag whose `>` has not arrived on the last line is removed to the end, and so is a `<`
 *  or `</` that ends the text; elsewhere the
 *  rest of a line whose `<` never closes is prose and stays. A tag in a code block or an inline code span stays as
 *  written, as Markdown shows it. Run {@link stripStyleElements} first, or a style element's CSS stays as text. */
export function stripTags(text: string): string {
  let kept = "";
  let from = 0;
  // Past an unclosed `<` (or code), every later `<` before this offset is prose too: one failed scan per line keeps this
  // linear.
  let proseUntil = 0;
  const code = markdownCodeCursor(text, MARKDOWN_READING);
  let removed: ReadSpan | undefined;
  for (const start of text.matchAll(TAG_START_RE)) {
    const lt = start.index;
    if (lt < from || lt < proseUntil) {
      continue;
    }
    const shown = code(lt, removed);
    if (shown !== undefined) {
      proseUntil = shown;
      continue;
    }
    const end = tagEndFrom(text, lt);
    if (end === -1) {
      const newline = text.indexOf("\n", lt);
      if (newline === -1) {
        return kept + text.slice(from, lt);
      }
      proseUntil = newline;
      continue;
    }
    kept += text.slice(from, lt);
    from = end + 1;
    removed = { start: lt, end: from };
  }
  // A `<` or `</` that ends the text may still become a tag.
  return (kept + text.slice(from)).replace(TAG_OPENING_TAIL_RE, "");
}

// A line holding one complete open or close tag and nothing else (CommonMark's last HTML block kind).
function isLoneTagLine(line: string): boolean {
  if (!TAG_NAME_START_RE.test(line)) {
    return false;
  }
  const end = tagEnd(line);
  return end !== -1 && line.slice(end + 1).trim() === "";
}

// The element a line's opening tag opens: its `<` and the name a close repeats. None for a void or self-closing tag, or
// a tag whose `>` is not on its line.
function elementOpenedBy(opener: string): { readonly lt: number; readonly name: string } | undefined {
  const open = OPEN_TAG_LINE_RE.exec(opener);
  const name = open?.[1]?.toLowerCase();
  if (name === undefined || VOID_TAG_NAMES.has(name)) {
    return undefined;
  }
  const lt = opener.indexOf("<");
  const end = tagEndFrom(opener, lt);
  return end === -1 || opener.charAt(end - 1) === "/" ? undefined : { lt, name };
}

// A comment open, or an element tag: `/` for a close, then the name a close repeats, the part before any `:`
// (`<copper:bite>`, `</copper>`).
const MARKUP_TOKEN_SOURCE = String.raw`<!--|<(\/?)([A-Za-z][\w.-]*)(?::[\w:.-]*)?(?=[\s/>]|$)`;

interface MarkupRead {
  /** For each element opener's `<`, the offset just past the `>` of its close; an opener whose close has not arrived
   *  has no entry. */
  readonly closes: ReadonlyMap<number, number>;
  readonly rawText: readonly RawTextElement[];
  /** With the Markdown reading, each element whose text HTML reads as text, ascending: opener to close, or to the end
   *  of the text when its close never arrives. */
  readonly textElements: readonly TextRange[];
  /** Each element the renderer draws folded until opened (`CONCEALING_TAG_NAMES`), opener to close, or to the end of
   *  the text when its close never arrives. */
  readonly concealing: readonly TextRange[];
  /** Each comment, raw-text element and text element, ascending and disjoint; one whose end never arrives runs to the
   *  end of the text. */
  readonly units: readonly TextRange[];
  /** With the Markdown reading, each stretch shown as written because it is code or escaped, from its first token to
   *  past that token and the skip, ascending. */
  readonly samples: readonly TextRange[];
}

// The elements whose contents the renderer draws folded until opened.
const CONCEALING_TAG_NAMES = ["details"] as const;

// The ONE reader of where an element ends, for every splitter in this file and the frame's Markdown lift. Elements of
// the same name nest. A `<style>` or `<script>` element is read to its close as HTML reads it, wherever it opens, so no
// tag, comment or blank line inside it counts; a comment is skipped to its `-->`. ONE PASS, so the scan costs the text's
// length: after a tag the read resumes past its `>` (a quoted `</x>` inside an attribute value closes nothing), after a
// `<` whose `>` never arrives on its line it resumes at the next line, as `stripTags` does, and a raw-text element whose
// close never arrives ends the read, because everything after it is its text.
//
// With `markdown`, the read is a Markdown renderer's, which shows some markup as written: a token in a code block, on a
// fence line or in an inline code span is skipped to the code's end, and a `<` a backslash escapes opens nothing, so a
// sample there opens nothing (an unclosed one does not end the read). An element whose text HTML reads as text
// (`textarea`, `title`, `xmp`, `iframe`, `noembed`, `noframes`, `plaintext`) is skipped to its close, so nothing inside
// it opens. A unit read whole (an element, a comment) is its own text, so a fence line in it opens no block and a tick
// in it opens no span. Where this read and the renderer could still disagree, the frame lifts nothing, and an element
// not lifted renders as written.
function readMarkup(content: string, markdown?: MarkdownReading): MarkupRead {
  const closes = new Map<number, number>();
  const rawText: RawTextElement[] = [];
  const openers = new Map<string, number[]>();
  const blocks = markdown === undefined ? undefined : inlineBlocks(content);
  const commentClose = { next: -1, bound: blocks === undefined ? undefined : commentBound(blocks) };
  const textClose = new Map<string, number>();
  const textElements: TextRange[] = [];
  const units: TextRange[] = [];
  const samples: TextRange[] = [];
  const code = markdown === undefined || blocks === undefined ? undefined : markdownCodeCursor(content, markdown, blocks);
  let last: ReadSpan | undefined;
  const tags = new RegExp(MARKUP_TOKEN_SOURCE, "g");
  for (let tag = tags.exec(content); tag !== null; tag = tags.exec(content)) {
    const shown = code === undefined ? undefined : shownAsWritten(content, tag, { code, last, textClose, textElements });
    const resume = shown ?? readMarkupToken(content, tag, { closes, rawText, openers, commentClose });
    // A skip, a raw-text element and a comment are units read whole; a tag is not.
    const whole = shown !== undefined || tag[2] === undefined || rawText.at(-1)?.start === tag.index;
    noteUnit(units, { whole: whole && shown === undefined, start: tag.index, resume, length: content.length });
    noteSample(samples, { shown, tag, textElements });
    if (resume === -1 || resume >= content.length) {
      break;
    }
    last = whole ? { start: tag.index, end: resume } : last;
    tags.lastIndex = resume;
  }
  const concealing = CONCEALING_TAG_NAMES.flatMap((name) => {
    const opener = new RegExp(String.raw`<${name}(?=[\s/>]|$)`, "iy");
    const closed = [...closes].filter(([start]) => {
      opener.lastIndex = start;
      return opener.test(content);
    });
    const open = (openers.get(name) ?? []).map((start) => [start, content.length] as const);
    return [...closed, ...open].map(([start, end]) => ({ start, end }));
  });
  return { closes, rawText, textElements, concealing, units: mergedRuns([...units, ...textElements]), samples };
}

// Records a unit `readMarkup` read whole, from `start` to where the read resumed, or to the end when it stopped.
// A comment the read passed over without a close (it resumes just past its `<!--`) is no unit: Markdown prints it.
function noteUnit(units: TextRange[], read: { readonly whole: boolean; readonly start: number; readonly resume: number; readonly length: number }): void {
  if (read.whole && read.resume !== read.start + COMMENT_BLOCK_OPEN.length) {
    units.push({ start: read.start, end: read.resume === -1 ? read.length : read.resume });
  }
}

// Records markup the Markdown read showed as written because it is code or escaped; a text element is no sample.
function noteSample(
  samples: TextRange[],
  read: { readonly shown: number | undefined; readonly tag: RegExpExecArray; readonly textElements: readonly TextRange[] },
): void {
  const { shown, tag } = read;
  if (shown !== undefined && read.textElements.at(-1)?.start !== tag.index) {
    samples.push({ start: tag.index, end: Math.max(shown, tag.index + tag[0].length) });
  }
}

// HTML's elements whose text is read as text to their close, each with that close; `plaintext` has none.
const TEXT_ELEMENT_CLOSE_SOURCES: Readonly<Record<string, string | undefined>> = {
  textarea: "textarea",
  title: "title",
  xmp: "xmp",
  iframe: "iframe",
  noembed: "noembed",
  noframes: "noframes",
  plaintext: undefined,
};

// For `readMarkup`'s Markdown read: where the read resumes when the token at `tag` is markup a renderer shows as
// written or reads as text, or undefined when it is markup. `textClose` keeps each text element's next close, so many
// unclosed openers search the text once; `textElements` takes each text element read.
function shownAsWritten(
  content: string,
  tag: RegExpExecArray,
  state: {
    readonly code: ReturnType<typeof markdownCodeCursor>;
    readonly last: ReadSpan | undefined;
    readonly textClose: Map<string, number>;
    readonly textElements: TextRange[];
  },
): number | undefined {
  const code = state.code(tag.index, state.last);
  if (code !== undefined) {
    return code;
  }
  let slashes = 0;
  while (content.charAt(tag.index - slashes - 1) === "\\") {
    slashes += 1;
  }
  if (slashes % 2 === 1) {
    return tag.index + 1;
  }
  const name = tag[2]?.toLowerCase();
  if (tag[1] === "/" || name === undefined || !Object.hasOwn(TEXT_ELEMENT_CLOSE_SOURCES, name)) {
    return undefined;
  }
  const end = textElementEnd(content, tag.index, TEXT_ELEMENT_CLOSE_SOURCES[name], state.textClose);
  state.textElements.push({ start: tag.index, end: end.closed ? end.resume : content.length });
  return end.resume;
}

// Just past the close of the text element opening at `lt`, and whether that close arrived. One with no close, or whose
// close never arrives, is read past its opener only: HTML would show what follows as the element's text, and the strip
// must still find a style element there, or its stylesheet prints on the inert row.
function textElementEnd(
  content: string,
  lt: number,
  close: string | undefined,
  nextClose: Map<string, number>,
): { readonly resume: number; readonly closed: boolean } {
  const open = tagEndFrom(content, lt, false);
  // An opener whose `>` never arrives has no tag after it either.
  if (open === -1) {
    return { resume: content.length, closed: false };
  }
  if (close === undefined) {
    return { resume: open + 1, closed: false };
  }
  let found = nextClose.get(close) ?? -1;
  if (found !== Number.POSITIVE_INFINITY && found <= open) {
    const closeRe = new RegExp(String.raw`</${close}(?=[\s/>]|$)`, "gi");
    closeRe.lastIndex = open + 1;
    found = closeRe.exec(content)?.index ?? Number.POSITIVE_INFINITY;
    nextClose.set(close, found);
  }
  const gt = found === Number.POSITIVE_INFINITY ? -1 : content.indexOf(">", found);
  return gt === -1 ? { resume: open + 1, closed: false } : { resume: gt + 1, closed: true };
}

/** A stretch of text already read as one unit: a raw-text element or a removed tag. */
interface ReadSpan {
  readonly start: number;
  readonly end: number;
}

/** How `readMarkup` reads Markdown's code: indented code too, or fences and spans only. */
interface MarkdownReading {
  readonly indentedCode: boolean;
}

// The renderer's reading, for the frame lift and the strips.
const MARKDOWN_READING: MarkdownReading = { indentedCode: true };
// The styled hold's: an indented tag line is markup it holds (`TAG_NAME_START_RE`), so indented lines are not code.
const HOLD_READING: MarkdownReading = { indentedCode: false };

// Where a scan in rising order resumes when `offset` sits in code a Markdown renderer shows as written (a code block
// or an inline code span), or undefined when it does not. `covering` is the last unit the scan read: its lines open no
// code block and its ticks open no span.
function markdownCodeCursor(
  content: string,
  reading: MarkdownReading,
  inline: InlineBlocks = inlineBlocks(content),
): (offset: number, covering: ReadSpan | undefined) => number | undefined {
  const blocks: CodeBlockRead = { lines: splitLines(content), next: 0, read: codeLineReader(reading.indentedCode), codeTo: 0 };
  const spanEnd = codeSpanCursor(content, inline);
  return (offset, covering) => pastCodeBlock(blocks, offset, covering) ?? spanEnd(offset, Math.max(blocks.codeTo, covering?.end ?? 0));
}

// CommonMark's code blocks. A fence opens on up to three spaces then three or more ticks (whose info holds no tick) or
// tildes, and closes on a run of the same mark at least as long with only spaces after it; an unclosed one runs to
// the end. With `indented`, a line indented four columns that no paragraph line comes before is code too, and an HTML
// block's lines are HTML, never code, to the block's end.
//
// Both are read inside the line's containers, block quotes and list items, as CommonMark reads them: a quote's `>` and
// an item's content column come off first, so indented code in an item sits four columns past its content, and a line
// that leaves its item closes the fence or HTML block the item held. Where this read is coarser than CommonMark's (an
// item that opens empty), it errs toward text: a style element read as one where the renderer shows code stays inside
// that code, while one read as code where the renderer builds it would print its stylesheet.
//
// The same reader says which lines continue a paragraph and which sit in an HTML block (`inlineBlocks`), so one
// reading decides both where code is and how far a code span or a comment may run.
const CODE_FENCE_OPEN_RE = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const CODE_FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const INDENTED_CODE_RE = /^(?: {0,3}\t| {4})/;
const QUOTE_MARKER_RE = /^ {0,3}> ?/;
const LIST_MARKER_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?=[ \t]|$)/;
const TAB_STOP = 4;
// Past this many spaces after a marker, the item's content is the marker plus one space, and the rest is indented code.
const MARKER_GAP_MAX = 4;
// Every line is read through each open container, so the depth bounds the cost of a line. A reply nests a few deep.
const CONTAINER_DEPTH_MAX = 32;

const CODE_LINES = ["fence-open", "fence-close", "code", "text"] as const;
type CodeLine = (typeof CODE_LINES)[number];

/** An open block quote or list item; `column` is an item's content column within its parent, undefined for a quote. */
interface BlockContainer {
  readonly column: number | undefined;
}

// `line` with each tab spaced out to the next stop, as CommonMark measures columns, so a container's prefix and an
// indent are read in spaces alone.
function expandTabs(line: string): string {
  if (!line.includes("\t")) {
    return line;
  }
  let expanded = "";
  for (const char of line) {
    expanded += char === "\t" ? " ".repeat(TAB_STOP - (expanded.length % TAB_STOP)) : char;
  }
  return expanded;
}

// The number of leading spaces of a line `expandTabs` has read.
function indentColumns(text: string): number {
  return LEADING_SPACES_RE.exec(text)?.[0].length ?? 0;
}

const LEADING_SPACES_RE = /^ */;

// How many of the open containers `text` continues, and the text left inside the last one it does.
function continueContainers(open: readonly BlockContainer[], text: string): { readonly matched: number; readonly rest: string } {
  let rest = text;
  let matched = 0;
  for (const container of open) {
    if (container.column === undefined) {
      const quote = QUOTE_MARKER_RE.exec(rest)?.[0];
      if (quote === undefined) {
        break;
      }
      rest = rest.slice(quote.length);
    } else if (rest.trim() !== "") {
      if (indentColumns(rest) < container.column) {
        break;
      }
      rest = rest.slice(container.column);
    }
    matched += 1;
  }
  return { matched, rest };
}

const FIRST_ORDINAL_RE = /^ {0,3}0*1[.)]/;

// The list marker `text` opens with, or undefined. A rule outranks an item: `- - -` and `-     ---` are rules. Where
// the item would interrupt the block before it (paragraph text or indented code, in the same containers), only one
// that holds text and is a bullet or numbered 1 opens; any other marker line is text.
function listMarker(text: string, afterParagraph: boolean): string | undefined {
  const marker = THEMATIC_BREAK_RE.test(text) ? undefined : LIST_MARKER_RE.exec(text)?.[0];
  if (marker === undefined || !afterParagraph) {
    return marker;
  }
  const interrupts = text.slice(marker.length).trim() !== "" && (/[-+*]$/.test(marker) || FIRST_ORDINAL_RE.test(marker));
  return interrupts ? marker : undefined;
}

// The list item `marker` opens, pushed onto `open`, and the text left inside it.
function openItem(open: BlockContainer[], text: string, marker: string): string {
  const after = text.slice(marker.length);
  const gap = indentColumns(after);
  const pad = after.trim() === "" || gap > MARKER_GAP_MAX ? 1 : gap;
  open.push({ column: marker.length + pad });
  return after.slice(pad);
}

// The quotes and items `text` opens, pushed onto `open`, and the text left inside the last; `emptyItem` when the last
// is a list item with nothing after its marker. At `CONTAINER_DEPTH_MAX` open containers a marker opens none and is
// read as text, and `readCodeLineKind` reads no line there as indented code.
function openContainers(open: BlockContainer[], text: string, afterParagraph: boolean): { readonly emptyItem: boolean; readonly rest: string } {
  let rest = text;
  let item = false;
  // The renderer holds an item to the interrupting rule through the quotes the same line opens before it.
  let interrupting = afterParagraph;
  for (;;) {
    if (open.length >= CONTAINER_DEPTH_MAX) {
      return { emptyItem: false, rest };
    }
    const quote = QUOTE_MARKER_RE.exec(rest)?.[0];
    const marker = quote === undefined ? listMarker(rest, interrupting) : undefined;
    interrupting &&= quote !== undefined;
    if (quote !== undefined) {
      open.push({ column: undefined });
      rest = rest.slice(quote.length);
    } else if (marker === undefined) {
      return { emptyItem: item && rest.trim() === "", rest };
    } else {
      rest = openItem(open, rest, marker);
    }
    item = marker !== undefined;
  }
}

// A line that opens no block of its own, so after paragraph text in a container it leaves it is that paragraph's lazy
// continuation. Any list marker opens a block here: the renderer holds a line that could be lazy to no rule for
// interrupting a paragraph. A lone tag continues nothing either (`readLazyLine`).
function continuesParagraph(text: string): boolean {
  const opensBlock =
    CODE_FENCE_OPEN_RE.test(text) ||
    QUOTE_MARKER_RE.test(text) ||
    LIST_MARKER_RE.test(text) ||
    THEMATIC_BREAK_RE.test(text) ||
    ATX_HEADING_RE.test(text) ||
    htmlBlockEnd(text, false) !== undefined;
  return text.trim() !== "" && !opensBlock;
}

function closesFence(fence: string, text: string): boolean {
  const close = CODE_FENCE_CLOSE_RE.exec(text)?.[1];
  return close !== undefined && close.charAt(0) === fence.charAt(0) && close.length >= fence.length;
}

// The line that ends an HTML block that closes at a blank line, not at a close it waits for.
const ENDS_AT_BLANK = /^[ \t]*$/;

// The HTML block kinds that end on the line holding a close of their own, each opener with that close. A `pre`,
// `script`, `style` or `textarea` block ends at the close of any of the four, as CommonMark has it.
const HTML_BLOCK_ENDS: readonly (readonly [RegExp, RegExp])[] = [
  [RAW_TEXT_BLOCK_RE, /<\/(?:pre|script|style|textarea)>/i],
  [/^ {0,3}<!--/, /-->/],
  [/^ {0,3}<\?/, /\?>/],
  [/^ {0,3}<![A-Za-z]/, />/],
  [/^ {0,3}<!\[CDATA\[/, /\]\]>/],
];

// The line test that ends the HTML block `text` opens, or undefined when it opens none. CommonMark's kinds: those of
// `HTML_BLOCK_ENDS`, then a block-level tag, or a lone complete tag that interrupts no paragraph, to a blank line.
function htmlBlockEnd(text: string, interruptsParagraph: boolean): RegExp | undefined {
  const own = HTML_BLOCK_ENDS.find(([open]) => open.test(text))?.[1];
  if (own !== undefined) {
    return own;
  }
  const lone = !interruptsParagraph && indentColumns(text) < TAB_STOP && isLoneTagLine(text);
  return BLOCK_TAG_LINE_RE.test(text) || lone ? ENDS_AT_BLANK : undefined;
}

// The end of the HTML block `text` opens and its own line does not end, or undefined.
function htmlBlockClose(text: string, interruptsParagraph: boolean): RegExp | undefined {
  const close = htmlBlockEnd(text, interruptsParagraph);
  if (close === undefined || close === ENDS_AT_BLANK) {
    return close;
  }
  // Searched past the opener's `<` and the character after it, so no opener reads as its own close.
  return close.test(text.slice(text.indexOf("<") + 2)) ? undefined : close;
}

// `codeLineReader`'s state between lines.
interface CodeLineState {
  readonly indented: boolean;
  fence: string | undefined;
  /** The open HTML block's end (`htmlBlockClose`); read only with indented code, the one reading a block can hide. */
  html: RegExp | undefined;
  readonly open: BlockContainer[];
  /** The line before was paragraph text, so this one may continue it: leaving its containers, it stays in them. */
  paragraph: boolean;
  /** This line may start indented code: the line before was no paragraph's and opened no empty list item. After an
   *  empty item the renderer reads an indented line as code or as the item's text by what came before the list, which
   *  this read does not follow, so it reads text. */
  codeMayStart: boolean;
  /** The line before was indented code, which a list item interrupts as it does a paragraph. */
  indentedCode: boolean;
  /** The last line read continues the paragraph of the line before it, so an inline unit may run across the two. */
  continues: boolean;
  /** Where the last line read sits in an HTML block: the line that opens one, a later line of it, or in none. */
  inHtml: "opens" | "inside" | undefined;
}

function codeLineState(indented: boolean): CodeLineState {
  return {
    indented,
    fence: undefined,
    html: undefined,
    open: [],
    paragraph: false,
    codeMayStart: true,
    indentedCode: false,
    continues: false,
    inHtml: undefined,
  };
}

// A reader of lines in order. A `covered` line sits inside a unit `readMarkup` read whole (an element's text, a
// comment): it opens nothing and only ends an HTML block whose close it holds. `state` is the reader's own, passed in
// by a caller that reads the containers and blocks a line sits in.
function codeLineReader(indented: boolean, state = codeLineState(indented)): (text: string, covered: boolean) => CodeLine {
  return (text, covered) => {
    if (!covered) {
      return readCodeLineKind(state, expandTabs(text));
    }
    if (state.html !== undefined && state.html !== ENDS_AT_BLANK && state.html.test(text)) {
      state.html = undefined;
    }
    return "text";
  };
}

// One line inside an open HTML block: true when it is the block's, false when it leaves the block's container or is
// the blank line that ends a block closing at one, which is no line of that block.
function readHtmlBlockLine(state: CodeLineState, inside: string, contained: boolean): boolean {
  if (state.html === undefined) {
    return false;
  }
  if (!contained || (state.html === ENDS_AT_BLANK && ENDS_AT_BLANK.test(inside))) {
    state.html = undefined;
    return false;
  }
  state.html = state.html.test(inside) ? undefined : state.html;
  state.codeMayStart = true;
  return true;
}

const ATX_HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const THEMATIC_BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_UNDERLINE_RE = /^ {0,3}(?:=+|-+)[ \t]*$/;

// A line that is a block of its own, one line long: a heading, a rule, or the underline that makes the paragraph
// before it a heading. No paragraph runs into it or out of it.
function isOneLineBlock(text: string, afterParagraph: boolean): boolean {
  return ATX_HEADING_RE.test(text) || THEMATIC_BREAK_RE.test(text) || (afterParagraph && SETEXT_UNDERLINE_RE.test(text));
}

function readCodeLineKind(state: CodeLineState, text: string): CodeLine {
  const { matched, rest: inside } = continueContainers(state.open, text);
  const afterCode = state.indentedCode && matched === state.open.length;
  state.continues = false;
  state.indentedCode = false;
  if (readHtmlBlockLine(state, inside, matched === state.open.length)) {
    state.inHtml = "inside";
    return "text";
  }
  state.inHtml = undefined;
  if (state.fence !== undefined && matched === state.open.length) {
    if (!closesFence(state.fence, inside)) {
      return "code";
    }
    state.fence = undefined;
    return "fence-close";
  }
  if (matched < state.open.length && state.paragraph) {
    const lazy = readLazyLine(state, inside);
    if (lazy !== undefined) {
      return lazy;
    }
  }
  const afterParagraph = state.paragraph && matched === state.open.length;
  // A container this line leaves closes, and with it any fence it held (the fence is read afresh below) and the
  // empty item whose next line may not start code.
  state.codeMayStart ||= matched < state.open.length;
  state.open.length = matched;
  const { emptyItem, rest } = openContainers(state.open, inside, afterParagraph || afterCode);
  state.fence = CODE_FENCE_OPEN_RE.exec(rest)?.[1];
  if (state.fence !== undefined) {
    state.paragraph = false;
    state.codeMayStart = true;
    return "fence-open";
  }
  return readLeafLine(state, rest, { emptyItem, continuing: afterParagraph && state.open.length === matched });
}

// A line that leaves a container after paragraph text, read inside the containers it leaves: it continues that
// paragraph, or a lone tag opens an HTML block there, which the next line that leaves them ends. Undefined when the
// line closes the containers it leaves.
function readLazyLine(state: CodeLineState, inside: string): CodeLine | undefined {
  if (continuesParagraph(inside)) {
    state.continues = true;
    return "text";
  }
  if (!state.indented || htmlBlockEnd(inside, true) !== undefined || htmlBlockEnd(inside, false) === undefined) {
    return undefined;
  }
  state.html = htmlBlockClose(inside, false);
  state.inHtml = "opens";
  state.paragraph = false;
  state.codeMayStart = true;
  return "text";
}

// The rest of a line inside its containers, which opens no fence: indented code, an HTML block, a one-line block or
// paragraph text. `continuing` when it may continue the paragraph before it: that one's line, in the same containers.
function readLeafLine(state: CodeLineState, rest: string, line: { readonly emptyItem: boolean; readonly continuing: boolean }): CodeLine {
  const blank = rest.trim() === "";
  // A paragraph that this line does not continue has ended, so after it indented code may start.
  const mayStart = state.codeMayStart || (state.paragraph && !line.continuing);
  // At the depth bound the containers past it are not read, so their indent is unknown: no line there is code.
  const code = state.indented && !blank && mayStart && state.open.length < CONTAINER_DEPTH_MAX && INDENTED_CODE_RE.test(rest);
  const html = state.indented && !code && !blank && htmlBlockEnd(rest, line.continuing) !== undefined;
  const paragraph = !(blank || code || html || isOneLineBlock(rest, line.continuing));
  state.html = html ? htmlBlockClose(rest, line.continuing) : undefined;
  state.inHtml = html ? "opens" : undefined;
  state.continues = line.continuing && paragraph;
  state.indentedCode = code;
  state.paragraph = paragraph;
  state.codeMayStart = !(paragraph || line.emptyItem);
  return code ? "code" : "text";
}

// Code block state for `markdownCodeCursor`, read line by line in rising order.
interface CodeBlockRead {
  readonly lines: readonly Line[];
  next: number;
  readonly read: (text: string, covered: boolean) => CodeLine;
  /** Text before this offset holds no tick that opens a span: it was read as code. */
  codeTo: number;
}

// One line into the code block state: its kind, with a line inside a unit read whole read as text, opening nothing.
function readCodeLine(blocks: CodeBlockRead, line: Line, covering: ReadSpan | undefined): CodeLine {
  blocks.next += 1;
  const covered = covering !== undefined && line.start > covering.start && line.start < covering.end;
  const kind = blocks.read(matchText(line), covered);
  blocks.codeTo = kind === "text" ? blocks.codeTo : line.end + 1;
  return kind;
}

// When the line holding `offset` is code or a fence line: where the block ends, just past its closing fence or at the
// first text line after indented code (the text's length when it runs to the end). Otherwise undefined. `covering` is
// the last unit read, the only one a line passed since the last token can sit inside.
function pastCodeBlock(blocks: CodeBlockRead, offset: number, covering: ReadSpan | undefined): number | undefined {
  let kind: CodeLine = "text";
  for (let line = blocks.lines[blocks.next]; line !== undefined && line.start <= offset; line = blocks.lines[blocks.next]) {
    kind = readCodeLine(blocks, line, covering);
  }
  if (kind === "text") {
    return undefined;
  }
  if (kind === "fence-close") {
    return blocks.codeTo;
  }
  for (let line = blocks.lines[blocks.next]; line !== undefined; line = blocks.lines[blocks.next]) {
    const next = readCodeLine(blocks, line, undefined);
    // A text line ends indented code. It is read now, so a token on it finds no line to read and reads as text.
    if (next === "text" && line.text.trim() !== "") {
      return line.start;
    }
    if (next === "fence-close") {
      return blocks.codeTo;
    }
  }
  return (blocks.lines.at(-1)?.end ?? 0) + 1;
}

// One token of `readMarkup` into its tables: where the read resumes, or -1 when the rest of the text is this token's.
function readMarkupToken(
  content: string,
  tag: RegExpExecArray,
  into: {
    readonly closes: Map<number, number>;
    readonly rawText: RawTextElement[];
    readonly openers: Map<string, number[]>;
    /** The offset of the next `-->` found so far (-1 before any search, infinity when none is left), and with the
     *  Markdown reading, where the unit a comment opens in ends. */
    readonly commentClose: { next: number; readonly bound: ((offset: number) => number) | undefined };
  },
): number {
  const name = tag[2]?.toLowerCase();
  if (name === undefined) {
    // A comment that never closes, or with the Markdown reading closes past its block, is read past, not to its close:
    // Markdown prints that `<!--` as text, so a style element after it is still one to strip.
    // The next close is remembered, so many unclosed opens search the text once, not once each.
    const after = tag.index + COMMENT_BLOCK_OPEN.length;
    if (into.commentClose.next < after) {
      const close = content.indexOf(COMMENT_BLOCK_CLOSE, after);
      into.commentClose.next = close === -1 ? Number.POSITIVE_INFINITY : close;
    }
    const end = into.commentClose.next + COMMENT_BLOCK_CLOSE.length;
    const bound = Math.min(into.commentClose.bound?.(tag.index) ?? content.length, content.length);
    return end > bound ? after : end;
  }
  const closing = tag[1] === "/";
  if (!closing && isRawTextName(name)) {
    const element = rawTextElementAt(content, tag.index, name);
    into.rawText.push(element);
    if (!element.closed) {
      return -1;
    }
    into.closes.set(element.start, element.end);
    return element.end;
  }
  const end = tagEndFrom(content, tag.index);
  if (end === -1) {
    return content.indexOf("\n", tag.index);
  }
  pairElementTag({ closing, name, lt: tag.index, selfClosing: content.charAt(end - 1) === "/", end }, into.openers, into.closes);
  return end + 1;
}

// The raw-text element `name` whose opener's `<` is at `lt`. An opener whose `>` has not arrived, or a close that has
// not, runs it to the end of the text, which conceals rather than releases.
function rawTextElementAt(content: string, lt: number, name: RawTextName): RawTextElement {
  const toEnd = (bodyStart: number): RawTextElement => ({ name, start: lt, bodyStart, bodyEnd: content.length, end: content.length, closed: false });
  const open = tagEndFrom(content, lt, false);
  if (open === -1) {
    return toEnd(content.length);
  }
  const close = RAW_TEXT_CLOSE_RES[name];
  close.lastIndex = open + 1;
  const found = close.exec(content);
  const gt = found === null ? -1 : content.indexOf(">", found.index);
  return found === null || gt === -1 ? toEnd(open + 1) : { name, start: lt, bodyStart: open + 1, bodyEnd: found.index, end: gt + 1, closed: true };
}

// One complete tag into the open-element stacks: an opener is pushed, a close pops its name's innermost opener.
function pairElementTag(
  tag: { readonly closing: boolean; readonly name: string; readonly lt: number; readonly selfClosing: boolean; readonly end: number },
  openers: Map<string, number[]>,
  closes: Map<number, number>,
): void {
  if (tag.closing) {
    const opener = openers.get(tag.name)?.pop();
    if (opener !== undefined) {
      closes.set(opener, tag.end + 1);
    }
    return;
  }
  if (tag.selfClosing || VOID_TAG_NAMES.has(tag.name)) {
    return;
  }
  const stack = openers.get(tag.name);
  if (stack === undefined) {
    openers.set(tag.name, [tag.lt]);
  } else {
    stack.push(tag.lt);
  }
}

// How an HTML block opened by `opener` ends when it opens no element held to its close: on the line that holds its
// close (that line included), or before the next blank line.
function markupBlockClose(opener: string): { readonly closesOn: (text: string, first: boolean) => boolean; readonly inclusive: boolean } {
  const raw = RAW_TEXT_BLOCK_RE.exec(opener);
  if (raw !== null) {
    const close = `</${(raw[1] ?? "").toLowerCase()}>`;
    return { closesOn: (text) => text.toLowerCase().includes(close), inclusive: true };
  }
  if (opener.trimStart().startsWith(COMMENT_BLOCK_OPEN)) {
    const after = opener.indexOf(COMMENT_BLOCK_OPEN) + COMMENT_BLOCK_OPEN.length;
    return { closesOn: (text, first) => text.includes(COMMENT_BLOCK_CLOSE, first ? after : 0), inclusive: true };
  }
  return { closesOn: (text) => text.trim() === "", inclusive: false };
}

// The line index where an HTML block opening at line `i` ends (exclusive), or `lines.length` when its end has not
// arrived. A block whose element closes on a later line ends on that line; an element not yet closed holds to the end.
function markupBlockEnd(lines: readonly Line[], i: number, closes: ReadonlyMap<number, number>): number {
  const line = lines[i];
  if (line === undefined) {
    return lines.length;
  }
  const opener = matchText(line);
  // `pre` and `textarea` end by their close line; a style or script element ends where `readMarkup` read its close.
  const lineClosed = RAW_TEXT_BLOCK_RE.exec(opener)?.[1]?.toLowerCase();
  const element = lineClosed !== undefined && !isRawTextName(lineClosed) ? undefined : elementOpenedBy(opener);
  const close = element === undefined ? line.end : (closes.get(line.start + element.lt) ?? -1);
  if (close === -1) {
    return lines.length;
  }
  return close > line.end ? lineAfter(lines, i, close) : blockEndByLine(lines, i, opener);
}

// The index just past the first line after `i` whose end reaches `end`. Lines are in order, so this is a binary search:
// a scan from the start for every block would cost the square of the block count.
function lineAfter(lines: readonly Line[], i: number, end: number): number {
  let low = i + 1;
  let high = lines.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((lines[middle]?.end ?? Number.POSITIVE_INFINITY) >= end) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low === lines.length ? lines.length : low + 1;
}

// Where a block whose end is a line shape ends: its close line, or before the next blank line (`markupBlockClose`).
function blockEndByLine(lines: readonly Line[], i: number, opener: string): number {
  const { closesOn, inclusive } = markupBlockClose(opener);
  for (let j = i; j < lines.length; j += 1) {
    const candidate = lines[j];
    if (candidate !== undefined && closesOn(matchText(candidate), j === i)) {
      return inclusive ? j + 1 : j;
    }
  }
  return lines.length;
}

// Whether line `i` opens an HTML block. A lone tag line cannot interrupt a paragraph; the other kinds can.
function opensMarkupBlock(content: string, line: Line, inParagraph: boolean): boolean {
  const text = matchText(line);
  if (RAW_TEXT_BLOCK_RE.test(text) || text.trimStart().startsWith(COMMENT_BLOCK_OPEN) || BLOCK_TAG_LINE_RE.test(text)) {
    return true;
  }
  // The last line, still arriving, with a tag that has not closed: held until the line settles.
  if (line.end >= content.length && TAG_NAME_START_RE.test(text) && tagEnd(text) === -1) {
    return true;
  }
  return !inParagraph && isLoneTagLine(text);
}

// The raw-text elements of a text from index `from`, asked in order of rising offsets: which one covers an offset, past
// its opener.
function rawTextCursor(rawText: readonly RawTextElement[], from = 0): (offset: number) => RawTextElement | undefined {
  let next = from;
  return (offset) => {
    while (next < rawText.length && (rawText[next]?.end ?? offset) <= offset) {
      next += 1;
    }
    const element = rawText[next];
    return element !== undefined && element.start < offset ? element : undefined;
  };
}

// The line index a block ending before line `end` really ends at: past the close of every raw-text element it cuts.
function pastRawText(lines: readonly Line[], end: number, covering: (offset: number) => RawTextElement | undefined): number {
  let next = end;
  for (let cut = covering(lines[next]?.start ?? Number.POSITIVE_INFINITY); cut !== undefined; cut = covering(lines[next]?.start ?? Number.POSITIVE_INFINITY)) {
    next = lineAfter(lines, next - 1, cut.end);
  }
  return next;
}

/** Split a styled reply's text into prose and held HTML blocks (see the section note). Code fence regions stay text.
 *  Each prose segment has its `<style>` and `<script>` elements removed, and a prose segment that is only whitespace is
 *  dropped, so two held blocks read as one. A `<style>` or `<script>` element is one unit wherever it opens: the lines
 *  inside one that opened in prose stay that prose, and a block that one opens in ends past its close. */
export function scanStyledHold(content: string): StyledHoldSegment[] {
  const lines = splitLines(content);
  const { closes, rawText } = readMarkup(content, HOLD_READING);
  const covering = rawTextCursor(rawText);
  // Indented lines stay unread: the hold takes an indented tag line as markup (`TAG_NAME_START_RE`).
  const codeLine = codeLineReader(false);
  const segments: StyledHoldSegment[] = [];
  let pendingStart = 0;
  const flushText = (endExclusive: number): void => {
    const text = stripStyleElements(content.slice(pendingStart, endExclusive));
    if (text.trim() !== "") {
      segments.push({ kind: "text", text });
    }
  };
  let inParagraph = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? { start: content.length, end: content.length, text: "" };
    const inside = covering(line.start);
    if (inside !== undefined) {
      i = lineAfter(lines, i - 1, inside.end);
      inParagraph = true;
      continue;
    }
    const text = matchText(line);
    const code = codeLine(text, false) !== "text";
    if (code || !opensMarkupBlock(content, line, inParagraph)) {
      inParagraph = !code && text.trim() !== "";
      i += 1;
      continue;
    }
    flushText(line.start);
    if (segments.at(-1)?.kind !== "forming-markup") {
      segments.push({ kind: "forming-markup" });
    }
    i = pastRawText(lines, markupBlockEnd(lines, i, closes), covering);
    pendingStart = lines[i]?.start ?? content.length;
    inParagraph = false;
  }
  flushText(content.length);
  return segments;
}

/** A stretch of a text: offsets of its first character and just past its last. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

// The span kinds a train keeps in one paragraph: each is one block of its own, or a secret no break may cut open.
const UNBROKEN_SPAN_KINDS: ReadonlySet<ContentSpanKind> = new Set<ContentSpanKind>(["card", "choices", "hidden", "unknown-directive"]);

// The stretches a paragraph break must not cut, ascending and disjoint: each element whose text HTML reads as text and
// each element that folds its contents away (`readMarkup`); each `:::card`, choice set, hidden span and unknown
// directive the grammar reads (`tokenizeContent`); and each hidden span the strip removes, wherever it sits. A lenient
// card run ends at a blank line, so it holds no break to keep; a `<style>` or `<script>` element's lines are no blank
// lines, and an HTML block's blank lines are no break (`blankRuns`).
//
// Any other element is NOT kept whole: Markdown ends its paragraphs at a blank line inside it (a `<div>` or a
// `<response>` wrapper across two paragraphs renders them as two), so a break there shows what the one bubble shows. A
// folding element is the exception because a bubble cut from it would show the text the one bubble keeps folded.
function unbrokenRanges(content: string, markup: MarkupRead): readonly TextRange[] {
  const ranges: TextRange[] = [...markup.textElements, ...markup.concealing, ...hiddenSpanRanges(content)];
  let cursor = 0;
  for (const span of tokenizeContent(content, { committed: true })) {
    const length = contentSpanRaw(span).length;
    if (UNBROKEN_SPAN_KINDS.has(span.kind)) {
      ranges.push({ start: cursor, end: cursor + length });
    }
    cursor += length;
  }
  return mergedRuns(ranges);
}

// A run of blank lines, from the newline that ends the line before it to the start of the line after it.
interface BlankRun {
  readonly range: TextRange;
  /** The run ends no block of its own: it sits in a code block (a fence's, or between two lines of indented code), in
   *  an HTML block that runs past blank lines (a comment, a `<pre>`), or in a list item the line after it continues. */
  readonly held: boolean;
}

// The blank-line runs of `content` in order, each with whether it is held, read with the Markdown reading. A line
// inside a `<style>` or `<script>` element, closed or not, is that element's text: never blank, and it opens nothing.
//
// A break inside a list item is held because the text after it means something only in its item: cut away, a
// continuation indented four columns reads as code and an HTML block under the item loses its indent. Keeping the item
// whole is the one rule that serves every container; carrying the container into the next bubble would draw a second
// list marker.
function blankRuns(content: string, rawText: readonly RawTextElement[]): readonly BlankRun[] {
  const state = codeLineState(true);
  const read = codeLineReader(true, state);
  const covering = rawTextCursor(rawText);
  const runs: BlankRun[] = [];
  let previous: { readonly end: number; readonly code: boolean } | undefined;
  let inRun = false;
  let heldBlank = false;
  for (const line of splitLines(content)) {
    const covered = covering(line.start) !== undefined;
    const text = matchText(line);
    const blank = !covered && text.trim() === "";
    // Read before the line, which closes the containers it leaves.
    const inItem = inRun && !covered && !blank && continueContainers(state.open, expandTabs(text)).matched > 0;
    const kind = read(text, covered);
    if (blank) {
      inRun = true;
      heldBlank ||= kind !== "text" || state.inHtml === "inside";
      continue;
    }
    if (inRun && previous !== undefined) {
      const indentedCode = previous.code && kind === "code";
      runs.push({ range: { start: previous.end, end: line.start }, held: heldBlank || indentedCode || inItem });
    }
    inRun = false;
    heldBlank = false;
    previous = { end: line.end, code: kind === "code" };
  }
  return runs;
}

/** Where a reply may split into paragraphs: each run of blank lines that ends a Markdown paragraph, never one inside a
 *  `<style>` or `<script>` element, an element whose text HTML reads as text, an HTML block, a code block, a list item,
 *  a card, a choice set or a hidden span. A range runs from the newline that ends the paragraph before it to the start
 *  of the paragraph after it, so the text between two ranges is one paragraph as written. */
export function paragraphBreaks(content: string): readonly TextRange[] {
  const markup = readMarkup(content, MARKDOWN_READING);
  const unbroken = unbrokenRanges(content, markup);
  const breaks: TextRange[] = [];
  let next = 0;
  for (const { range, held } of blankRuns(content, markup.rawText)) {
    while ((unbroken[next]?.end ?? Number.POSITIVE_INFINITY) <= range.start) {
      next += 1;
    }
    if (!held && (unbroken[next]?.start ?? Number.POSITIVE_INFINITY) >= range.end) {
      breaks.push(range);
    }
  }
  return breaks;
}

// THE BLOCK HOLD. A frame holds each of these elements whole, from a line that opens one to its matching close, with no
// Markdown read inside: a panel written with blank lines and indented markup draws as the markup it is, never as
// paragraphs and code blocks. The names are showdown's block list, which SillyTavern renders a reply with, less `pre`,
// `script` and `style`, which CommonMark already holds to their close. A wrapper a reply puts round its prose
// (`<response>`, `<think>`) and a folding element (`details`) are not on it, so their contents still read as Markdown,
// as they do there. A whole document a reply writes raw (`<html>`, `<head>`, `<body>`) is held as one unit too, which
// showdown's list leaves out. An element whose close has not arrived is held to the end of the text, as the forming chip
// holds it.
const HELD_BLOCK_NAMES: ReadonlySet<string> = new Set([
  "address",
  "article",
  "aside",
  "audio",
  "blockquote",
  "body",
  "canvas",
  "div",
  "dl",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "html",
  "iframe",
  "math",
  "nav",
  "noscript",
  "ol",
  "output",
  "p",
  "section",
  "table",
  "ul",
  "video",
]);
// An opener carrying this attribute asks for its contents to be read as Markdown, as showdown honours it.
const MARKDOWN_ATTRIBUTE_RE = /\smarkdown\b/i;
const STYLE_ATTRIBUTE_RE = /\sstyle\s*=/i;
const SVG_TAG_RE = /<svg(?=[\s/>]|$)/i;
// `<svg` and the one character that ends its name.
const SVG_OPENER_LENGTH = 5;
// A blank line inside a held element, as the frame's parse reads it: a line that is not blank, so the HTML block runs
// on, and that draws nothing.
const HELD_BLANK_LINE = "<!---->";

// The held element a line opens, as the offset just past its matching close (the text's end while unclosed), or
// undefined when it opens none: a code line, an indented one, a name not held, or an opener that asks for Markdown.
function heldBlockEnd(text: string, lineStart: number, markup: MarkupRead): number | undefined {
  if (indentColumns(text) >= TAB_STOP) {
    return undefined;
  }
  const opener = elementOpenedBy(text);
  if (opener === undefined || !HELD_BLOCK_NAMES.has(opener.name) || MARKDOWN_ATTRIBUTE_RE.test(text.slice(opener.lt, tagEndFrom(text, opener.lt)))) {
    return undefined;
  }
  return markup.closes.get(lineStart + opener.lt) ?? Number.POSITIVE_INFINITY;
}

// A `<style>` or `<script>` opener or a comment opener: markup every kit reader reads.
const READ_MARKUP_OPENER_RE = /<(?:style|script)(?=[\s/>]|$)|<!--/i;

// Whether `text`, the line at `lineStart`, holds a comment opener the read did not take as a comment: the comment the
// hold writes at a blank line below it would close it. `unit` is asked in rising order.
function opensStrayComment(text: string, lineStart: number, unit: (offset: number) => TextRange | undefined): boolean {
  for (let at = text.indexOf(COMMENT_BLOCK_OPEN); at !== -1; at = text.indexOf(COMMENT_BLOCK_OPEN, at + 1)) {
    if (unit(lineStart + at) === undefined) {
      return true;
    }
  }
  return false;
}

// The held elements of `content`, outermost only, each from the start of its opening line. One pass over the lines.
// SECURITY: the hold must not change what any kit reader (the lift, the carried sheets, the strip) reads. So an element
// is not held when its range holds a sample (code or an escape) naming a `<style>`, `<script>` or comment opener,
// which the hold would turn into live markup, or when a comment opener the read left open sits in or above it, which a
// comment the hold writes would close.
function heldBlocks(content: string, markup: MarkupRead): readonly TextRange[] {
  const covering = rawTextCursor(markup.rawText);
  const unit = rangeCursor(markup.units);
  let sample = 0;
  // Whether a sample that starts before `end` names markup the readers read; asked in rising order.
  const samplesMarkup = (end: number): boolean => {
    let found = false;
    for (let next = markup.samples[sample]; next !== undefined && next.start < end; next = markup.samples[sample]) {
      found ||= READ_MARKUP_OPENER_RE.test(content.slice(next.start, next.end));
      sample += 1;
    }
    return found;
  };
  const read = codeLineReader(true);
  const held: TextRange[] = [];
  let holdEnd = 0;
  let unsafe = false;
  // A comment opener the read left open, anywhere above: a comment the hold writes below it would close it.
  let strayed = false;
  const keep = (): void => {
    if (unsafe) {
      held.pop();
    }
    unsafe = false;
  };
  for (const line of splitLines(content)) {
    const covered = covering(line.start) !== undefined;
    const text = matchText(line);
    const code = read(text, covered) !== "text";
    strayed ||= !code && opensStrayComment(text, line.start, unit);
    const sampled = samplesMarkup(line.end);
    if (line.start < holdEnd) {
      unsafe ||= strayed || sampled;
      continue;
    }
    const end = covered || code ? undefined : heldBlockEnd(text, line.start, markup);
    if (end !== undefined) {
      keep();
      holdEnd = Math.min(end, content.length);
      held.push({ start: line.start, end: holdEnd });
      unsafe = strayed || sampled;
    }
  }
  keep();
  return held;
}

/** Where a frame holds a block element whole (the block hold, see {@link holdBlocksWhole}): ascending and disjoint,
 *  each from the start of the line that opens it to just past its matching close, or to the end while unclosed. */
export function heldBlockRanges(content: string): readonly TextRange[] {
  return heldBlocks(content, readMarkup(content, MARKDOWN_READING));
}

/** `content` as a frame parses it: each blank line inside a held block element (see {@link heldBlockRanges}) becomes an
 *  empty comment, so the element stays one HTML block and none of its text is read as Markdown. A line inside a comment,
 *  a `<style>` or `<script>` element or a text element is left alone. The identity when nothing is held. */
export function holdBlocksWhole(content: string): string {
  const markup = readMarkup(content, MARKDOWN_READING);
  const held = heldBlocks(content, markup);
  if (held.length === 0) {
    return content;
  }
  // A blank line inside a unit read whole (a comment, a stylesheet, a text element) stays: the comment written there
  // would end an open comment or print as an element's text.
  const covering = rangeCursor(markup.units);
  let kept = "";
  let from = 0;
  let next = 0;
  for (const line of splitLines(content)) {
    while ((held[next]?.end ?? Number.POSITIVE_INFINITY) <= line.start) {
      next += 1;
    }
    const inside = (held[next]?.start ?? Number.POSITIVE_INFINITY) < line.start;
    if (inside && ENDS_AT_BLANK.test(matchText(line)) && covering(line.start) === undefined) {
      kept += content.slice(from, line.start) + HELD_BLANK_LINE;
      from = line.end;
    }
  }
  return kept + content.slice(from);
}

/** The stretches of `content` a speaker marker or label inside cannot split: each held block element, each HTML block
 *  and each `<style>` or `<script>` element, as the frame reads them. Ascending and disjoint; pass them to
 *  `parseSpeakerSpans` so a panel stays in one speaker's span. */
export function markupUnitRanges(content: string): readonly TextRange[] {
  const markup = readMarkup(content, MARKDOWN_READING);
  return mergedRuns([...heldBlocks(content, markup), ...inlineBlocks(content).html, ...markup.rawText]);
}

// Where `content`'s prose runs: every span but a card, a choice set, a hidden span and an unknown directive.
function proseRanges(content: string, lenientHtml: boolean): readonly TextRange[] {
  const ranges: TextRange[] = [];
  let cursor = 0;
  for (const span of tokenizeContent(content, { committed: true, lenientHtml })) {
    const length = contentSpanRaw(span).length;
    if (!UNBROKEN_SPAN_KINDS.has(span.kind)) {
      ranges.push({ start: cursor, end: cursor + length });
    }
    cursor += length;
  }
  return ranges;
}

// Whether a block (a held element or an HTML block) is a panel: it holds a `<style>` or `<script>` element or an
// `<svg>`, or its opening tag carries a style attribute. A comment block is none.
function isPanelBlock(text: string, holdsRawText: boolean): boolean {
  if (holdsRawText) {
    return true;
  }
  const lt = text.indexOf("<");
  if (text.startsWith(COMMENT_BLOCK_OPEN, lt)) {
    return false;
  }
  return STYLE_ATTRIBUTE_RE.test(text.slice(lt, tagEndFrom(text, lt) + 1)) || SVG_TAG_RE.test(text);
}

/** The panels a model wrote in `content`'s prose, as the frame trigger reads them (D354): each held block element or
 *  HTML block that holds a `<style>` or `<script>` element or an `<svg>`, or whose opening tag carries a style
 *  attribute, each `<style>` or `<script>` element outside one, and each closed `<svg>` element. The text is read as
 *  Markdown shows it, so a sample in code or behind an escape never counts, and the text of a card, a choice set or a
 *  hidden span is never prose. Any other tag inside a paragraph (`<span style>`, `<font color>`) is no panel.
 *  Ascending and disjoint. */
export function modelPanels(content: string, options: { readonly lenientHtml?: boolean | undefined } = {}): readonly TextRange[] {
  const markup = readMarkup(content, MARKDOWN_READING);
  const blocks = mergedRuns([...heldBlocks(content, markup), ...inlineBlocks(content).html]);
  const raw = markup.rawText;
  const panels: TextRange[] = [];
  let element = 0;
  const standAlone = (before: number): void => {
    for (let next = raw[element]; next !== undefined && next.start < before; next = raw[element]) {
      panels.push({ start: next.start, end: next.end });
      element += 1;
    }
  };
  for (const block of blocks) {
    standAlone(block.start);
    const first = element;
    while ((raw[element]?.start ?? Number.POSITIVE_INFINITY) < block.end) {
      element += 1;
    }
    if (isPanelBlock(content.slice(block.start, block.end), element > first)) {
      panels.push(block);
    }
  }
  standAlone(Number.POSITIVE_INFINITY);
  // An inline `<svg>` draws only as markup, so it is a panel wherever it sits.
  for (const [start, end] of markup.closes) {
    if (SVG_TAG_RE.test(content.slice(start, start + SVG_OPENER_LENGTH))) {
      panels.push({ start, end });
    }
  }
  const prose = rangeCursor(proseRanges(content, options.lenientHtml === true));
  return mergedRuns(panels).filter((panel) => prose(panel.start) !== undefined);
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
  // THE STRIP RUNS FIRST, on the hidden scan, so this plane conceals exactly what a member's payload conceals: fence and
  // code block bodies and an unclosed open included. The render grammar below sees none of them.
  // COMMITTED: compaction only ever reads finalized canon, and an EOF-closed card is strictly safer here —
  // the whole unterminated blob collapses to the stub instead of being fed to the summarizer verbatim.
  return tokenizeContent(stripHiddenSpans(content).content, { committed: true })
    .map((s) => {
      if (s.kind === "hidden") {
        return "";
      }
      return s.kind === "card" ? cardWireStub(s.title) : contentSpanRaw(s);
    })
    .join("");
}

/**
 * The default preview width (`ChatSummary.lastMessagePreview`).
 *
 * IT IS A TWO-LINE BUDGET, not a list-row line. 120 was sized for the chats-list
 * row, which shows the preview on ONE CSS-truncated line — but the SAME field is the home hero's scent
 * line, rendered into a 644px `line-clamp-2` measure, and 120 chars filled barely one of those two lines:
 * the hero showed a server-truncated "…she's und…" with ~420px of its own measure empty, because a
 * character cap the renderer cannot see had already cut the string. The budget is the WIDEST consumer's,
 * and the narrow one clips in CSS (a one-line row truncates the same either way, and the string is one
 * cheap field on a list a user is already waiting for). Raising it is what lets `line-clamp-2` do the
 * visual cut, which is the only cutter that knows the rendered width.
 */
const PREVIEW_MAX_CHARS = 240;

/** The truncation marker: a single-char ellipsis, so the budget stays a character count. */
const PREVIEW_ELLIPSIS = "…";

/**
 * How much of the budget a WORD-BOUNDARY cut has to keep before it is worth taking. A preview is prose
 * read at a glance, so a cut lands between words ("…she's under" not "…she's und") — but a line with no
 * space in its last 40% is one long token (a URL, an unspaced script), and boundary-cutting that throws
 * most of the line away. Below the floor the cut is HARD, which is what the budget always did.
 */
const PREVIEW_WORD_BOUNDARY_FLOOR = 0.6;

/** Cut `flat` to `maxChars` INCLUDING the ellipsis, on a word boundary when one sits inside the floor. */
function truncatePreview(flat: string, maxChars: number): string {
  if (flat.length <= maxChars) {
    return flat;
  }
  // The whitespace run collapse above leaves " " as the only boundary character in a flattened preview.
  const head = flat.slice(0, maxChars - 1);
  const boundary = head.lastIndexOf(" ");
  const cut = boundary >= Math.floor(head.length * PREVIEW_WORD_BOUNDARY_FLOOR) ? head.slice(0, boundary) : head;
  return `${cut.trimEnd()}${PREVIEW_ELLIPSIS}`;
}

/** Markdown INLINE emphasis / inline-code markers (asterisk, underscore, tilde, backtick). Dropped whole
 *  (the wrapped text survives): a glance line reads the words, never the syntax. */
const PREVIEW_INLINE_MARKERS_RE = /[*_~`]+/g;

/** A markdown LINK / image ref (`[label](target)`, a leading `!` for an image) — collapsed to its label, so
 *  a preview never spends its budget on a URL. Nested brackets are not matched (a degrade, not a parse:
 *  the leftover literal is still plain text). */
function collapseMarkdownLinks(text: string): string {
  let out = "";
  let copied = 0;
  let search = 0;
  for (;;) {
    const open = text.indexOf("[", search);
    const close = open === -1 ? -1 : text.indexOf("]", open + 1);
    if (close === -1) {
      return out + text.slice(copied);
    }
    if (text.charAt(close + 1) !== "(") {
      // Every `[` before this `]` shares it as its first closer, so none of them opens a link either.
      search = close + 1;
      continue;
    }
    const end = text.indexOf(")", close + 2);
    if (end === -1) {
      return out + text.slice(copied);
    }
    const start = open > copied && text.charAt(open - 1) === "!" ? open - 1 : open;
    out += text.slice(copied, start) + text.slice(open + 1, close);
    copied = end + 1;
    search = copied;
  }
}

/** A line's leading BLOCK markers — heading, quote, bullet, ordered-list — plus the markdown code-fence
 *  OPEN/CLOSE line itself (triple-backtick + its language tag, which carries no prose; the fenced body is
 *  kept, since a code block a character actually wrote is still what was last said).
 *
 *  The marker group REPEATS: markdown stacks these (`> ### heading inside a quote`, `- > nested`), and a
 *  single-marker pass stripped the outer one and rendered the inner one as literal syntax — measured on the
 *  corpus Scenes snippets, which are raw transcript prose (C1). */
// A code-fence line consumes the rest of its line, so it can only end the chain.
const PREVIEW_BLOCK_PREFIX_RE = /^[ \t]*(?:(?:(?:[>#\-*+]|\d+[.)])[ \t]*)+(?:```[^\n]*)?|```[^\n]*)/gm;

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
 * space — then trimmed and truncated with a single-char ellipsis, on a WORD BOUNDARY (`truncatePreview`).
 * Empty (a body that was all structure) ⇒
 * `""`; the caller decides what an empty preview means.
 */
export function projectBodyForPreview(content: string, maxChars: number = PREVIEW_MAX_CHARS): string {
  // COMMITTED: a preview only ever reads finalized canon, and an EOF-closed card is strictly safer — an
  // unterminated card blob collapses to a dropped span instead of leaking its raw markup into the line.
  // The strip runs first because the render grammar keeps an unclosed hidden open as literal text.
  const prose = tokenizeContent(stripHiddenSpans(content).content, { committed: true })
    .map((s) => (s.kind === "text" ? s.text : ""))
    .join("");
  // A NARRATOR row carries inline `<speaker>NAME</speaker>` markers (§12.4) — the SAME markup the message-list
  // renderer splits + tints. `tokenizeContent` leaves them inside `text` spans (they are not span-tokens), so a
  // raw `<speaker>` would leak into the one-line scent. Flatten through the ONE kit speaker engine
  // (`speakerTagsToPlain` — the prompt-history home) to `NAME: ` plain attribution rather than re-spelling the
  // tag grammar here (the content-class-wire duplication ban). A tagless per-speaker/solo row is a cheap no-op.
  const flat = collapseMarkdownLinks(speakerTagsToPlain(prose))
    .replace(PREVIEW_BLOCK_PREFIX_RE, "")
    .replace(PREVIEW_INLINE_MARKERS_RE, "")
    .replace(PREVIEW_WHITESPACE_RE, " ")
    .trim();
  return truncatePreview(flat, maxChars);
}
