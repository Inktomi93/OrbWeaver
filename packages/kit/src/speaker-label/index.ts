// Speaker-label helpers shared by the server (canon-purity strip at persist + the assembly
// sanitizer) and the client (defensive DISPLAY strip). A per-speaker group turn is trained — by the
// `Name:`-prefixed transcript + the `[Write the next reply only as X.]` nudge — to echo `X: ` (and
// sometimes a `<speaker>` tag, sometimes a markdown-wrapped `**X:**`, sometimes TWICE) at the START
// of its own reply. The speaker label is OUT-OF-BAND metadata (re-applied at prompt time / shown as
// chrome), never part of the spoken content — so it's stripped both before persist (canon stays pure)
// AND at render (robust to old baked-in labels + any path the persist strip misses). One
// implementation, two consumers.

import { UNICODE_WORD_CHARS } from "#strings";

/** A leading `<speaker ...>` / `<speaker>` open-tag (case-insensitive, optional attrs). */
export const LEADING_SPEAKER_TAG = /^\s*<\s*speaker\b[^>]*>\s*/i;

/** A complete `<speaker ...>NAME</speaker>` marker — name BETWEEN the tags (the format the client
 *  narrator parser `parseSpeakerSpans` consumes), bounded (no `<`/`>` in the name, capped length) so
 *  there's no nested-quantifier backtracking. Global so {@link speakerTagsToPlain} can convert all. */
const SPEAKER_TAG_PAIR = /<\s*speaker\b[^>]*>([^<>]{0,200})<\s*\/\s*speaker\s*>\s*/gi;

/** The `<START>` example-block sentinel test (leading whitespace tolerated). Top-level so the
 *  per-call regex isn't recompiled (and so it satisfies the no-regex-in-function gate). */
const START_SENTINEL = /^\s*<START>/i;

/** A markdown code fence OPENER/closer. Counted per LINE (not parsed) so a label INSIDE a fenced block
 *  can't split a span and tear the block in half — an odd count of fence LINES before a position means that
 *  position is inside a fence. */
const CODE_FENCE = "```";

/** CommonMark lets a fence line carry up to three leading spaces; past that it is an indented code block,
 *  not a fence. Bounds what counts as a fence LINE (the anchor that stray inline backticks lack). */
const MAX_FENCE_INDENT = 3;

/** The name-boundary class — `#strings`'s {@link UNICODE_WORD_CHARS}, which is its ONE home (#1543 moved it
 *  there when `#world-info`'s key compile turned out to be a fourth spelling of the same question; the three
 *  failure modes it fixes are documented at that home). Aliased here only so the three uses below read as
 *  "a NAME boundary"; the EMPHASIS bytes are NOT part of it — `inlineLabelRe`'s lookbehind adds those. */
const NAME_WORD_CHARS = UNICODE_WORD_CHARS;

/** `NAME_WORD_CHARS` as a lookahead — the RIGHT boundary of a name inside a built pattern (the LEFT one is
 *  usually a literal sigil like `@`, or the lookbehind {@link inlineLabelRe} builds). Exported as pattern
 *  BYTES rather than a compiled regex because every consumer interpolates a per-name escaped literal, and
 *  the pattern must be compiled with the `u` flag for the property escapes to mean anything. */
export const NAME_END_BOUNDARY = `(?![${NAME_WORD_CHARS}])`;

/** One character's word-ness by the {@link NAME_END_BOUNDARY} class. Top-level regex (the
 *  no-regex-in-function gate); `undefined` = a string edge, which is always a boundary. */
const NAME_WORD_CHAR_RE = new RegExp(`[${NAME_WORD_CHARS}]`, "u");
function isNameWordChar(ch: string | undefined): boolean {
  return ch !== undefined && NAME_WORD_CHAR_RE.test(ch);
}

/** Does `needle` occur in `haystack` as a WHOLE name — bounded by non-name characters or string edges?
 *  Case is the caller's to normalize (both sides lowercased is the house idiom). Substring-scan rather
 *  than a built regex so a name carrying its own punctuation ("Dr. Vane") needs no escaping, and so the
 *  boundary question is asked of exactly two characters. */
export function includesWholeName(haystack: string, needle: string): boolean {
  if (needle.length === 0) {
    return false;
  }
  let from = haystack.indexOf(needle);
  while (from !== -1) {
    if (!(isNameWordChar(haystack[from - 1]) || isNameWordChar(haystack[from + needle.length]))) {
      return true;
    }
    from = haystack.indexOf(needle, from + 1);
  }
  return false;
}

