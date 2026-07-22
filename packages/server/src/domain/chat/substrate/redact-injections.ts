// domain/chat/substrate/redact-injections — the ONE host-audience redaction helper (chat-crew-design/04 §2,
// design-review CREW-6). A `ChatInjection` may carry `audience:"host"` (the director's host-ring guidance is
// the first user): the MODEL always sees it, but a prompt-inspection projection served to a NON-host human must
// elide its content. This is the structural belt every snapshot-serving projection routes through, so a
// host-ring injection can never leak through a prompt-inspection surface — a prose-only "don't enable it in
// spoiler chats" rule is a wish (core/AGENTS.md §2), this is a placement the projection layer enforces.
//
// PURE. It elides only the `afterHistory` bucket — the one `ChatInjection[]` an `AssembledPrompt` carries
// (`static`/`dynamic` are already-rendered strings; a host-audience section that rendered INTO them would be a
// separate future concern, flagged, not silently mishandled). Content is REPLACED by a fixed placeholder so the
// projection's shape (counts, ordering, depths) is unchanged — only the secret bytes go.

import type { AssembledPrompt, ChatInjection } from "@orb/contracts/chat";

/** The placeholder a redacted host-audience injection shows a non-host caller (content-free, shape-preserving). */
export const HOST_ONLY_INJECTION_PLACEHOLDER = "[host-only injection]";

function redactOne(injection: ChatInjection): ChatInjection {
  return injection.audience === "host" ? { ...injection, content: HOST_ONLY_INJECTION_PLACEHOLDER } : injection;
}

/**
 * Redact `audience:"host"` injections from an assembled prompt for a NON-host caller (chat-crew-design/04 §2).
 * `isHost` true ⇒ returned unchanged (the host sees the hidden hand — it is their tool). A prompt with no
 * host-audience injection is returned structurally identical either way.
 */
export function redactHostInjections(prompt: AssembledPrompt, isHost: boolean): AssembledPrompt {
  if (isHost || !prompt.afterHistory.some((i) => i.audience === "host")) {
    return prompt;
  }
  return { ...prompt, afterHistory: prompt.afterHistory.map(redactOne) };
}
