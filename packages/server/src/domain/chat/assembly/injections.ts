// domain/chat/assembly/injections — the one positional-injection model: the role-framing rule
// (`frameInjection`) + the depth splice (`spliceInChatInjections`, with the optional `squashSystemMessages`
// pre-merge of consecutive same-depth system runs). Shared frame()+splice consumed by both BUILD
// (before/in-prompt section render) and SHAPE (the `in_chat` history splice) — one home, no drift.
//
// The two NOTE frames are PROSE-1 slots (`chat.injection.userNote`/`.assistantNote`) resolved through
// `resolveProseText`'s `{{note}}` pre-substitution token. HOME = per-PRESET ("templates need one home in
// presets"): the override is stored in `promptConfig.prose` and authored in the preset Templates tab, never
// per-USER under the room host. `prose` defaults to `{}` everywhere, so a caller that doesn't
// thread it gets the shipped frames byte-for-byte.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { MessageRole } from "@orb/kit/message-role";

/** "The TOP of the history" as a depth — the splice clamps any depth beyond the history length to that
 *  length, so this lands an injection before the first canon row whatever the history is. The one home for
 *  the idiom (both the relative-section walk in `assemble.ts` and the new-chat marker in `context.ts` use
 *  it), beside the clamp that gives it meaning. */
export const BEFORE_HISTORY_DEPTH = Number.MAX_SAFE_INTEGER;

/** The wire role a spliced history row can take. `system` appears only when the caller keeps system rows
 *  (SHAPE, which then decides per slot whether each run stays a system row or folds); every other caller gets
 *  each system injection folded to user text here. */
type WireRole = MessageRole;

/** The author roles an injection can be re-roled FROM when it reaches the wire as user text. */
type ReRoledInjection = Exclude<MessageRole, "user">;

/** The frame each re-roled author role wears, or null for none. A folded system note goes bare: in user text a
 *  frame around it made sonnet-5, opus-4-8 and haiku-4-5 ignore it (OR-11, `scripts/probes/openrouter/RESULTS.md`). */
const RE_ROLED_FRAME = {
  system: null,
  assistant: "chat.injection.assistantNote",
} as const satisfies Record<ReRoledInjection, ProseSlotId | null>;

/**
 * The before/in-static/in-prompt section-render consumer. The three system-block positions all render the
 * same way: macro-resolve the content, then frame by role through the one shared {@link frameInjection}.
 * Returns "" for an empty/whitespace render. The `in_chat` position is not handled here — that is the
 * SHAPE splice's job ({@link spliceInChatInjections}).
 */
export function renderInjection(injection: ChatInjection, resolveContent: (content: string) => string = (c) => c, prose: ProseOverrides = {}): string {
  return frameInjection(injection.role, resolveContent(injection.content), undefined, prose);
}

/**
 * Role-specific framing — the one rule, shared by the before/in-prompt render and the in_chat splice.
 * `content` is the caller's already-prepared (macro-resolved) text. Returns "" for empty/whitespace.
 *
 *   - system    → bare. The injection is system text.
 *   - assistant → bare. Authors write assistant-role injections as 1st-person continuations.
 *   - user      → `[Note from user: …]` so the model reads it as the operator speaking through the user
 *                 channel, not an in-character user turn.
 *
 * `originalRole` names the author's role when a caller re-roled a system or assistant injection to user for the
 * wire. A system note stays bare; an assistant note takes its neutral frame, which carries no speaker label.
 * `prose` is the preset's overrides for the note frames; `{}` ⇒ the shipped frames.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function frameInjection(role: MessageRole, content: string, originalRole?: ReRoledInjection, prose: ProseOverrides = {}): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (role === "system" || role === "assistant") {
    return trimmed;
  }
  const slot = originalRole === undefined ? "chat.injection.userNote" : RE_ROLED_FRAME[originalRole];
  return slot === null ? trimmed : resolveProseText(slot, prose, { note: trimmed });
}

/** Collapse maximal runs of consecutive same-depth system-role injections into one entry, joining content
 *  with the blank-line separator `squashSameRole` uses. Same depth ⇒ the entries splice adjacent (equal
 *  distance from the tail), so this matches OUTPUT adjacency; a different depth or a non-system entry
 *  breaks the run. The first entry keeps its extra fields (role/depth/order); later entries contribute
 *  only content — mirroring `squashSameRole`'s first-wins merge. */
function squashSystemNotes(sorted: readonly { inj: ChatInjection; depth: number }[]): { inj: ChatInjection; depth: number }[] {
  const out: { inj: ChatInjection; depth: number }[] = [];
  for (const entry of sorted) {
    const last = out.at(-1);
    if (last !== undefined && last.inj.role === "system" && entry.inj.role === "system" && last.depth === entry.depth) {
      out[out.length - 1] = { inj: { ...last.inj, content: `${last.inj.content}\n\n${entry.inj.content}` }, depth: last.depth };
      continue;
    }
    out.push(entry);
  }
  return out;
}

