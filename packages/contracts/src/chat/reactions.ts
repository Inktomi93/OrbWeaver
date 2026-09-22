// @orb/contracts/chat/reactions — the B6/MR0 message-reaction wire contract: the emoji VOCABULARY, the
// grouped read projection a pill row renders, and the room's read WINDOW bound.
//
// THE THREE LOAD-BEARING DECISIONS (MA-2 — `docs/architecture/proposed/message-reactions-mini-spec.md`):
//   • ANCHOR = the VARIANT (Open-Q A, ruled variant-level). Content is `message_variants`-owned (D26), so a
//     reaction to "this reply" is a reaction to ONE swipe's text; a fresh regeneration legitimately starts
//     empty and swiping back shows that swipe's own set. The pill row therefore keys on the row's
//     `selectedVariantId`, which also makes a swipe free client-side (no refetch — the window already holds
//     the siblings, the `rpg.listTurnToolCalls` posture).
//   • REACTOR = a `chat_participants` SEAT (D80). One column covers every plane — a human member, a
//     character (B7's `react` tool), and the reserved agent — with no `reactorKind` discriminant, and a
//     non-member is structurally unable to react because they have no seat (D18).
//   • GROUPING IS A READ PROJECTION, never a stored array. The DB holds one row per reactor; this module's
//     {@link MessageReactionGroup} is the `GROUP BY (variantId, emoji)` view. Marinara's stored-grouped
//     `extra.reactions` blob does NOT port: it is single-user by construction (a read-modify-write of the
//     whole array), and two members toggling the same message concurrently lose-update it.
//
// SEGMENT TARGETING (B7/MR3): a reaction may anchor to ONE speaker's line — a `parseSpeakerSpans` LINE
// index over the variant's STORED CANON (never display text; the renderer parses post-regex/macro bytes
// no other surface shares). The persisted trio is `(segmentIndex, segmentSpeaker, segmentSnippet)`: the
// anchoring fitness suite (`tests/kit/speaker-label/anchoring.suite.test.ts`) proved a bare index is not
// edit-stable and `(index, speaker)` is defeated by a same-speaker insert, so the snippet is the
// fingerprint — and a stale trio DEGRADES to whole-message rather than mis-attaching (MA-2 §2; the one
// rule is kit's `resolveSegmentAnchor`, shared by the client display and the server attribution read).