/** The tolerated-emphasis alternation every label regex below wraps around a name: `**`/`*`/`__`/`_`.
 *  Named once (was spelled 4×) so the tolerated-markdown set changes in one place. Bare alternation
 *  bytes — callers wrap it `(?:…)` (non-capturing) or `(…)` (the one backref-capturing use). */
const EMPHASIS_ALT = "\\*\\*|\\*|__|_";

export interface SpeakerSpan {
  /** `null` = no attributed speaker for this span (narrator / plain text). */
  readonly speaker: string | null;
  readonly text: string;
}

/** Splits a SETTLED message body on `<speaker>NAME</speaker>` markers (§12.4) into ordered
 *  `{speaker, text}` spans — the client narrator renderer's ONE parse (was mirrored client-side against
 *  this module's private `SPEAKER_TAG_PAIR`; promoted here so kit tweaking the grammar can't silently
 *  diverge the renderer's span split, C16). Zero markers is the load-bearing no-op: exactly ONE
 *  `{speaker: null}` span whose `text` is byte-identical to `content` — the caller uses that single-span
 *  shape as the signal to render through the untouched pre-#21 path.
 *
 *  Torn/mid-stream tags are already held back UPSTREAM by the streaming lane's `holdTornSpeaker`
 *  (`#fix-markdown`, the streaming-ghost path only) before content ever settles into canon — so by the
 *  time a body reaches this parser it is assumed well-formed; a stray unterminated tag (one that never
 *  got a matching close) is simply left as plain, un-matched text (no crash, no data loss).
 *
 *  THE SECOND MARKER ALPHABET (`characterNames`, the TOLERANCE + RETROACTIVE layer). The `<speaker>` wire
 *  format is INSTRUCTED (the narrator round's `chat.group.speakerTags` prose slot), and an instruction is
 *  not a guarantee: this module's own header records what models actually emit — a plain `Name:`, a
 *  markdown-wrapped `**Name:**`, sometimes doubled — and every narrator row committed BEFORE the
 *  instruction existed carries the plain form only. So when the caller passes the room's PRESENT character
 *  names, a tagless body ALSO splits on a line-start `Name:` label for an EXACT character name. The grammar is
 *  deliberately timid — fail plain, never wrong (`ui/markdown/dialogue.ts`'s posture):
 *    · the name must match a passed character name EXACTLY (longest-first, so `Anna Lee` wins over `Anna`);
 *    · the label must start a LINE (a mid-sentence "…told Bob: run" never splits);
 *    · markdown emphasis around the name and/or the colon is tolerated (`**Bob:**`, `*Bob*:`);
 *    · a label inside a fenced code block is skipped — splitting there would tear the block in half;
 *    · the label TEXT STAYS in its span. It is real prose the reader already sees (unlike a `<speaker>`
 *      tag, which is invisible markup and IS consumed) — deleting it would drop the only non-color
 *      attribution a low-vision reader has, and would make the body change at stream-settle.
 *  A body with no tags and no matched label yields the byte-identical single `{speaker: null}` span. */
export function parseSpeakerSpans(content: string, characterNames: readonly string[] = []): readonly SpeakerSpan[] {
  const matches = [...content.matchAll(SPEAKER_TAG_PAIR)];
  if (matches.length === 0) {
    // No markers: the PLAIN-label grammar gets its turn (empty `characterNames` ⇒ the byte-identical no-op,
    // `text` === `content`, untouched).
    return splitOnPlainLabels(content, characterNames);
  }

  const spans: SpeakerSpan[] = [];
  let cursor = 0;
  for (const [matchPosition, match] of matches.entries()) {
    const matchIndex = match.index;
    // Preamble / inter-marker plain text (no attributed speaker) ahead of this marker.
    if (matchIndex > cursor) {
      spans.push({ speaker: null, text: content.slice(cursor, matchIndex) });
    }
    const rawName = match[1]?.trim() ?? "";
    const textStart = matchIndex + match[0].length;
    const nextMatchIndex = matches[matchPosition + 1]?.index ?? content.length;
    spans.push({
      speaker: rawName.length > 0 ? rawName : null,
      text: content.slice(textStart, nextMatchIndex),
    });
    cursor = nextMatchIndex;
  }
  return spans;
}