/** The splice's per-entry role decision. A system injection stays a bare `system` row when the caller keeps
 *  system rows, and folds to bare user text otherwise; `wouldMutatePrefix`
 *  re-roles a prefix-adjacent assistant injection to user text in its own neutral frame. */
function resolveSpliceRole(
  inj: ChatInjection,
  wouldMutatePrefix: boolean,
  keepSystemRows: boolean,
): { effectiveRole: WireRole; originalRole: ReRoledInjection | undefined } {
  const demoteSystem = inj.role === "system" && !keepSystemRows;
  const reRoled = demoteSystem || wouldMutatePrefix;
  return {
    effectiveRole: reRoled ? "user" : inj.role,
    originalRole: reRoled && inj.role !== "user" ? inj.role : undefined,
  };
}

/** A depth-0 in_chat injection whose effective wire role is user (user, or system folded to user).
 *  depth 0 = after the new user turn. Assistant-role depth-0 is not a tail injection (a trailing
 *  assistant message is response prefill; the splice normalizes it to depth 1). */
function isPromptTailInjection(inj: ChatInjection): boolean {
  return inj.position === "in_chat" && inj.depth === 0 && inj.role !== "assistant";
}

const DEFAULT_INJECTION_ORDER = 100;

/** The splice order. Primary: depth desc (deepest splices first). Then the new-chat marker: it is always the first
 *  history row, so an over-deep injection that clamps to the same top depth lands below it. Then `order` asc —
 *  within one depth, lower order lands first/top. Absent order ⇒ 100; equal keys keep array/rack order. */
function spliceOrder(a: { readonly inj: ChatInjection; readonly depth: number }, b: { readonly inj: ChatInjection; readonly depth: number }): number {
  const headRank = (inj: ChatInjection): number => (inj.origin === "new-chat-marker" ? 0 : 1);
  return b.depth - a.depth || headRank(a.inj) - headRank(b.inj) || (a.inj.order ?? DEFAULT_INJECTION_ORDER) - (b.inj.order ?? DEFAULT_INJECTION_ORDER);
}

/**
 * Splice `in_chat` injections into a runner history list by depth.
 *
 * Depth semantics: 0 = at the tail; N = N positions back. Depths beyond the history length clamp to the
 * history length. We sort descending (deepest first) and splice from `length - depth`, so each splice
 * lands at the correct distance from the original tail. Equal depths keep array order (stable sort).
 *
 * Role coverage: user + assistant splice in directly. role="system" + position="in_chat" keeps its role and its
 * position: with `keepSystemRows` it splices as a bare `system` row and SHAPE decides per slot whether the run
 * stays a system row (`assembly/shape` deliverSystemRows); without it (every other caller) it folds to bare user
 * text. The downstream squash merges a folded row into an adjacent user turn; a real system row merges only with
 * another system row.
 */
