// domain/chat/assembly/injections — the one positional-injection model: the role-framing rule
// (`frameInjection`) + the depth splice (`spliceInChatInjections`, with the optional `squashSystemMessages`
// pre-merge of consecutive same-depth system runs). Shared frame()+splice consumed by both BUILD
// (before/in-prompt section render) and SHAPE (the `in_chat` history splice) — one home, no drift.
//
// The two NOTE frames are PROSE-1 slots (`chat.injection.systemNote`/`.userNote`) resolved through
// `resolveProseText`'s `{{note}}` pre-substitution token. HOME = per-PRESET ("templates need one home in
// presets"): the override is stored in `promptConfig.prose` and authored in the preset Templates tab, never
// per-USER under the room host. `prose` defaults to `{}` everywhere, so a caller that doesn't
// thread it gets the shipped frames byte-for-byte.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { MessageRole } from "@orb/kit/message-role";

/** "The TOP of the history" as a depth — the splice clamps any depth beyond the history length to that
 *  length, so this lands an injection before the first canon row whatever the history is. The one home for
 *  the idiom (both the relative-section walk in `assemble.ts` and the new-chat marker in `context.ts` use
 *  it), beside the clamp that gives it meaning. */
export const BEFORE_HISTORY_DEPTH = Number.MAX_SAFE_INTEGER;

/** The wire role a delivered history row can take. `system` appears ONLY on a depth-0 splice when the
 *  resolved model declares `turns.midConversationSystem` (a real mid-conversation system-authority row);
 *  every other system injection is converted to user-with-framing here. */
type WireRole = MessageRole;

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
 * `originalRole` names the original role when a caller auto-converted system→user for the wire.
 * `prose` is the room host's overrides for the two note frames; `{}` ⇒ the shipped frames.
 */
export function frameInjection(role: MessageRole, content: string, originalRole?: "system", prose: ProseOverrides = {}): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (role === "system" || role === "assistant") {
    return trimmed;
  }
  return resolveProseText(originalRole === "system" ? "chat.injection.systemNote" : "chat.injection.userNote", prose, { note: trimmed });
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

/** The splice's per-entry role decision — the ONE demote-vs-deliver rule. A depth-0 system injection on a
 *  `midConversationSystem` model keeps its REAL system role (bare content, appended after the volatile
 *  tail — cache-neutral); every other system injection demotes to user with the visible
 *  `[Note from system: …]` framing (`originalRole` drives it); `wouldMutatePrefix` re-frames a
 *  prefix-adjacent assistant injection to a user note. */
function resolveSpliceRole(
  inj: ChatInjection,
  depth: number,
  wouldMutatePrefix: boolean,
  allowMidConversationSystem: boolean,
): { effectiveRole: WireRole; originalRole: "system" | undefined } {
  const keepSystem = inj.role === "system" && depth === 0 && allowMidConversationSystem;
  const demoteSystem = inj.role === "system" && !keepSystem;
  return {
    effectiveRole: demoteSystem || wouldMutatePrefix ? "user" : inj.role,
    originalRole: demoteSystem ? "system" : undefined,
  };
}

/** A depth-0 in_chat injection whose effective wire role is user (user, or system → user-with-framing).
 *  depth 0 = after the new user turn. Assistant-role depth-0 is not a tail injection (a trailing
 *  assistant message is response prefill; the splice normalizes it to depth 1). */
function isPromptTailInjection(inj: ChatInjection): boolean {
  return inj.position === "in_chat" && inj.depth === 0 && inj.role !== "assistant";
}

