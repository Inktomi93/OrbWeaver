// The ONE assistant@depth-0-prefill warning copy (C11 rollup) — was hand-typed at each of the three
// `isAssistantPrefill` (`@orb/kit/injection`) consumer editors (character-advanced-tab, room-overrides-
// form, persona-editor) and had already drifted ("pick depth ≥ 1" vs "Use depth ≥ 1").

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

/** Impersonate on a DRAFT — it needs the turn machinery a committed chat has (it writes a USER line, so it
 *  is valid on BOTH committed phases; only a draft lacks the chat to write into). */
export const IMPERSONATE_NEEDS_CHAT = "Send your first message to impersonate a reply.";

/** Swipe/Regenerate — needs an assistant reply in the chat to reroll (a draft, or a user-tail chat, has none). */
export const SWIPE_NEEDS_REPLY = "Needs a reply to regenerate.";

/** Continue — needs an assistant reply to extend (a draft, or a user-tail chat, has none). */
export const CONTINUE_NEEDS_REPLY = "Needs a reply to continue.";

/** The hover cue shown on a guided icon while the composer HAS text — teaches the typed-text-becomes-steer
 *  contract at the point of action (defuses the invisible mode-switch). Per-icon variants read naturally. */
export const STEER_CUE_RESPONSE = "Uses your typed text as direction";
export const STEER_CUE_SWIPE = "Uses your typed text to steer the reroll";
export const STEER_CUE_CONTINUE = "Uses your typed text to steer the continuation";
export const STEER_CUE_IMPERSONATE = "Uses your typed text as impersonation direction";