/** The line-start plain-label matcher for an EXACT character name, or null when there is nothing to match.
 *  Names are deduped, blank-dropped and sorted LONGEST-FIRST so an alternation can't let `Anna` shadow
 *  `Anna Lee`. Built per call (the name set is per-room) — the `leadingLabelRe` precedent. */
function plainLabelRe(characterNames: readonly string[]): RegExp | null {
  const names = [...new Set(characterNames.map((n) => n.trim()).filter((n) => n.length > 0))].sort((a, b) => b.length - a.length).map((n) => RegExp.escape(n));
  if (names.length === 0) {
    return null;
  }
  // `(?:^|\n)` — a LINE start only (no `m` flag: `^` then means position 0, which is what we want).
  return new RegExp(`(?:^|\\n)[ \\t]*(?:${EMPHASIS_ALT})?(${names.join("|")})(?:${EMPHASIS_ALT})?[ \\t]*:`, "g");
}

// True when `index` sits inside a fenced code block — an ODD number of fence LINES opened before it.
//
// THE GRAMMAR IS LINE-LEVEL, and this used to count raw ``` OCCURRENCES anywhere (#1354): one stray inline
// triple-backtick in prose flipped the state and suppressed EVERY later speaker label in the message, which
// is the fail-open direction for label suppression (a real `Tom:` line silently stopped splitting). A fence
// is a LINE whose first non-space run is ```, indented at most three spaces — nothing mid-line counts.
//
// AN UNCLOSED FENCE EXTENDS TO THE END OF THE MESSAGE (the odd-count arm), which is what a markdown renderer
// does with it and is the direction that never tears a code block in half. That choice is deliberate: the
// cost is suppressed labels after a genuinely unterminated fence; the alternative cost is splitting a span
// inside a code block the reader sees as one unit.
function insideCodeFence(text: string, index: number): boolean {
  let fences = 0;
  let lineStart = 0;
  while (lineStart < index) {
    const newline = text.indexOf("\n", lineStart);
    const line = text.slice(lineStart, newline === -1 ? text.length : newline);
    const body = line.trimStart();
    if (body.startsWith(CODE_FENCE) && line.length - body.length <= MAX_FENCE_INDENT) {
      fences += 1;
    }
    if (newline === -1) {
      break;
    }
    lineStart = newline + 1;
  }
  return fences % 2 === 1;
}

/** Split a TAGLESS body on plain `Name:` labels (the grammar is documented on {@link parseSpeakerSpans}).
 *  No character names / no match ⇒ the byte-identical single `{speaker: null, text: content}` span. */
function splitOnPlainLabels(content: string, characterNames: readonly string[]): readonly SpeakerSpan[] {
  const re = plainLabelRe(characterNames);
  const cuts: { readonly at: number; readonly speaker: string }[] = [];
  for (const match of re === null ? [] : content.matchAll(re)) {
    // The match starts ON the newline (or at 0); the span begins at the LINE, so the separator stays
    // with the preceding span and the label itself opens this one.
    const at = content[match.index] === "\n" ? match.index + 1 : match.index;
    const speaker = match[1];
    if (speaker !== undefined && !insideCodeFence(content, at)) {
      cuts.push({ at, speaker });
    }
  }
  const [first] = cuts;
  if (first === undefined) {
    return [{ speaker: null, text: content }];
  }
  const spans: SpeakerSpan[] = [];
  if (first.at > 0) {
    spans.push({ speaker: null, text: content.slice(0, first.at) });
  }
  for (const [i, cut] of cuts.entries()) {
    spans.push({ speaker: cut.speaker, text: content.slice(cut.at, cuts[i + 1]?.at ?? content.length) });
  }
  return spans;
}

/** A stored reaction's segment anchor — the persisted trio a B7 segment-targeted reaction carries
 *  (`message_reactions.segment_*`). `speaker` is the span's OWN label at capture (`null` = a narration
 *  span); `snippet` is the span text's trimmed head at capture, the fingerprint that closes the anchoring
 *  suite's same-speaker-insert hole (`tests/kit/speaker-label/anchoring.suite.test.ts` — `(index, speaker)`
 *  alone silently mis-targets when another line by the same speaker is inserted above the target). */
export interface SegmentAnchor {
  readonly index: number;
  readonly speaker: string | null;
  readonly snippet: string;
}

/** The one snippet derivation both WRITERS (the toggle verb, the `react` tool) and the validator share —
 *  trimmed head, caller-capped. One home so a stored snippet and a validation-time comparison can never
 *  disagree about whitespace. */
