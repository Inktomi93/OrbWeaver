// The ONE assistant@depth-0-prefill warning copy (C11 rollup) — was hand-typed at each of the three
// `isAssistantPrefill` (`@orb/kit/injection`) consumer editors (character-advanced-tab, room-overrides-
// form, persona-editor) and had already drifted ("pick depth ≥ 1" vs "Use depth ≥ 1").

import type { UnavailableCause } from "@orb/contracts/inference";
import type { ChatControlMode } from "./contribution-contracts.ts";

export const ASSISTANT_PREFILL_WARNING = "Assistant role at depth 0 is a response prefill — unsupported across providers. Use depth ≥ 1, or role system/user.";

// `DRAFT_UNLOCK_AFTER_SEND` ("Available after you send the first message") was DELETED 2026-08-14: it was the
// #8 grey-out reason for every ⋯ action a rowless room could not perform (rename, delete, message selection).
// A chat row exists from the creation click (D166), so those actions
// are simply available and there is no phase left to explain.

/** Undo/revert the last continuation — need a continue to have run on this reply's shown swipe first
 *  (the D26 snapshot columns are empty until then). Phase-gate, never hidden (owner: no reduced menus). */
export const NEEDS_CONTINUATION = "Continue this reply first — there's no added text to undo yet";

// The composer's own disabled-affordance hover reasons — the empty composer is the FIRST thing a user
// sees in a fresh room, so its secondary actions (the guided-generations wand + generate-image) must explain
// their unlock on hover, not sit silently native-disabled. Each names WHAT to do to enable.

/** The generate-image-from-text button when the composer is empty — the typed text IS the image prompt. */
export const IMAGE_GEN_NEEDS_TEXT = "Type a message to turn into an image";

// The two IMAGE DOORS in the ✨ Media group name what they cost, because both of them cost (#623 P1). The
// fast door spends the moment it is clicked with nothing shown first; the /imagine door is the one that lets
// you pick a mode and read the prompt before paying. Neither reason is a disabled-state message — these are
// enabled-row `title` helpers, the REGENERATE_PLAIN_HELPER idiom.

/** The ENABLED generate-image-from-text row's helper — it spends immediately, with no preview step. */
export const IMAGE_GEN_SPENDS_NOW = "Spends right away — your typed text is sent as the prompt, as-is.";

/** The ✨-menu row that opens the `/imagine` modal — the mode + preview door, findable without typing `/`. */
export const IMAGINE_DOOR_HELPER = "Pick a mode, preview the prompt (and its price) before the image spend — the /imagine surface.";

/** The shared-room sentence at the image doors: both post the generated picture into the chat. */
export const ROOM_PICTURES_NOTE = "Pictures you generate post to this chat, where everyone in it sees them.";

// `IMAGE_GEN_NEEDS_CHAT` ("Send the first message, then generate images from your text") was DELETED
// 2026-08-14: image generation posts into a real chat, and the room now HAS one from the creation click.

// P5 CYOA — the choice-button disabled reasons (§5.3: the button disables once a turn is in flight; a
// provider-less/preview mount has no send capability at all). Named unlocks, never a bare "unavailable".

/** A choice button while a turn is already running — it re-enables when the turn settles. */
export const CHOICE_WAIT_FOR_TURN = "Wait for the current reply to finish, then pick";

/** A choice button in a surface with no send capability (a preview / read-only mount). */
export const CHOICE_NEEDS_LIVE_CHAT = "Open the chat to pick a choice";

// S1 — the in-chat CONTROL band. Its `send` arm reuses
// CHOICE_WAIT_FOR_TURN above (the same fact, the same words: a turn is in flight, pick when it settles);
// these two are the copy the band adds. `compose` needs none — it is never disabled.

/** An `execute` control whose OWN verb call is already in flight (never a turn — it re-enables on settle). */
export const CONTROL_ACTION_RUNNING = "Already running — wait for it to finish";

/** The ENABLED control's `title` — the mode's CONSEQUENCE, in the enabled-row helper idiom
 *  (`REGENERATE_PLAIN_HELPER` above, `IMAGE_GEN_SPENDS_NOW` below: an operable affordance may still owe a
 *  hover sentence). side-eye 2026-08-24 P3 (#674): `title` was set ONLY when a control was DISABLED, so an
 *  operable chip named its consequence nowhere on the pointer path — the glyph and the accessible-name
 *  prefix say WHICH mode, neither says what the click COSTS, and `send` posts a turn with no confirm step.
 *  A disabled control's REASON still wins the attribute (a blocked affordance owes its unlock first).
 *  Exhaustive over the mode axis: a new `CHAT_CONTROL_MODES` member fails `tsc` here until it declares
 *  what its click does (§5.5 string-union dispatch discipline). */
