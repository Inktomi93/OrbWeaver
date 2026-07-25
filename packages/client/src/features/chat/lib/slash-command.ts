// The composer SLASH-COMMAND grammar — the ONE pure home for "is this draft a command?", so the dispatch
// hook and its tests share one decision and the composer body stays free of parsing.
//
// The grammar, and why each arm exists:
//   `/<token>[ args]` → a COMMAND. The token is letter-led kebab, matched case-insensitively and lowered
//                       (registry ids are lowercase). Everything after the first run of whitespace is the
//                       raw remainder — a command owns its own argument grammar.
//   `//…`            → the ESCAPE. One slash is eaten and the rest is sent as an ordinary message, so a
//                       message that legitimately starts with `/` is always sendable. This exists because
//                       an UNKNOWN `/command` is REFUSED, never silently posted (the honest-failure rule) —
//                       without an escape, `/tmp is full` would be unsendable.
//   anything else    → a MESSAGE, byte-identical to the pre-slash send path. A leading space is therefore a
//                       second (incidental) escape: " /tmp" is a message.
// A bare "/" is not a command (the token must be letter-led) — it is the COMPLETION trigger instead, which
// is a typing-time question `slashCompletionToken` answers separately.

import type { SlashCommandContribution } from "#lib";

/** A draft that is not a command — `text` is what to send (the `//` escape already applied). */
interface SlashMessageDraft {
  readonly kind: "message";
  readonly text: string;
}

/** A draft that names a command — `command` is the lowercased token, `args` the trimmed remainder. */
interface SlashCommandDraft {
  readonly kind: "command";
  readonly command: string;
  readonly args: string;
}

type SlashDraft = SlashMessageDraft | SlashCommandDraft;

/** A shared empty result, so a non-command draft never mints a new array on every keystroke. */
const EMPTY_MATCHES: readonly SlashCommandContribution[] = [];

/** Anchored; `[\s\S]` spans newlines so a multi-line `/command` body reaches its runner intact. */
const SLASH_COMMAND_RE = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;
/** The in-progress command token: a leading slash then ONLY token characters (no whitespace yet). */
const SLASH_COMPLETION_RE = /^\/([a-z0-9-]*)$/i;
const ESCAPE_PREFIX = "//";

/** Classify a composer draft. Pure — no registry knowledge: whether the named command EXISTS is the
 *  dispatcher's question, because an unknown command must be refused with a reason, not reclassified. */
export function parseSlashDraft(text: string): SlashDraft {
  if (text.startsWith(ESCAPE_PREFIX)) {
    return { kind: "message", text: text.slice(1) };
  }
  const match = SLASH_COMMAND_RE.exec(text);
  if (match === null) {
    return { kind: "message", text };
  }
  return { kind: "command", command: (match[1] ?? "").toLowerCase(), args: (match[2] ?? "").trim() };
}

/** The command token the user is CURRENTLY typing (`""` for a bare "/"), or null when the draft is not a
 *  command-in-progress. Drives the composer's completion strip — a separate question from `parseSlashDraft`
 *  because `/roll` is simultaneously a complete command (on send) and a completed token (while typing). */
export function slashCompletionToken(text: string): string | null {
  const match = SLASH_COMPLETION_RE.exec(text);
  return match === null ? null : (match[1] ?? "").toLowerCase();
}

/** The completion OFFER for a draft: the commands whose id extends the in-progress token, in registry
 *  order. A bare "/" offers everything; a draft that is not a command-in-progress offers nothing. */
export function matchSlashCommands(commands: readonly SlashCommandContribution[], text: string): readonly SlashCommandContribution[] {
  const token = slashCompletionToken(text);
  return token === null ? EMPTY_MATCHES : commands.filter((c) => c.id.startsWith(token));
}

/** The refusal copy for a `/command` no feature registered — names BOTH escape hatches (the completion
 *  strip and the `//` escape) so the user is never left guessing why their message did not send. */
export function unknownCommandNotice(command: string): string {
  return `Unknown command /${command}. Type / to see the available commands, or //${command} to send it as a message.`;
}

/** The refusal copy for a registered command whose mount has not published its runner yet (its fiber
 *  commits on the host's first paint). Refused with a reason, never silently posted. */
export function commandNotReadyNotice(command: string): string {
  return `/${command} isn't ready yet — try again in a moment.`;
}