export function segmentSnippet(text: string, max: number): string {
  return text.trim().slice(0, max);
}

/** Re-resolve a stored {@link SegmentAnchor} against a body's CURRENT segmentation — the ONE staleness
 *  rule for every consumer (the client pill/picker display and the server's prompt-attribution read; a
 *  second spelling is how display and attribution drift, MA-2's headline lesson).
 *
 *  Valid ⇔ the index is in range AND the span's speaker equals the stored one AND the span's trimmed text
 *  still begins with the stored snippet (prefix, not equality — a tail edit to the same line keeps the
 *  anchor; a different inserted line breaks it). Anything else returns `null` and the caller DEGRADES to
 *  whole-message (projections degrade, never throw — the `contentSpansToBlocks` doctrine). */
export function resolveSegmentAnchor(content: string, characterNames: readonly string[], anchor: SegmentAnchor): SpeakerSpan | null {
  const spans = parseSpeakerSpans(content, characterNames);
  const span = spans[anchor.index];
  if (span === undefined || span.speaker !== anchor.speaker) {
    return null;
  }
  return span.text.trim().startsWith(anchor.snippet) ? span : null;
}

/** Convert a narrator message's inline `<speaker>NAME</speaker>` markers to plain `NAME: ` attribution
 *  for PROMPT HISTORY — the renderer needs the tags (per-speaker coloring) so STORED canon keeps them,
 *  but re-feeding the raw XML into every subsequent prompt wastes tokens AND trains the model to parrot
 *  the syntax (spec §10.3 L1071, marinara 5145-5160). The spoken text after each marker is preserved;
 *  only the markers become a `Name:` prefix. A message with no markers (every per-speaker / solo row)
 *  is returned unchanged → cheap no-op. */
export function speakerTagsToPlain(content: string): string {
  return content.replace(SPEAKER_TAG_PAIR, (_m, name: string): string => {
    const n = name.trim();
    return n.length > 0 ? `${n}: ` : "";
  });
}

/** Prepend the `<START>` example-block sentinel when absent (ST `getGroupCharacterCardsLazy`
 *  group-chats.js:569). A merged co-speaker's example dialogue is normalized so each member's block
 *  begins a fresh example chain — without it, a second member's examples read as a continuation of
 *  the first. Applied ONLY to co-speaker examples; the active card's own `dialogue_examples` marker
 *  stays untouched (the author controls its `<START>`, byte-identical). Idempotent: a block that
 *  already opens with `<START>` (leading whitespace tolerated) is returned unchanged. */
export function normalizeExampleStart(s: string): string {
  return START_SENTINEL.test(s) ? s : `<START>\n${s}`;
}

/** One leading `${name}:` label, tolerating the crunchy variants an LLM actually emits: leading
 *  whitespace, markdown emphasis around the name and/or the colon (`**X:**`, `*X*:`, `__X__:`), a
 *  space before the colon, and any whitespace after it. Anchored at start; the EXACT escaped name
 *  only — a different speaker's name or ordinary `clause:` prose never matches. */
function leadingLabelRe(name: string): RegExp {
  const n = RegExp.escape(name.trim());
  // Optional markdown emphasis is CAPTURED (\1) and only a CLOSING marker matching the OPENING one is
  // consumed (before OR after the colon: `**X**:` / `**X:**`). The backref is the whole point — without
  // it the trailing matcher ate a content italic (`X: *waves*` → lost the leading `*`). When no opening
  // emphasis matched, \1 is the empty string (JS), so the closes collapse to plain whitespace.
  return new RegExp(`^\\s*(?:(${EMPHASIS_ALT})\\s*)?${n}\\s*(?:\\1\\s*)?:\\s*(?:\\1\\s*)?`);
}

/** Strip leading `${speakerName}:` label(s) — NAME ONLY, leaves a leading `<speaker>` tag intact (the
 *  narrator parser needs those). DEDUPES: a doubled `X: X: …` collapses fully (loops until no leading
 *  label remains). Ordinary prose, a different speaker's name, and already-clean text are untouched.
 *  The DISPLAY-side defense — every row (incl. narrator) passes through it, so it must not eat tags. */
export function stripLeadingSpeakerName(content: string, speakerName: string): string {
  const name = speakerName.trim();
  if (name.length === 0) {
    return content;
  }
  const re = leadingLabelRe(name);
  let out = content;
  let prev: string;
  do {
    prev = out;
    out = out.replace(re, "");
  } while (out !== prev && out.length > 0);
  return out;
}

