// Speaker-label helpers shared by the server (canon-purity strip at persist + the assembly
// sanitizer) and the client (defensive DISPLAY strip). A per-speaker group turn is trained — by the
// `Name:`-prefixed transcript + the `[Write the next reply only as X.]` nudge — to echo `X: ` (and
// sometimes a `<speaker>` tag, sometimes a markdown-wrapped `**X:**`, sometimes TWICE) at the START
// of its own reply. The speaker label is OUT-OF-BAND metadata (re-applied at prompt time / shown as
// chrome), never part of the spoken content — so it's stripped both before persist (canon stays pure)
// AND at render (robust to old baked-in labels + any path the persist strip misses). One
// implementation, two consumers.

import { escapeRegExp } from "#strings";

/** A leading `<speaker ...>` / `<speaker>` open-tag (case-insensitive, optional attrs). */
export const LEADING_SPEAKER_TAG = /^\s*<\s*speaker\b[^>]*>\s*/i;

/** A complete `<speaker ...>NAME</speaker>` marker — name BETWEEN the tags (the format the client
 *  narrator parser `parseSpeakerSpans` consumes), bounded (no `<`/`>` in the name, capped length) so
 *  there's no nested-quantifier backtracking. Global so {@link speakerTagsToPlain} can convert all. */
const SPEAKER_TAG_PAIR = /<\s*speaker\b[^>]*>([^<>]{0,200})<\s*\/\s*speaker\s*>\s*/gi;

/** The `<START>` example-block sentinel test (leading whitespace tolerated). Top-level so the
 *  per-call regex isn't recompiled (and so it satisfies the no-regex-in-function gate). */
const START_SENTINEL = /^\s*<START>/i;

/** A markdown code fence. Counted (not parsed) so a label INSIDE a fenced block can't split a span and
 *  tear the block in half — an odd count before a position means that position is inside a fence. */
const CODE_FENCE = "```";

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
 *  THE SECOND MARKER ALPHABET (`castNames`, the TOLERANCE + RETROACTIVE layer). The `<speaker>` wire
 *  format is INSTRUCTED (the narrator round's `chat.group.speakerTags` prose slot), and an instruction is
 *  not a guarantee: this module's own header records what models actually emit — a plain `Name:`, a
 *  markdown-wrapped `**Name:**`, sometimes doubled — and every narrator row committed BEFORE the
 *  instruction existed carries the plain form only. So when the caller passes the room's PRESENT cast
 *  names, a tagless body ALSO splits on a line-start `Name:` label for an EXACT cast name. The grammar is
 *  deliberately timid — fail plain, never wrong (`ui/markdown/dialogue.ts`'s posture):
 *    · the name must match a passed cast name EXACTLY (longest-first, so `Anna Lee` wins over `Anna`);
 *    · the label must start a LINE (a mid-sentence "…told Bob: run" never splits);
 *    · markdown emphasis around the name and/or the colon is tolerated (`**Bob:**`, `*Bob*:`);
 *    · a label inside a fenced code block is skipped — splitting there would tear the block in half;
 *    · the label TEXT STAYS in its span. It is real prose the reader already sees (unlike a `<speaker>`
 *      tag, which is invisible markup and IS consumed) — deleting it would drop the only non-color
 *      attribution a low-vision reader has, and would make the body change at stream-settle.
 *  A body with no tags and no matched label yields the byte-identical single `{speaker: null}` span. */
export function parseSpeakerSpans(content: string, castNames: readonly string[] = []): readonly SpeakerSpan[] {
  const matches = [...content.matchAll(SPEAKER_TAG_PAIR)];
  if (matches.length === 0) {
    // No markers: the PLAIN-label grammar gets its turn (empty `castNames` ⇒ the byte-identical no-op,
    // `text` === `content`, untouched).
    return splitOnPlainLabels(content, castNames);
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

/** The line-start plain-label matcher for an EXACT cast name, or null when there is nothing to match.
 *  Names are deduped, blank-dropped and sorted LONGEST-FIRST so an alternation can't let `Anna` shadow
 *  `Anna Lee`. Built per call (the name set is per-room) — the `leadingLabelRe` precedent. */
function plainLabelRe(castNames: readonly string[]): RegExp | null {
  const names = [...new Set(castNames.map((n) => n.trim()).filter((n) => n.length > 0))].sort((a, b) => b.length - a.length).map(escapeRegExp);
  if (names.length === 0) {
    return null;
  }
  // `(?:^|\n)` — a LINE start only (no `m` flag: `^` then means position 0, which is what we want).
  return new RegExp(`(?:^|\\n)[ \\t]*(?:\\*\\*|\\*|__|_)?(${names.join("|")})(?:\\*\\*|\\*|__|_)?[ \\t]*:`, "g");
}

// True when `index` sits inside a fenced code block — an ODD number of ``` fences opened before it.
function insideCodeFence(text: string, index: number): boolean {
  let fences = 0;
  let at = text.indexOf(CODE_FENCE);
  while (at >= 0 && at < index) {
    fences += 1;
    at = text.indexOf(CODE_FENCE, at + CODE_FENCE.length);
  }
  return fences % 2 === 1;
}

/** Split a TAGLESS body on plain `Name:` labels (the grammar is documented on {@link parseSpeakerSpans}).
 *  No cast names / no match ⇒ the byte-identical single `{speaker: null, text: content}` span. */
function splitOnPlainLabels(content: string, castNames: readonly string[]): readonly SpeakerSpan[] {
  const re = plainLabelRe(castNames);
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
  const n = escapeRegExp(name.trim());
  // Optional markdown emphasis is CAPTURED (\1) and only a CLOSING marker matching the OPENING one is
  // consumed (before OR after the colon: `**X**:` / `**X:**`). The backref is the whole point — without
  // it the trailing matcher ate a content italic (`X: *waves*` → lost the leading `*`). When no opening
  // emphasis matched, \1 is the empty string (JS), so the closes collapse to plain whitespace.
  return new RegExp(`^\\s*(?:(\\*\\*|\\*|__|_)\\s*)?${n}\\s*(?:\\1\\s*)?:\\s*(?:\\1\\s*)?`);
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
  const n = escapeRegExp(name.trim());
  // NO leading whitespace grab (that would delete a word separator, gluing `one JFC: two` → `onetwo`); the
  // TRAILING whitespace + dash run IS consumed — the model's aborted turn-opener dash (`Name: —`) — so a
  // mid-word `dumJFC: —b` collapses to `dumb`, while a space-separated `one JFC: two` becomes `one two`.
  return new RegExp(`(?:\\*\\*|\\*|__|_)?${n}(?:\\*\\*|\\*|__|_)?\\s*:(?:\\*\\*|\\*|__|_)?\\s*[—–-]*\\s*`, "g");
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
    const n = escapeRegExp(raw.trim());
    if (n.length === 0) {
      continue;
    }
    // Foreign label at a line start: newline + optional indent/emphasis + Name + optional emphasis + colon.
    const re = new RegExp(`\\n[ \\t]*(?:\\*\\*|\\*|__|_)?${n}(?:\\*\\*|\\*|__|_)?[ \\t]*:`);
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