export const CONTROL_MODE_CONSEQUENCE: Record<ChatControlMode, string> = {
  send: "Sends as your line",
  compose: "Drafts into your composer",
  execute: "Runs now — nothing is sent",
};

/** The mode WORD — the chip's visible mode channel AND the prefix of its accessible name (side-eye
 *  2026-08-24 #684 P1: the two dresses differed only by a 16px glyph, and a `send` chip posts a turn the
 *  instant it is clicked. "Never by colour alone" generalises to "never by shape alone" — a 16px silhouette
 *  is a weaker channel than colour, not a stronger one). It is COPY, so it is homed here beside
 *  `CONTROL_MODE_CONSEQUENCE` rather than in the band: the same word is rendered and spoken, which is what
 *  keeps the accessible name a superset of the visible label (WCAG 2.5.3 label-in-name / voice control).
 *  Exhaustive over the mode axis — a new `CHAT_CONTROL_MODES` member fails `tsc` here (§5.5). */
export const CONTROL_MODE_WORD: Record<ChatControlMode, string> = {
  send: "Send",
  compose: "Draft",
  execute: "Run",
};

/** The undisclosed remainder, in the ONE grammar both stacks use: the cards' "+N pending" (only the newest
 *  card is shown — the attention budget) and the chips row's overflow past its display cap. */
export function controlOverflowNotice(hidden: number, noun: "pending" | "more"): string {
  return `+${hidden} ${noun}`;
}

/** The chip disclosure's EXPANDED label (#684 P2). The collapsed one is `controlOverflowNotice` — the same
 *  "+N more" grammar the cards use — but on a chip row it now labels a real expander rather than a dead
 *  `<p>`, so it needs a way back. */
export const CONTROL_CHIPS_COLLAPSE = "Show fewer";

/** The chip row's COARSE resting label (#2426). At a coarse pointer the band's resting state is ONE ROW —
 *  the disclosure alone — so what it reveals is the WHOLE row rather than the remainder past the display
 *  cap, and the `+N more` grammar would be naming the wrong number. Reads as the pair of
 *  {@link CONTROL_CHIPS_COLLAPSE} ("Show N controls" / "Show fewer"), the same verb-led disclosure register
 *  the Characters pane's `More filters` / `Fewer filters` uses (docs/law/vocabulary-map.md). */
export function controlStripNotice(count: number): string {
  return `Show ${String(count)} ${count === 1 ? "control" : "controls"}`;
}

// The composer GUIDED-CLUSTER phase reasons (W-D — the four always-visible dual-mode icons). Each icon is
// never hidden or swapped ([[no-separate-reduced-modes]]); a phase-unavailable icon renders aria-disabled
// with its reason LEGIBLE + touch-surfaced (not hover-only). Named unlocks, plain language, no jargon.

// The composer guided-icon disabled reasons read as the CLAUSE after the icon's label + em-dash (the title
// is composed `"<Label> — <reason>"`, so a disabled icon names WHAT it is AND why it's off), e.g.
// "Try another reply — needs an existing reply". Lowercase, no trailing period, phrased as the unlock condition.

/** Impersonate while a turn is already running — it writes the USER's next (or opening) line, so it is valid
 *  in every phase of a room; the ONLY block is a turn in flight (it re-enables when idle). */
export const IMPERSONATE_WAIT_FOR_TURN = "wait for the current reply to finish";

/** The Response icon's IDLE cue in a multi-character room, where its trigger opens the speaker submenu. #539
 *  retired the standalone speak-as dropdown that used to sit beside it (both fired `chat.generate` with a
 *  `speakerCharacterId`; only the submenu also carries the typed steer and the `afterAssistant` nudge), so
 *  this control is now the ONE door to "who replies next" and its tooltip has to say so. Reads as the clause
 *  after the label + em-dash, like every other cue here. */
export const RESPONSE_SPEAKER_CUE = "choose who speaks next";

/** IMP-2 — why EVERY guided icon is idled while the impersonate STREAM is filling the composer. The generic
 *  IMPERSONATE_WAIT_FOR_TURN names a reply that isn't running (nothing is being generated into the
 *  transcript), so it read as a phantom turn the user couldn't see, find, or stop. This names the real cause
 *  — and the Stop beside the icons is how it ends. */
export const IMPERSONATE_IN_FLIGHT = "drafting your line (Stop keeps what's written)";

/** The impersonate Stop's accessible name + hover title (it renders only while the stream is live). */
export const IMPERSONATE_STOP_LABEL = "Stop drafting your line";

/** Swipe/Regenerate — needs an assistant reply in the chat to reroll (a user-tail or greeting-less room has
 *  none; Generate reply or Impersonate produces one). */
export const SWIPE_NEEDS_REPLY = "needs an existing reply (try Generate reply or Draft your line first)";