/** Strip a leaked leading speaker label for `speakerName`: leading `<speaker …>` tag(s) AND leading
 *  `${speakerName}:` label(s), interleaved and deduped (handles `<speaker>X: <speaker>X: …`). The
 *  CANON-purity strip at persist — used only on per-speaker rows (NOT narrator, whose `<speaker>` tags
 *  are load-bearing). Idempotent + safe on already-clean text. */
export function stripSelfSpeakerLabel(content: string, speakerName: string): string {
  let out = content;
  let prev: string;
  do {
    prev = out;
    // Non-global, ^-anchored replace removes exactly the one leading tag (== the original exec+slice).
    out = out.replace(LEADING_SPEAKER_TAG, "");
    out = stripLeadingSpeakerName(out, speakerName);
  } while (out !== prev && out.length > 0);
  return out;
}

/** A leaked SELF label anywhere in the body (not just leading): the exact escaped name, optional
 *  markdown emphasis, a `:` and — crucially — an OPTIONAL immediately-following em-dash/en-dash/hyphen run
 *  (the per-speaker "new turn" opener the model interleaves, e.g. `JFC: —`). Global, un-anchored: a torn
 *  self-tag the model spat MID-generation (the `dumJFC: —b` word-splice — `dum` + a token-boundary `JFC: —`
 *  + `b`) is removed wherever it landed, so the token-boundary case can't survive into canon. Built per
 *  call so the name is escaped fresh; kept private (only `stripInlineSpeakerLabel` wraps it). */
function inlineLabelRe(name: string): RegExp {
  const n = RegExp.escape(name.trim());
  // NO leading whitespace grab (that would delete a word separator, gluing `one JFC: two` → `onetwo`); the
  // TRAILING whitespace + dash run IS consumed — the model's aborted turn-opener dash (`Name: —`).
  const emph = `(?:${EMPHASIS_ALT})`;
  // The name (optionally emphasised) then its colon (optionally emphasised) then any run-in whitespace.
  const label = `${n}${emph}?\\s*:${emph}?\\s*`;
  // THREE ARMS, because "a label" and "a name that happens to END an ordinary word" are the same bytes
  // (#1354: `stripInlineSpeakerLabel("I told SusAnn: watch out.", "Ann")` deleted from the middle of
  // `SusAnn` and returned `"I told Suswatch out."` — the user's prose, altered on the way into canon).
  // Mid-word matching still HAPPENS, but only for a shape that is unambiguously a torn tag rather than
  // ordinary text; that is the grammar this file always meant by "a label at the start of an utterance":
  //   A. AT A WORD BOUNDARY — start of content, or after anything that is not a letter, a digit or an
  //      emphasis byte — the label needs no other evidence (`one JFC: two` → `one two`, unchanged).
  //   B. WRAPPED IN MARKDOWN anywhere, even mid-word (`dum**JFC:**b` → `dumb`): prose does not emphasise a
  //      fragment inside a word, a torn `<speaker>` echo does.
  //   C. FOLLOWED BY THE TURN-OPENER EM/EN DASH anywhere, even mid-word — the `dumJFC: —b` token-boundary
  //      splice this file was written for (→ `dumb`).
  // A bare `SusAnn: ` has none of the three and is therefore prose.
  //
  // TWO THINGS THE BOUNDARY AND THE DASH ARM BOTH HAD TO NARROW (#1530, the residue of the #1354 fix):
  //   · the boundary class is the shared {@link NAME_WORD_CHARS} — `\p{L}\p{N}\p{M}`, not `\b`, because `\b`
  //     is ASCII-only (a CJK or Cyrillic name would still splice mid-word) — and it carries the MARKS
  //     because without them a DECOMPOSED letter ends the word for this test: `caféAnn:` written as
  //     `cafe`+U+0301+`Ann` put a combining mark immediately before the name, the lookbehind passed, and the
  //     stripper ate `Ann: ` out of the middle of the word again. Same reasoning `rpgCastSlug` uses: in many
  //     scripts a mark IS part of the letter. That class is SHARED with the mention/arbitration matchers
  //     (#1439) so all three ask the same question of the same bytes; the EMPHASIS bytes are added HERE and
  //     only here, or the boundary would be satisfied by the inner `*` of a `**` pair.
  //   · arm C takes the EM/EN dash only, never the ASCII hyphen. `Name: -` is ordinary prose punctuation
  //     ("I told SusAnn: -bring it" was collapsing to "I told Susbring it"), while `Name: —` is the measured
  //     artifact this arm exists for. Arm A keeps the hyphen — at a word boundary the label is already
  //     established, and the trailing run is just its whitespace.
  return new RegExp(`(?:(?<![${NAME_WORD_CHARS}*_])${emph}?${label}[—–-]*|${emph}${label}[—–-]*|${emph}?${label}[—–]+)\\s*`, "gu");
}

