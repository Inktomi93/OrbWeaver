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
