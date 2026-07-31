// The ONE assistant@depth-0-prefill warning copy (C11 rollup) — was hand-typed at each of the three
// `isAssistantPrefill` (`@orb/kit/injection`) consumer editors (character-advanced-tab, room-overrides-
// form, persona-editor) and had already drifted ("pick depth ≥ 1" vs "Use depth ≥ 1").

import type { ChatUnavailableCause } from "@orb/contracts/connection";

export const ASSISTANT_PREFILL_WARNING = "Assistant role at depth 0 is a response prefill — unsupported across providers. Use depth ≥ 1, or role system/user.";

// The disabled-affordance hover reasons for a DRAFT chat (#8 grey-out — owner: "when it's disabled on
// hover tell why", and the reason must NAME the unlock condition, not just "unavailable in draft"). Shared
// by the ⋯ chat-options menu + the composer wand so a draft-disabled control's tooltip reads identically
// everywhere. One home (no magic-string drift across the two menus).

/** Actions that unlock the moment the draft commits to a real chat (its first send). */
export const DRAFT_UNLOCK_AFTER_SEND = "Available after you send the first message";

/** Swipe/continue/regenerate — need an assistant reply already in the chat to target (true for a draft:
 *  no messages yet; also true for a committed chat whose latest turn isn't an assistant reply). */
export const NEEDS_ASSISTANT_REPLY = "Needs an assistant reply to work on — send a message first";

/** Undo/revert the last continuation — need a continue to have run on this reply's shown swipe first
 *  (the D26 snapshot columns are empty until then). Phase-gate, never hidden (owner: no reduced menus). */
export const NEEDS_CONTINUATION = "Continue this reply first — there's no added text to undo yet";

// The composer's own disabled-affordance hover reasons — the empty composer is the FIRST thing a user
// sees on a fresh draft, so its two secondary actions (the guided-generations wand + generate-image)
// must explain their unlock on hover, not sit silently native-disabled. Each names WHAT to do to enable.

/** The guided-generations wand trigger — the typed text is the guidance, so an empty composer disables it. */
export const WAND_NEEDS_TEXT = "Type a message to guide the response";

/** The generate-image-from-text button when the composer is empty — the typed text IS the image prompt. */
export const IMAGE_GEN_NEEDS_TEXT = "Type a message to turn into an image";

/** The generate-image-from-text button on a DRAFT — image generation posts into a real chat, so it needs
 *  the chat to exist first (the draft's first send commits it). */
export const IMAGE_GEN_NEEDS_CHAT = "Send the first message, then generate images from your text";

// P5 CYOA — the choice-button disabled reasons (§5.3: the button disables once a turn is in flight; a
// provider-less/preview mount has no send capability at all). Named unlocks, never a bare "unavailable".

/** A choice button while a turn is already running — it re-enables when the turn settles. */
export const CHOICE_WAIT_FOR_TURN = "Wait for the current reply to finish, then pick";

/** A choice button in a surface with no send capability (a preview / read-only mount). */
export const CHOICE_NEEDS_LIVE_CHAT = "Open the chat to pick a choice";

// The composer GUIDED-CLUSTER phase reasons (W-D — the four always-visible dual-mode icons). Each icon is
// never hidden or swapped ([[no-separate-reduced-modes]]); a phase-unavailable icon renders aria-disabled
// with its reason LEGIBLE + touch-surfaced (not hover-only). Named unlocks, plain language, no jargon.

// The composer guided-icon disabled reasons read as the CLAUSE after the icon's label + em-dash (the title
// is composed `"<Label> — <reason>"`, so a disabled icon names WHAT it is AND why it's off), e.g.
// "Swipe — needs a reply to reroll". Lowercase, no trailing period, phrased as the unlock condition.

/** Impersonate while a turn is already running — it writes the USER's next (or opening) line, so it is valid
 *  on a draft AND every committed phase; the ONLY block is a turn in flight (it re-enables when idle). On a
 *  draft, firing commits the chat with no auto-opening and the impersonated line IS the first message. */
export const IMPERSONATE_WAIT_FOR_TURN = "wait for the current reply to finish";

