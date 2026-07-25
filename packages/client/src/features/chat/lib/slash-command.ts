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

/** The completion strip's combobox wiring (P2 a11y): the listbox the textarea's `aria-controls` names —
 *  one strip per composer, so a constant is fine — and the DOM id of an offer row, shared between the strip
 *  (which renders it) and the composer (which points `aria-activedescendant` at it). Registry ids are the
 *  lowercased kebab tokens {@link parseSlashDraft} validates, so they compose into a valid, unique id. */
export const SLASH_LISTBOX_ID = "composer-slash-listbox";
export function slashOptionId(commandId: string): string {
  return `composer-slash-option-${commandId}`;
}

/** Advance the completion-strip highlight by `step` (+1 ArrowDown / -1 ArrowUp) over `count` offers, given
 *  the current index (-1 = the passive-open state, nothing highlighted). From -1, ArrowDown lands on the
 *  first row and ArrowUp on the last; from there it CYCLES (wraps at either end). Returns -1 for no offers. */
export function nextSlashHighlight(current: number, step: 1 | -1, count: number): number {
  if (count <= 0) {
    return -1;
  }
  if (current === -1) {
    return step === 1 ? 0 : count - 1;
  }
  return (current + step + count) % count;
}

/** The highlighted offer + its `aria-activedescendant` id for a given highlight index over `matches`
 *  (index -1, or out of range, ⇒ neither). One place, so the composer reads a single value instead of two
 *  index-guarding ternaries. */
export function resolveSlashHighlight(
  matches: readonly SlashCommandContribution[],
  index: number,
): { readonly command: SlashCommandContribution | undefined; readonly activeOptionId: string | undefined } {
  const command = index >= 0 ? matches[index] : undefined;
  return { command, activeOptionId: command === undefined ? undefined : slashOptionId(command.id) };
}

/** The textarea's editable-combobox ARIA for the completion strip: while OPEN it advertises expansion + the
 *  listbox it controls; CLOSED it drops `aria-controls` so no dangling relation is announced. One place, so
 *  the composer's JSX stays free of the open/closed ternary (its cognitive-complexity budget). */
export function slashComboboxAria(open: boolean): { readonly "aria-expanded": boolean; readonly "aria-controls": string | undefined } {
  return { "aria-expanded": open, "aria-controls": open ? SLASH_LISTBOX_ID : undefined };
}

/** The subset of a keydown the strip's combobox logic reads — decoupled from React's synthetic event so the
 *  classifier stays pure and unit-testable. */
export interface SlashKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}
/** What a keydown means to the OPEN completion strip:
 *   - `complete-first` — Tab completes the first offer (Tab never sends; it always means "complete").
 *   - `cycle`          — an arrow moves the highlight.
 *   - `pick`           — Enter completes the HIGHLIGHTED offer (only when a row is highlighted).
 *   - `none`           — the composer lets its native send path handle the key.
 *  Keeps the Tab/arrow/Enter branching OUT of the composer body. A bare Enter with NO highlight is `none`,
 *  so the full-typed-command + plain-message send paths are untouched. Non-exported (§7.4: no exported type
 *  alias outside a type home) — {@link classifySlashKey} returns it by inference and the composer never
 *  names it; it narrows on `kind` via {@link resolveSlashKey}. */
type SlashKeyAction =
  | { readonly kind: "complete-first" }
  | { readonly kind: "cycle"; readonly step: 1 | -1 }
  | { readonly kind: "pick" }
  | { readonly kind: "none" };
export function classifySlashKey(event: SlashKeyEvent, hasHighlight: boolean): SlashKeyAction {
  if (event.key === "Tab") {
    return { kind: "complete-first" };
  }
  if (event.key === "ArrowDown") {
    return { kind: "cycle", step: 1 };
  }
  if (event.key === "ArrowUp") {
    return { kind: "cycle", step: -1 };
  }
  if (hasHighlight && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    return { kind: "pick" };
  }
  return { kind: "none" };
}

/** The strip's resolved response to a keydown, expressed WITHOUT the internal {@link SlashKeyAction} union so
 *  the composer applies it by inference (§7.4):
 *   - `pick`  — the offer to complete (Tab→first / Enter→highlighted), or undefined when the key completes none.
 *   - `cycle` — the arrow step (+1/-1), or undefined when the key does not cycle the highlight.
 *  Both undefined ⇒ the strip does not consume the key (the composer's native send path handles it). */
export function resolveSlashKey(
  event: SlashKeyEvent,
  matches: readonly SlashCommandContribution[],
  highlighted: SlashCommandContribution | undefined,
): { readonly pick: SlashCommandContribution | undefined; readonly cycle: 1 | -1 | undefined } {
  const action = classifySlashKey(event, highlighted !== undefined);
  if (action.kind === "complete-first") {
    return { pick: matches[0], cycle: undefined };
  }
  if (action.kind === "pick") {
    return { pick: highlighted, cycle: undefined };
  }
  if (action.kind === "cycle") {
    return { pick: undefined, cycle: action.step };
  }
  return { pick: undefined, cycle: undefined };
}

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
