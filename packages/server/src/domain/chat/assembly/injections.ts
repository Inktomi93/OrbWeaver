// domain/chat/assembly/injections — the ONE positional-injection model: the role-framing rule
// (`frameInjection`) + the depth splice (`spliceInChatInjections`). This file is the SHARED frame()+splice
// consumed by BOTH BUILD (the before/in-prompt section render) and SHAPE (the `in_chat` history splice) —
// "one home, can't drift".
//
// FLAG[scope]: this file's canonical home is shared between the BUILD chunk (RESOLVE→GATHER→BUILD) and
// the SHAPE chunk. SHAPE genuinely cannot run without `spliceInChatInjections` (the SHAPE step "splice
// in_chat by depth"), and the file did not yet exist, so the SHAPE chunk establishes the
// ONE home with ONLY the splice/frame primitives SHAPE needs. The BUILD chunk EXTENDS this same file
// with the before_prompt/in_static/in_prompt section-render consumers (which import the same
// `frameInjection`) — it does NOT re-home the splice. (The "do-not-touch" boundary between
// chunks yields to the one-home rule + SHAPE's hard dependency; flagged per CLAUDE.md conflict
// protocol.)

import type { ChatInjection } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";

/** The wire role a delivered history row can take (system is converted to user-with-framing here). */
type WireRole = "user" | "assistant";

/**
 * The before/in-static/in-prompt SECTION-RENDER consumer (the BUILD chunk EXTENDS
 * this file with "the before/in-prompt section-render consumers using the existing `frameInjection`"). The
 * three system-block positions (`before_prompt` PREPEND to static, `in_static` APPEND to static,
 * `in_prompt` APPEND to dynamic) all render the SAME way: macro-resolve the content (the caller's injected
 * resolver — macros BEFORE framing, render ONCE), then frame by role through the
 * ONE shared {@link frameInjection} (so the system-block render and the `in_chat` splice can NEVER drift).
 * Returns "" for an empty/whitespace render (the caller skips it). The `in_chat` position is NOT handled
 * here — that is the SHAPE splice's job ({@link spliceInChatInjections}).
 *
 * `resolveContent` is injected (the chat-domain macro renderer) so this primitive stays free of the
 * macro/AssembleContext dependency — same shape as the splice's resolver seam. Identity default keeps
 * hand-callers/tests that pass pre-resolved content unaffected.
 */
export function renderInjection(
  injection: ChatInjection,
  resolveContent: (content: string) => string = (c) => c,
): string {
  return frameInjection(injection.role, resolveContent(injection.content));
}

/**
 * Role-specific framing — the ONE rule, shared by the before/in-prompt render AND the in_chat splice.
 * `content` is the caller's already-prepared (macro-resolved) text. Returns "" for empty/whitespace.
 *
 *   • system    → bare. The injection IS system text.
 *   • assistant → bare. Authors write assistant-role injections as 1st-person continuations.
 *   • user      → `[Note from user: …]` so the model reads it as the operator speaking through the user
 *                 channel, not an in-character user turn.
 *
 * `originalRole` names the ORIGINAL role when a caller auto-converted system→user for the wire (the
 * splice rewrites role=system → role=user with originalRole="system"): `[Note from system: …]`. Avoids
 * the double-nest a pre-wrapped caller would otherwise produce.
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

/** A depth-0 in_chat injection whose EFFECTIVE wire role is user (user, or system → user-with-framing).
 *  depth 0 = AFTER the new user turn (ST convention — the note is the last thing the model reads).
 *  Assistant-role depth-0 is NOT a tail injection (a trailing assistant message is response PREFILL —
 *  unsupported; the splice normalizes it to depth 1, before the user turn). */
function isPromptTailInjection(inj: ChatInjection): boolean {
  return inj.position === "in_chat" && inj.depth === 0 && inj.role !== "assistant";
}

/**
 * Splice `in_chat` injections into a runner history list by depth.
 *
 * Depth semantics: 0 = at the tail (just before the new turn / trailing user msg); N = N positions back.
 * Depths beyond the history length clamp to the history length (the very top). We sort DESCENDING
 * (deepest first) and splice from `length - depth`, so each splice lands at the correct distance from
 * the ORIGINAL tail. Equal depths — including over-deep ones after the clamp — keep array order (stable
 * sort + each later splice landing one slot below the earlier).
 *
 * Role coverage: user + assistant splice in directly. role="system" + position="in_chat" is auto-
 * converted here to role=user with `[Note from system: …]` framing (the universally-honored
 * operator-channel-via-user-slot shape). The downstream squash merges a converted user-role injection
 * into an adjacent user turn.
 */