/** Swipe/Regenerate — needs an assistant reply in the chat to reroll (a draft, or a user-tail chat, has none;
 *  on a fresh draft, use Generate opening or Impersonate to write the first message). */
export const SWIPE_NEEDS_REPLY = "needs a reply to reroll (try Generate opening or Impersonate first)";

/** The ✨-menu Regenerate row's hover helper — distinguishes it from the top-row Swipe icon: Regenerate is a
 *  PLAIN reroll (ignores any typed steer), Swipe is the steer-aware reroll. Both reroll the tail assistant. */
export const REGENERATE_PLAIN_HELPER = "Plain reroll of the last reply — ignores your typed steer.";

/** Continue — needs an assistant reply to extend (a draft, or a user-tail chat, has none; on a fresh draft,
 *  use Generate opening or Impersonate to write the first message). */
export const CONTINUE_NEEDS_REPLY = "needs a reply to continue (try Generate opening or Impersonate first)";

/** The hover cue shown on a guided icon while the composer HAS text — teaches the typed-text-becomes-steer
 *  contract at the point of action (defuses the invisible mode-switch). Per-icon variants read naturally. */
// The guided-IMPERSONATE failure surface. Impersonate rides a SUBSCRIPTION, not a mutation, so it has no
// `meta.errorToast` seam — the hook toasts these itself, and without them a failed draft was completely
// silent (the owner's dead-engine incident: every impersonate died in ~2ms with nothing on screen). Composed
// `"<lead> <detail>"`: the lead names WHAT failed (and, on the draft path, what SURVIVED), the detail is the
// server's own terminal-frame message when the stream carried one, else GENERATION_FAILED_DETAIL.

/** Impersonate failed on a committed chat. It persists nothing, so there is no half-written turn to explain. */
export const IMPERSONATE_FAILED_LEAD = "Couldn't draft your line.";

/** The draft composite: `startChat` already COMMITTED (the room exists and is open) and only the drafting
 *  generation failed — the lead must say so, or the user reads the toast as "nothing happened" and re-fires,
 *  minting a second room. */
export const IMPERSONATE_AFTER_COMMIT_FAILED_LEAD = "Your chat was created, but drafting your line failed.";

/** The detail for a failure that carries no server message (a transport/link fault — its message is framework
 *  text like "Unknown error", never user copy). */
export const GENERATION_FAILED_DETAIL = "The generation didn't complete — check the connection and try again.";

export const STEER_CUE_RESPONSE = "Uses your typed text as direction";
export const STEER_CUE_SWIPE = "Uses your typed text to steer the reroll";
export const STEER_CUE_CONTINUE = "Uses your typed text to steer the continuation";
export const STEER_CUE_IMPERSONATE = "Uses your typed text as impersonation direction";

// The honest-refusal pre-send reasons (#54) — when the chat's resolved connection cannot deterministically
// serve a turn, SEND + the guided fire actions are disabled with the reason surfaced (title + aria-disabled).
// The copy adapts to the CAUSE (the gate is ONE engine-agnostic check); each names the ACTIONABLE unlock,
// never a bare "unavailable". Full sentences (composed alone, not after an em-dash) with a trailing period.

const SEND_UNAVAILABLE_REASON: Record<ChatUnavailableCause, string> = {
  // A local inference engine is disabled/absent — enable it (or switch the chat to a hosted connection).
  "engine-off": "Local engine is off — enable it to send.",
  // A registered local engine is DEAD and won't self-recover (down under adopt-only) — start it.
  "engine-down": "Local engine is down — start it to send.",
  // No working connection (no credential row / no configured connection / broken routing).
  "no-connection": "This chat has no working connection — configure one to send.",
  // The generic fallback: the resolved backend isn't serveable and no specific cause fits.
  unavailable: "No engine connected.",
};

/** The composer disabled-reason for an unavailable cause — the single home the Send button + the guided fire
 *  actions read, so the copy can't drift between the two surfaces. Exhaustive over `ChatUnavailableCause`. */
export function sendUnavailableReason(cause: ChatUnavailableCause): string {
  return SEND_UNAVAILABLE_REASON[cause];
}
