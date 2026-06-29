// @orb/server/kit/post-process — the RECEIVE/ASSEMBLE prompt-text munging (D53 step 2). Pure, deterministic
// string transforms (no I/O, no clock, no random) ported from neo-tavern `shared/prompt/post-process.ts`
// (reports/shared-dissolution.md §80 — "pure but 0 client consumers", so server/kit not @orb/kit). Each fn is
// keyed to ONE pipeline context (chat.md §2): the RECEIVE cleanups (singleLine / dropIncomplete / trim) run on
// the model reply AFTER the AI_OUTPUT regex pass; the ASSEMBLE transform (collapseNewlines) runs on a rendered
// system half. Kept pure so the ASSEMBLE transform never busts the static-cache prefix.

import type { PromptConfig } from "@orb/contracts/preset";

// Hoisted regex literals (biome `useTopLevelRegex`) — these run on every reply, so they compile ONCE.
const THREE_PLUS_NEWLINES = /\n{3,}/gu;
const TRAILING_WHITESPACE = /\s+$/u;
// A sentence that ends cleanly: terminal punctuation + any immediate closing quote/paren/asterisk.
const ENDS_CLEANLY = /[.!?…][)"'»”’*]*$/u;
// The longest prefix ending at the LAST complete sentence (cut everything after it).
const UP_TO_LAST_SENTENCE = /^[\s\S]*[.!?…][)"'»”’*]*/u;
const LEADING_BLANK_LINE = /^\s*\n/u;

/** The `PromptConfig.postProcess` block (RECEIVE singleLine/dropIncomplete/trim + the ASSEMBLE collapse). */
export type PostProcessConfig = NonNullable<PromptConfig["postProcess"]>;

/** ASSEMBLE: collapse runs of 3+ newlines down to exactly 2 (a single blank line). Idempotent. Applied to a
 *  rendered system half after the section/injection walk, before the cache split. */
export function collapseNewlines(text: string): string {
  return text.replace(THREE_PLUS_NEWLINES, "\n\n");
}

/** RECEIVE: strip trailing whitespace (spaces, tabs, newlines) from the model's reply. */
export function trimTrailingWhitespace(text: string): string {
  return text.replace(TRAILING_WHITESPACE, "");
}

/** RECEIVE: drop a trailing INCOMPLETE sentence — text after the last sentence-ending punctuation. No-op when
 *  the reply already ends at `.`/`!`/`?`/`…` (optionally followed by a close quote/paren/asterisk) or has no
 *  sentence punctuation at all (don't nuke a single fragment the user may want). */
export function dropIncompleteSentence(text: string): string {
  const trimmed = text.replace(TRAILING_WHITESPACE, "");
  if (trimmed.length === 0) {
    return text;
  }
  if (ENDS_CLEANLY.test(trimmed)) {
    return text;
  }
  const match = trimmed.match(UP_TO_LAST_SENTENCE);
  if (match === null || match[0].length === 0) {
    return text; // no complete sentence — leave as-is
  }
  return match[0];
}

/** RECEIVE: collapse the reply to a SINGLE line (ST `single_line`) — keep everything up to the first newline,
 *  dropping the rest. Trailing whitespace on that line is also trimmed. A reply with no newline is returned
 *  unchanged (minus trailing whitespace). Leading blank lines are skipped so a model that opens with "\n\nText"
 *  still yields "Text", not "". */
export function collapseToSingleLine(text: string): string {
  const leadingTrimmed = text.replace(LEADING_BLANK_LINE, "");
  const firstNewline = leadingTrimmed.indexOf("\n");
  const line = firstNewline === -1 ? leadingTrimmed : leadingTrimmed.slice(0, firstNewline);
  return line.replace(TRAILING_WHITESPACE, "");
}

/** Apply the configured RECEIVE-context transforms to a reply, in order. single-line runs FIRST (the most
 *  aggressive cut), so the later sentence/whitespace trims operate on the already-reduced line. */
export function applyReceivePostProcess(reply: string, cfg: PostProcessConfig | undefined): string {
  if (cfg === undefined) {
    return reply;
  }
  let out = reply;
  if (cfg.singleLine) {
    out = collapseToSingleLine(out);
  }
  if (cfg.dropIncompleteSentence) {
    out = dropIncompleteSentence(out);
  }
  if (cfg.trimTrailingWhitespace) {
    out = trimTrailingWhitespace(out);
  }
  return out;
}

/** Apply the configured ASSEMBLE-context transforms to a rendered prompt half. */
export function applyAssemblePostProcess(text: string, cfg: PostProcessConfig | undefined): string {
  if (cfg === undefined) {
    return text;
  }
  return cfg.collapseNewlines ? collapseNewlines(text) : text;
}