import type { AssetId, ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import { z } from "zod";

/** THE REACTION EMOJI VOCABULARY — a closed tuple, and the picker's own content in this order.
 *
 *  WHY A CLOSED TUPLE RATHER THAN FREE TEXT: the column is the write surface a member reaches directly, and
 *  an open string there is the `open-json-column`/allow-list-blind class (a member could store arbitrary
 *  bytes, of any length, that every other member's transcript then renders). A vocabulary the picker
 *  enumerates costs nothing and makes the un-renderable case unrepresentable.
 *
 *  WHY IT IS NOT ALSO A DB `CHECK`, stated so the omission reads as a decision: Open-Q D ruled CUSTOM
 *  (CAS-backed) emoji SHIP, so this vocabulary is OPEN BY DESIGN in a way the enum columns of this schema
 *  are not. A tuple-derived CHECK would make widening it a second baseline squash; validation lives at the
 *  wire (this schema) plus the verb's own re-parse instead, and the column stays plain TEXT. */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "😡", "🔥", "🎉", "👀", "🤔"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export const reactionEmojiSchema = z.enum(REACTION_EMOJIS) satisfies z.ZodType<ReactionEmoji>;

/** How deep a scrollback the pill row can answer for, in reacted MESSAGE SLOTS. The room-scoped read is one
 *  bounded window the client indexes by `variantId` (the `rpg.listTurnToolCalls` shape, and windowed by SLOT
 *  for the same reason: rows are per-VARIANT, so a reroll-heavy slot would otherwise spend the budget on
 *  swipes nobody can look at while an older SELECTED variant still on screen went dark). Homed here so the
 *  wire ceiling, the domain's clamp and the client's ask are one number. */
export const CHAT_REACTION_SLOT_WINDOW = 200;

/** ONE emoji's chip on one variant — the Discord grouping, computed at read.
 *
 *  `reactorParticipantIds` is the FULL reactor list rather than a count: the row needs it to decide
 *  `aria-pressed` for the VIEWER'S own seat (a count cannot answer "did I react?") and to name the reactors
 *  in the chip's title. Ids only — a participant's display name is the roster's projection, resolved by the
 *  surface that already holds it, never re-spelled onto this shape.
 *
 *  `emojiImageAssetId` is BORN AND TYPED, always `null` through MR0-MR2 (Open-Q D — custom emoji ships, its
 *  picker surface does not ship here). The COLUMN exists now because the schema is baseline-squashed
 *  pre-launch and a CAS-referencing column costs a whole merge window to add later; the WIRE stays
 *  unicode-only, so a custom-emoji ask is refused by {@link reactionEmojiSchema} until its arm lands. */
export interface MessageReactionGroup {
  readonly variantId: MessageVariantId;
  /** The segment anchor (B7/MR3), or all-null for a whole-message reaction. The trio is stored FROM THE
   *  SERVER'S OWN PARSE at write time (a member's claim is validated, never stored — no free-text write
   *  surface into a column every transcript renders). Staleness is the READER's job: re-resolve through
   *  kit's `resolveSegmentAnchor` and render a failed anchor as whole-message. */
  readonly segmentIndex: number | null;
  readonly segmentSpeaker: string | null;
  readonly segmentSnippet: string | null;
  /** The stored token, typed to the VOCABULARY rather than to the column.
   *
   *  The column is plain TEXT (the vocabulary is open by design — the custom `:name:` arm), so this is a
   *  claim about the WRITE BOUNDARY, not about SQLite: the toggle verb is the only producer and it parses
   *  every token through {@link reactionEmojiSchema} twice (the wire and the verb). Typing the read side to
   *  `string` instead would push a "is this a known emoji?" narrowing into every renderer for a state no
   *  writer can produce — and would make the picker's own pressed-state comparison a cast. When the custom
   *  arm lands it WIDENS this union in one place and both sides follow. */
  readonly emoji: ReactionEmoji;
  /** The custom-emoji image (D21 CAS), typed-and-unwired through MR0-MR2 — see the type's note. */
  readonly emojiImageAssetId: AssetId | null;
  readonly reactorParticipantIds: readonly ChatParticipantId[];
}

/** The `listReactions` wire (B7) — the grouped window PLUS the room's RESOLVED reactions posture.
 *
 *  WHY THE VERDICT RIDES THIS READ and not `ChatDetail`: `reactionsEnabled` resolves room-value-else-HOST-
 *  default (`resolveReactionsEnabled`), and only the SERVER can read the host's `UserSettings.chat` — a
 *  member's client cannot resolve a null room value locally, and stamping a resolved boolean onto the chat
 *  detail would put a settings read on a canon projection. This is the read every reaction surface already
 *  consumes, so `enabled:false` makes the pills AND the picker doors vanish for every member off one wire. */
export interface ChatReactionsView {
  readonly reactionsEnabled: boolean;
  readonly groups: readonly MessageReactionGroup[];
}

/** The `react` tool's registry key + wire `function.name` — minted ONCE (the plugin-tool one-mint law):
 *  the ToolDefinition, the S2 attach contribution and every test spell it from here. */
export const CHAT_REACT_TOOL_NAME = "react";

/** The stored segment snippet's cap (chars, over the span's TRIMMED text — kit `segmentSnippet`). Long
 *  enough to fingerprint a line against a same-speaker insert; short enough that a row is never a second
 *  copy of the message. */
export const REACTION_SEGMENT_SNIPPET_MAX = 120;

/** The wire bound for a speaker/character NAME argument on the reaction surfaces (the `toggleReaction`
 *  segment claim, the `react` tool's `character`/`toSpeaker`) — the `<speaker>` tag grammar's own cap
 *  (`SPEAKER_TAG_PAIR` tolerates up to 200 chars between the tags), so a name the span parser could have
 *  produced always fits and anything longer is refused at the boundary. */
export const REACTION_SPEAKER_NAME_MAX = 200;

/** B7/MR4 — the prompt-attribution loop's bounds (the mini-spec §6 caps, ruled owner-tunable in shape;
 *  the tunable SURFACE is a recorded flip — these constants are the one built home).
 *  `MAX_PER_MESSAGE` = most-recent K reactions attributed per message (a brigaded message cannot blow the
 *  prompt budget); `CONTENT_CAP` = bodies past it skip re-segmentation (whole-message note only — the
 *  Marinara `REACTION_ANNOTATION_CONTENT_CAP` precedent); `SLOT_WINDOW` = how many newest reacted slots
 *  the loop reads at all (recency is the loop's whole value — the model acknowledges what just happened). */
export const REACTION_ATTRIBUTION_MAX_PER_MESSAGE = 8;
export const REACTION_ATTRIBUTION_CONTENT_CAP = 32_000;
export const REACTION_ATTRIBUTION_SLOT_WINDOW = 10;