/** The ✨-menu Regenerate row's hover helper — distinguishes it from the top-row Swipe icon: Regenerate is a
 *  PLAIN reroll (ignores any typed steer), Swipe is the steer-aware reroll. Both reroll the tail assistant. */
export const REGENERATE_PLAIN_HELPER = "Creates another version of the last reply — ignores your typed direction.";

/** The ✨-menu "Offer choices" row's hover helper (R3/B1). Its whole job is to distinguish the ONE-SHOT ask
 *  from the STANDING posture that wears the same two words in the "This chat" tab — a user who found only one
 *  of them would reasonably read it as the other, and then either wonder why it stopped or why it will not.
 *  Names the door to the standing one, since that is the setting people go looking for. */
export const OFFER_CHOICES_ONE_SHOT = "Asks for choices at the end of the NEXT reply only. For every reply, turn on Offer choices in This chat.";

/** The hover cue shown on a guided icon while the composer HAS text — teaches the typed-text-becomes-steer
 *  contract at the point of action (defuses the invisible mode-switch). Per-icon variants read naturally. */
// The guided-IMPERSONATE failure surface. Impersonate rides a SUBSCRIPTION, not a mutation, so it has no
// `meta.errorToast` seam — the hook toasts this itself, and without it a failure was completely silent (the
// owner's dead-engine incident: every impersonate died in ~2ms with nothing on screen). Composed
// `"<lead> <detail>"`: the lead names WHAT failed, the detail is the server's own terminal-frame message when
// the stream carried one, else GENERATION_FAILED_DETAIL.
//
// THE TWO "your chat was created, but…" COMPOSITES ARE DELETED (2026-08-14). Both existed because a fire
// could CREATE the room as a side effect and then fail — `IMPERSONATE_AFTER_COMMIT_FAILED_LEAD` on the draft
// impersonate path, `OPENING_AFTER_COMMIT_FAILED_LEAD`/`_HINT` on START-1's degraded `startChat` — so the
// copy had to tell the user a room survived a failure they would otherwise read as "nothing happened" and
// retry, minting a second one. Creation is unfused from generation (D166
// §4.4): a fire never creates, so it can never half-create.

/** Impersonate failed. It persists nothing, so there is no half-written turn to explain. */
export const IMPERSONATE_FAILED_LEAD = "Couldn't draft your line.";

/** The detail for a failure that carries no server message (a transport/link fault — its message is framework
 *  text like "Unknown error", never user copy). */
export const GENERATION_FAILED_DETAIL = "The generation didn't complete — check the connection and try again.";

export const STEER_CUE_RESPONSE = "Uses your typed text as direction";
export const STEER_CUE_SWIPE = "Uses your typed text as direction for another reply";
export const STEER_CUE_CONTINUE = "Uses your typed text as direction to continue the reply";
export const STEER_CUE_IMPERSONATE = "Uses your typed text as drafting direction";

// The honest-refusal pre-send reasons (#54) — when the chat's resolved connection cannot deterministically
// serve a turn, SEND + the guided fire actions are disabled with the reason surfaced (title + aria-disabled).
// The copy adapts to the CAUSE (the gate is ONE engine-agnostic check); each names the ACTIONABLE unlock,
// never a bare "unavailable". Full sentences (composed alone, not after an em-dash) with a trailing period.

const SEND_UNAVAILABLE_REASON: Record<UnavailableCause, string> = {
  // No connection is BOUND to your Chat role (§7.2). A saved connection binds nothing on its own, so the copy
  // names the role picker, not only "add one".
  "no-connection": "No connection is set for Chat — add one or pick one under Model roles in Settings → Connections to send.",
  // The bound endpoint row's server did not answer its reachability probe (or a wake timed out).
  "endpoint-unreachable": "Can't reach your model's server — it may be down.",
  // A `claude-sub` row on a deployment where the Claude runtime does not resolve (§5.3a).
  "runtime-missing": "The Claude subscription runtime isn't installed on this server — pick another connection to send.",
  // The bound row has `allowBackground` off and the task runs unattended (§5.3a).
  "background-refused": "Your connection doesn't allow background work — enable it in Settings → Connections.",
  // The bound row's model cannot meet the task's requirement (a text-only model bound to chat with images, …).
  "requirement-unmet": "Your connection's model can't serve this chat — pick another in Settings → Connections.",
  // The generic fallback: the resolved wire isn't built on this deployment and no specific cause fits.
  unavailable: "That connection isn't available on this server.",
  // An in-process model (local-light) whose latest load failed; the next call retries the load.
  "model-load-failed": "Your connection's built-in model failed to load on this server — send again to retry.",
};

/** The composer disabled-reason for an unavailable cause — the single home the Send button + the guided fire
 *  actions read, so the copy can't drift between the two surfaces. Exhaustive over `UnavailableCause`. */
export function sendUnavailableReason(cause: UnavailableCause): string {
  return SEND_UNAVAILABLE_REASON[cause];
}
