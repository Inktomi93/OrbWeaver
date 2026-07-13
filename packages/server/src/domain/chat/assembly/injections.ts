// domain/chat/assembly/injections — the one positional-injection model: the role-framing rule
// (`frameInjection`) + the depth splice (`spliceInChatInjections`). Shared frame()+splice consumed by
// both BUILD (before/in-prompt section render) and SHAPE (the `in_chat` history splice) — one home, no drift.

import type { ChatInjection } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";

/** The wire role a delivered history row can take (system is converted to user-with-framing here). */
type WireRole = "user" | "assistant";

/**
 * The before/in-static/in-prompt section-render consumer. The three system-block positions all render the
 * same way: macro-resolve the content, then frame by role through the one shared {@link frameInjection}.
 * Returns "" for an empty/whitespace render. The `in_chat` position is not handled here — that is the
 * SHAPE splice's job ({@link spliceInChatInjections}).
 */
export function renderInjection(
  injection: ChatInjection,
  resolveContent: (content: string) => string = (c) => c,
): string {
  return frameInjection(injection.role, resolveContent(injection.content));
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
 */
export function frameInjection(
  role: MessageRole,
  content: string,
  originalRole?: "system",
): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (role === "system" || role === "assistant") {
    return trimmed;
  }
  if (originalRole === "system") {
    return `[Note from system: ${trimmed}]`;
  }
  return `[Note from user: ${trimmed}]`;
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
 * Role coverage: user + assistant splice in directly. role="system" + position="in_chat" is auto-converted
 * here to role=user with `[Note from system: …]` framing. The downstream squash merges a converted
 * user-role injection into an adjacent user turn.
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
  } = {},
): (T | { role: WireRole; content: string })[] {
  // Generic over the row shape: canon rows keep their authorName/characterId so the downstream
  // name-stamp reads them at the type level. Spliced injection rows are bare `{role, content}`.
  if (injections === undefined || injections.length === 0) {
    return [...history];
  }
  const inChat = injections.filter(
    (i) =>
      i.position === "in_chat" && !(opts.excludePromptTail === true && isPromptTailInjection(i)),
  );
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
  const sorted = clamped.sort(
    (a, b) => b.depth - a.depth || (a.inj.order ?? defaultOrder) - (b.inj.order ?? defaultOrder),
  );
  // The last stable canon row: a depth-1 assistant injection landing same-role against it would mutate
  // the cached prefix once squashed → re-frame it to a user operator note instead.
  const boundaryLen = opts.prefixBoundaryLen;
  const stableTailRole =
    boundaryLen !== undefined && boundaryLen >= 1 ? history[boundaryLen - 1]?.role : undefined;
  const result: (T | { role: WireRole; content: string })[] = [...history];
  for (const { inj, depth } of sorted) {
    // A depth-1 assistant injection sits immediately above the volatile tail — adjacent to the last stable
    // canon row. When that row is also assistant, keeping the injection assistant-role would fold it into
    // the cached prefix → re-frame it to a user note.
    const wouldMutatePrefix =
      inj.role === "assistant" && depth === 1 && stableTailRole === "assistant";
    const effectiveRole: WireRole = inj.role === "system" || wouldMutatePrefix ? "user" : inj.role;
    const originalRole = inj.role === "system" ? "system" : undefined;
    const framed = frameInjection(effectiveRole, resolveContent(inj.content), originalRole);
    if (framed.length === 0) {
      continue;
    }
    const insertAt = result.length - depth;
    result.splice(insertAt, 0, { role: effectiveRole, content: framed });
  }
  return result;
}