/** Remove a leaked SELF speaker label anywhere in a per-speaker reply — the mid-content twin of
 *  `stripLeadingSpeakerName`. A member never legitimately prefixes their OWN dialogue with `TheirName:` in a
 *  per-speaker row, so an inline `${speakerName}:` (with the crunchy markdown/dash variants) is always a
 *  leaked tag fragment; strip every occurrence. Empty name / no match ⇒ unchanged. */
export function stripInlineSpeakerLabel(content: string, speakerName: string): string {
  const name = speakerName.trim();
  if (name.length === 0) {
    return content;
  }
  return content.replace(inlineLabelRe(name), "");
}

/** Truncate a per-speaker reply at the first FOREIGN speaker label — a line that starts with
 *  `<other>:` (optionally markdown-wrapped) for any name in `otherNames`. The agent-sdk fence
 *  FALLBACK: that runner ignores stop sequences (completion runners get `\nName:` stops), so a turn
 *  can roll on into another speaker's lines (`"…\n\nNiko: …"`); cut them so the row stays ONE speaker.
 *  Returns the content up to (not including) the first foreign label, right-trimmed. No foreign label
 *  / empty `otherNames` (solo) → unchanged. Only matches at a LINE START so an in-prose "Niko:" inside
 *  a sentence is left alone. */
export function truncateAtForeignLabel(content: string, otherNames: readonly string[]): string {
  let cut: number | null = null;
  for (const raw of otherNames) {
    const n = RegExp.escape(raw.trim());
    if (n.length === 0) {
      continue;
    }
    // Foreign label at a line start: newline + optional indent/emphasis + Name + optional emphasis + colon.
    const re = new RegExp(`\\n[ \\t]*(?:${EMPHASIS_ALT})?${n}(?:${EMPHASIS_ALT})?[ \\t]*:`);
    // `search` returns the match-start index (== the old `exec(...).index`) or a negative miss; using
    // it sidesteps the false "always non-null" read the linter gives `RegExp.exec`.
    const idx = content.search(re);
    if (idx >= 0 && (cut === null || idx < cut)) {
      cut = idx;
    }
  }
  return cut === null ? content : content.slice(0, cut).trimEnd();
}

/** The WIRE half of the same foreign-label grammar {@link truncateAtForeignLabel} enforces at RECEIVE:
 *  `\nName:` per name, for the generation request's stop set (ST `getStoppingStrings`, script.js:3010 —
 *  its group arm stops on every member's name). A completion runner cuts the generation the moment the
 *  model starts a named speaker's line; the receive-side truncate stays as the fallback for the backends
 *  that ignore stops (agent-sdk). ONE home for both ends so the two can't drift apart. Empty/blank names
 *  are dropped; the result is deduped, and an empty `names` yields `[]` (a byte-identical request). */
export function foreignLabelStops(names: readonly string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))].map((n) => `\n${n}:`);
}

/** Full per-speaker reply clean: strip a leaked LEADING own-label + tag, scrub any INLINE self-label the
 *  model interleaved mid-generation (the `dumJFC: —b` word-splice), then truncate any FOREIGN-speaker drift.
 *  The one entry point the canon-persist paths (send/force/opening + continue) call so a per-speaker row is
 *  exactly its own speaker's content. Solo / no other names → the self strips still run (the foreign
 *  truncate is the no-op). The inline scrub runs AFTER the leading strip so a leading label is handled by the
 *  emphasis-backref-aware `stripLeadingSpeakerName`, and BEFORE the foreign truncate so a removed inline
 *  fragment can't shift a foreign label's line-start position. */
export function cleanPerSpeakerReply(content: string, speakerName: string, otherNames: readonly string[]): string {
  const deLeaded = stripSelfSpeakerLabel(content, speakerName);
  const deInlined = stripInlineSpeakerLabel(deLeaded, speakerName);
  return truncateAtForeignLabel(deInlined, otherNames);
}
