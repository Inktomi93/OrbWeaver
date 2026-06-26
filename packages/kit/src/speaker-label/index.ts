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

/** Truncate a per-speaker reply at the first FOREIGN speaker label — a line that starts with
 *  `<other>:` (optionally markdown-wrapped) for any name in `otherNames`. The agent-sdk fence
 *  FALLBACK: that runner ignores stop sequences (completion runners get `\nName:` stops), so a turn
 *  can roll on into another speaker's lines ("…\n\nNiko: …"); cut them so the row stays ONE speaker.
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

/** Full per-speaker reply clean: strip a leaked LEADING own-label, then truncate any FOREIGN-speaker
 *  drift. The one entry point the canon-persist paths (send/force/opening + continue) call so a
 *  per-speaker row is exactly its own speaker's content. Solo / no other names → just the leading strip. */
export function cleanPerSpeakerReply(
  content: string,
  speakerName: string,
  otherNames: readonly string[],
): string {
  return truncateAtForeignLabel(stripSelfSpeakerLabel(content, speakerName), otherNames);
}