export function spliceInChatInjections<T extends { role: WireRole; content: string }>(
  history: readonly T[],
  injections: readonly ChatInjection[] | undefined,
  // Macro resolver applied to injection content before framing. Identity default keeps tests/hand-callers
  // that pass plain content unaffected.
  resolveContent: (content: string) => string = (c) => c,
  opts: {
    /** agent-sdk seed shaping: leave the prompt-tail set (depth-0 user-effective) out of the splice —
     *  the dispatcher appends those to the `prompt:` param instead. */
    excludePromptTail?: boolean;
    /** The resolved `turns.assistantPrefill`. `true` ⇒ keep an assistant\@depth-0 injection at depth 0
     *  (the trailing-assistant prefill the model honors); `false`/absent ⇒ floor it to depth 1. */
    allowAssistantPrefill?: boolean;
    /** The prefix-stable re-frame boundary: the number of stable cached rows in `history`. A depth-1
     *  assistant injection landing same-role against the last stable canon row would, once squashed,
     *  rewrite bytes inside the cached prefix → re-framed to a user operator note instead. Absent ⇒ no
     *  re-frame. */
    prefixBoundaryLen?: number | undefined;
    /** `true` ⇒ every system injection splices as a bare `system` row at its own position, and the caller
     *  (SHAPE) decides per slot whether each run stays one. `false`/absent ⇒ it folds to bare user text here. */
    keepSystemRows?: boolean;
    /** `params.advanced.squashSystemMessages`. `true` ⇒ merge CONSECUTIVE same-depth system-role
     *  injections into ONE note BEFORE the system→user fold, so a run delivers a single note row instead of
     *  several. System notes are injection-origin (a canon row is
     *  never system-role), so this only ever combines volatile injected rows — the stable prefix is
     *  untouched. Orthogonal to the adjacent-same-role squash (`roleHandling`). Absent ⇒ no pre-merge. */
    squashSystemMessages?: boolean;
    /** The room host's PROSE-1 overrides for the two note frames (`chat.injection.*`). Absent ⇒ `{}` ⇒ the
     *  shipped frames, byte-identical. */
    prose?: ProseOverrides | undefined;
  } = {},
): (T | { role: WireRole; content: string; anchored?: true; newChatMarker?: true })[] {
  // Generic over the row shape: canon rows keep their authorName/characterId so the downstream
  // name-stamp reads them at the type level. Spliced injection rows are bare `{role, content}`; one anchored
  // above the first canon row ({@link BEFORE_HISTORY_DEPTH}) says so, because its bytes and position repeat
  // every turn and the cache may pin it. The new-chat marker says so too, because the history fit places it
  // again at the head of whatever rows it keeps.
  if (injections === undefined || injections.length === 0) {
    return [...history];
  }
  const inChat = injections.filter((i) => i.position === "in_chat" && !(opts.excludePromptTail === true && isPromptTailInjection(i)));
  if (inChat.length === 0) {
    return [...history];
  }
  // Clamp depths to the original history length before the sort+splice walk (not per-splice): two
  // over-deep injections then behave exactly like two equal-depth in-range ones (array order = output
  // order). A per-splice clamp against the growing result would reverse their relative order.
  const clamped = inChat.map((inj) => {
    // assistant @ depth 0 is a trailing assistant message = response prefill. On the default wire it is
    // normalized to depth 1; `allowAssistantPrefill` keeps it at depth 0.
    const floor = inj.role === "assistant" && opts.allowAssistantPrefill !== true ? 1 : 0;
    return { inj, depth: Math.min(Math.max(inj.depth, floor), history.length) };
  });
  const sorted = clamped.sort(spliceOrder);
  // squashSystemMessages: collapse consecutive same-depth system runs before the frame loop, so each run
  // delivers ONE note row (merge-before-convert) rather than several. Off ⇒ untouched.
  const spliceList = opts.squashSystemMessages === true ? squashSystemNotes(sorted) : sorted;
  // The last stable canon row: a depth-1 assistant injection landing same-role against it would mutate
  // the cached prefix once squashed → re-frame it to a user operator note instead.
  const boundaryLen = opts.prefixBoundaryLen;
  const stableTailRole = boundaryLen !== undefined && boundaryLen >= 1 ? history[boundaryLen - 1]?.role : undefined;
  const result: (T | { role: WireRole; content: string; speakerless?: true; anchored?: true; newChatMarker?: true })[] = [...history];
  for (const { inj, depth } of spliceList) {
    // A depth-1 assistant injection sits immediately above the volatile tail — adjacent to the last stable
    // canon row. When that row is also assistant, keeping the injection assistant-role would fold it into
    // the cached prefix → re-frame it to a user note.
    const wouldMutatePrefix = inj.role === "assistant" && depth === 1 && stableTailRole === "assistant";
    const { effectiveRole, originalRole } = resolveSpliceRole(inj, wouldMutatePrefix, opts.keepSystemRows === true);
    // The new-chat marker is the conversation's own opening line (ST `new_chat_prompt`), not an operator note,
    // so it takes no note frame.
    const framed =
      inj.origin === "new-chat-marker"
        ? resolveContent(inj.content).trim()
        : frameInjection(effectiveRole, resolveContent(inj.content), originalRole, opts.prose ?? {});
    if (framed.length === 0) {
      continue;
    }
    const insertAt = result.length - depth;
    // EVERY spliced injection is speakerless — there is no role that makes one a participant utterance.
    // A `ChatInjection.role` is WIRE PLACEMENT (which lane the backend can carry it in), never authorship:
    // the same instruction rides `system` on a capable model and `user` on one that refuses mid-conversation
    // system, and it is the same instruction either way. The `[Note from user: …]` frame says so in the
    // prompt itself.
    //
    // An earlier pass carved out `role:"user"` injections on the theory that those are "authored in the
    // user's voice". That was wrong and it reintroduced the exact reported bug for a host's post-history
    // teach: the final user turn arrived as `Nate: <the player's words>` + `Nate: [Note from user: <the
    // instruction>]` — two speaker labels, the second one attributing the game rules to the player.
    result.splice(insertAt, 0, splicedRow(inj, effectiveRole, framed));
  }
  return result;
}

/** One spliced injection row. It is anchored when it sits above the first canon row, and flagged when it is
 *  the new-chat marker (both explained at {@link spliceInChatInjections}). */
function splicedRow(
  inj: ChatInjection,
  role: WireRole,
  content: string,
): { role: WireRole; content: string; speakerless: true; anchored?: true; newChatMarker?: true } {
  return {
    role,
    content,
    speakerless: true,
    ...(inj.depth === BEFORE_HISTORY_DEPTH ? { anchored: true as const } : {}),
    ...(inj.origin === "new-chat-marker" ? { newChatMarker: true as const } : {}),
  };
}