export function spliceInChatInjections<T extends { role: WireRole; content: string }>(
  history: readonly T[],
  injections: readonly ChatInjection[] | undefined,
  // Macro resolver applied to injection content BEFORE framing (matching the before/in-prompt render
  // path). The identity default keeps tests/hand-callers that pass plain content unaffected.
  resolveContent: (content: string) => string = (c) => c,
  opts: {
    /** agent-sdk seed shaping: leave the prompt-tail set (depth-0 user-effective) OUT of the splice —
     *  the dispatcher appends those to the `prompt:` param instead. */
    excludePromptTail?: boolean;
    /** D66 (W5): the resolved `turns.assistantPrefill`. `true` ⇒ keep an assistant\@depth-0 injection at
     *  depth 0 (the trailing-assistant prefill the model honors); `false`/absent ⇒ floor it to depth 1 (the
     *  only assistant placement a non-prefill wire can express — a trailing assistant 400s there). */
    allowAssistantPrefill?: boolean;
    /** D66-C (W6) — the prefix-stable re-frame boundary: the number of STABLE cached rows (rows
     *  `[0, prefixBoundaryLen)` in `history` = the committed prefix minus the volatile tail). A depth-1
     *  ASSISTANT-role injection landing same-role against the last stable canon row would, once squashed,
     *  rewrite bytes INSIDE the cached prefix → the content-keyed Anthropic prefix cache misses and the whole
     *  conversation re-bills (part 01 §1c). When set, such an injection is RE-FRAMED to a user operator
     *  `[Note from …]` row so it lands STANDALONE, never folding into the stable row. Absent ⇒ no re-frame
     *  (the BUILD/no-prefix callers). */
    prefixBoundaryLen?: number | undefined;
  } = {},
): (T | { role: WireRole; content: string })[] {
  // Generic over the row shape (orbweaver's sound upgrade over neo's `{role,content}` erasure): the
  // canon rows keep their `authorName`/`characterId` so the downstream name-stamp reads them at the TYPE
  // level, not just at runtime. Spliced injection rows are bare `{role, content}` — hence the union.
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
  // Clamp depths to the ORIGINAL history length BEFORE the sort+splice walk (not per-splice): two
  // over-deep injections then behave exactly like two equal-depth in-range ones — the stable sort keeps
  // array order and each later splice lands one slot below the earlier, preserving "array order = output
  // order". (A per-splice clamp against the GROWING result would floor over-deep insertAts to 0,
  // REVERSING their relative order.)
  const clamped = inChat.map((inj) => {
    // assistant @ depth 0 is a TRAILING assistant message = response PREFILL. On a `assistantPrefill:false`
    // wire (default) it is normalized to depth 1 (before the user turn) — the only assistant placement a
    // non-prefill wire can express (a trailing assistant HARD-400s). W5: `allowAssistantPrefill` keeps it at
    // depth 0 so the model honors the authored prefill.
    const floor = inj.role === "assistant" && opts.allowAssistantPrefill !== true ? 1 : 0;
    return { inj, depth: Math.min(Math.max(inj.depth, floor), history.length) };
  });
  // Primary: depth DESC (deepest splices first, from the back). Secondary: `order` DESC — within one
  // depth, higher order lands first/top. Absent order ⇒ ST default 100.
  const defaultOrder = 100;
  const sorted = clamped.sort(
    (a, b) => b.depth - a.depth || (b.inj.order ?? defaultOrder) - (a.inj.order ?? defaultOrder),
  );
  // The last stable canon row (part 01 §1c): a depth-1 assistant injection landing same-role against it
  // would mutate the cached prefix once squashed → re-frame it to a user operator note instead.
  const boundaryLen = opts.prefixBoundaryLen;
  const stableTailRole =
    boundaryLen !== undefined && boundaryLen >= 1 ? history[boundaryLen - 1]?.role : undefined;
  const result: (T | { role: WireRole; content: string })[] = [...history];
  for (const { inj, depth } of sorted) {
    // A depth-1 assistant injection sits immediately above the volatile tail — adjacent to the last stable
    // canon row. When that row is ALSO assistant, keeping the injection assistant-role would fold it into
    // the cached prefix (part 01 §1c) → re-frame it through the one-home operator channel to a user note.
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