/**
 * Splice `in_chat` injections into a runner history list by depth.
 *
 * Depth semantics: 0 = at the tail; N = N positions back. Depths beyond the history length clamp to the
 * history length. We sort descending (deepest first) and splice from `length - depth`, so each splice
 * lands at the correct distance from the original tail. Equal depths keep array order (stable sort).
 *
 * Role coverage: user + assistant splice in directly. role="system" + position="in_chat" is CAPABILITY-
 * GATED (never a blanket rule — silent conversion is the anti-pattern): when the resolved model declares
 * `turns.midConversationSystem` (`allowMidConversationSystem`), a depth-0 system injection delivers as a
 * REAL system wire row (bare content — the model honors a tail system-authority channel, and depth 0 sits
 * AFTER the volatile tail, outside the cached stable prefix, so the delivery is cache-neutral). Every
 * other system injection — capability absent/false, or depth \> 0 (no wire-tested mid-history channel
 * exists on any model) — converts to role=user with the VISIBLE `[Note from system: …]` framing (the
 * reader sees it is a system note). The downstream squash merges a converted user-role injection into an
 * adjacent user turn.
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
    /** The resolved `turns.midConversationSystem`. `true` ⇒ the model honors a mid-conversation (tail)
     *  system-authority channel: a DEPTH-0 system injection delivers as a real `system` wire row (bare
     *  content, no note framing). `false`/absent (the `TURNS_FLOOR` safe default) ⇒ every system injection
     *  demotes to the visible `[Note from system: …]` user row — exactly the pre-capability behavior.
     *  Depth \> 0 system injections ALWAYS demote (the only wire-tested channel is tail-positioned, and a
     *  real system row inside the stable prefix would mutate cached bytes). */
    allowMidConversationSystem?: boolean;
    /** `params.advanced.squashSystemMessages`. `true` ⇒ merge CONSECUTIVE same-depth system-role
     *  injections into ONE note BEFORE the system→user framing, so a run delivers a single
     *  `[Note from system: …]` row instead of several. System notes are injection-origin (a canon row is
     *  never system-role), so this only ever combines volatile injected rows — the stable prefix is
     *  untouched. Orthogonal to the adjacent-same-role squash (`roleHandling`). Absent ⇒ no pre-merge. */
    squashSystemMessages?: boolean;
    /** The room host's PROSE-1 overrides for the two note frames (`chat.injection.*`). Absent ⇒ `{}` ⇒ the
     *  shipped frames, byte-identical. */
    prose?: ProseOverrides | undefined;
  } = {},
): (T | { role: WireRole; content: string })[] {
  // Generic over the row shape: canon rows keep their authorName/characterId so the downstream
  // name-stamp reads them at the type level. Spliced injection rows are bare `{role, content}`.
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
  // Primary: depth desc (deepest splices first). Secondary: `order` asc — within one depth, lower order
  // lands first/top. Absent order ⇒ default 100; equal depth+order keeps array/rack order.
  const defaultOrder = 100;
  const sorted = clamped.sort((a, b) => b.depth - a.depth || (a.inj.order ?? defaultOrder) - (b.inj.order ?? defaultOrder));
  // squashSystemMessages: collapse consecutive same-depth system runs before the frame loop, so each run
  // delivers ONE `[Note from system: …]` row (merge-before-convert) rather than several. Off ⇒ untouched.
  const spliceList = opts.squashSystemMessages === true ? squashSystemNotes(sorted) : sorted;
  // The last stable canon row: a depth-1 assistant injection landing same-role against it would mutate
  // the cached prefix once squashed → re-frame it to a user operator note instead.
  const boundaryLen = opts.prefixBoundaryLen;
  const stableTailRole = boundaryLen !== undefined && boundaryLen >= 1 ? history[boundaryLen - 1]?.role : undefined;
  const result: (T | { role: WireRole; content: string; speakerless?: true })[] = [...history];
  for (const { inj, depth } of spliceList) {
    // A depth-1 assistant injection sits immediately above the volatile tail — adjacent to the last stable
    // canon row. When that row is also assistant, keeping the injection assistant-role would fold it into
    // the cached prefix → re-frame it to a user note.
    const wouldMutatePrefix = inj.role === "assistant" && depth === 1 && stableTailRole === "assistant";
    const { effectiveRole, originalRole } = resolveSpliceRole(inj, depth, wouldMutatePrefix, opts.allowMidConversationSystem === true);
    const framed = frameInjection(effectiveRole, resolveContent(inj.content), originalRole, opts.prose ?? {});
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
    // teach: the final user turn arrived as `Alex: <the player's words>` + `Alex: [Note from user: <the
    // instruction>]` — two speaker labels, the second one attributing the game rules to the player.
    result.splice(insertAt, 0, { role: effectiveRole, content: framed, speakerless: true as const });
  }
  return result;
}
