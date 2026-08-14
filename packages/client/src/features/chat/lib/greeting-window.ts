// The GREETING WINDOW — the pure half of the seeded-greeting step (chat-creation-draft-mode-replacement.md
// §4.8 / fork F6, R3).
//
// A seeded greeting is real canon from the creation click (R1) and stays malleable until the room's FIRST
// USER TURN, which is where the server bakes its volatile macros (`freezeGreetingVolatiles`, verbs/turn.ts)
// and `chat.setSeededGreeting` starts refusing. This module owns the client's read of that window, and it is
// deliberately the SAME predicate the server enforces — "is there any user-role canon row" — so the two
// cannot drift into a control that renders and then always fails.
//
// WHY THE CLIENT CHECKS AT ALL, given the server re-checks: a control that is on screen and doomed reads as
// broken. The server's refusal is the authority; this is the affordance.

import type { MessageView } from "@orb/contracts/chat";

/** Binds a row to the card alternates it may be stepped through. Present ⇒ `message-row` renders the greeting
 *  strip instead of the variant strip. */
export interface GreetingBinding {
  /** The character card's `greetings[]` texts, in card order — the strip's `n / m` domain and the INDEX the
   *  verb resolves against. */
  readonly variants: readonly string[];
}

/** At least two alternates — one is not a pager, it is a sentence (the `SwipeStrip` "a pager needs pages"
 *  ruling, applied to the same chrome). */
const STEPPABLE_FLOOR = 2;

/** Is this room still in its greeting window? True until ANY user-role row exists — the server's own
 *  predicate (`loadHasUserMessage`). An empty transcript is open by construction. */
export function isGreetingWindowOpen(messages: readonly MessageView[]): boolean {
  return !messages.some((m) => m.role === "user");
}

/** The binding for ONE row, or undefined when it is not a steppable seeded greeting. A row qualifies when the
 *  window is open, it is character-voiced assistant canon, and its card offers ≥2 alternates — the same three
 *  facts the verb's belts check, minus the authority (which the server owns alone). */
export function resolveGreetingBinding(args: {
  readonly windowOpen: boolean;
  readonly message: MessageView;
  readonly alternatesByCharacter: ReadonlyMap<string, readonly string[]>;
}): GreetingBinding | undefined {
  const { windowOpen, message, alternatesByCharacter } = args;
  if (!windowOpen || message.role !== "assistant" || message.characterId === null) {
    return;
  }
  const variants = alternatesByCharacter.get(message.characterId);
  return variants !== undefined && variants.length >= STEPPABLE_FLOOR ? { variants } : undefined;
}
