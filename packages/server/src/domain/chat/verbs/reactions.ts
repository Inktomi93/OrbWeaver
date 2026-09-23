// domain/chat/verbs/reactions — the message-reaction plane: `toggleReaction` + `listReactions` (B6/MR0-MR1)
// + the B7 additions: the segment anchor (MR3), the reactions-enabled posture gate, and `reactAsCharacter`
// (MR5 — the `react` tool's write half).
//
// CLASS-2-CONCURRENT. A reaction CONTRIBUTES to canon and is ALWAYS
// attributed — but it takes no turn slot, no arbitration, and no chat lock. That is not a shortcut; it is
// what the shape buys: the partial UNIQUEs make each toggle one atomic statement, so the concurrency the
// lock exists to serialize cannot occur (`persistence/reactions.ts` header).
//
// THE MEMBERSHIP FLOOR, not the host gate. Reactions are the room talking back, and every SEATED member
// speaks — `requireParticipant`, the `setVariables`/vars-plane posture, never `requireHost`. Two consequences
// the code below spells: a non-member's chatId collapses to a leak-free `ChatNotFoundError` before anything
// loads, and a MEMBER aiming a foreign variant id at their own room hits the variant's own belt
// (`loadVariantSlotInChat` — the `getVariantWire` two-gate shape).
//
// THE B7 POSTURE GATE (`resolveReactionsEnabled`): the room's own `chatMetadata.reactionsEnabled` over the
// PRESENT HOST's per-user default (which ships ON — B6 is a live feature; the knob makes it disableable).
// Enforced HERE, not merely hidden client-side: `toggleReaction` refuses coded, `listReactions` answers
// `{enabled:false, groups:[]}` (the verdict rides the read every reaction surface already consumes, so the
// pills and the picker doors vanish for every member off one wire), and `reactAsCharacter` refuses
// errors-as-data. The host default arrives through the injected `ctx.readReactionDefaults` op — no
// ForeignInputs exists outside the turn path, and chat never imports settings.
//
// THE POSTURE GATE IS ROOM-LEVEL; THE SEAT GATE IS THIS FILE'S ALONE (#1402, resolved 2026-09-04). The attach
// side (`teaching-contribution.ts`) puts the react tool on the wire when the ROOM's two knobs resolve on — it
// knows no seat, and the model names the character at CALL time — so `reactAsCharacter` is the only place a
// `disabled` (muted) character seat can be refused. That refusal is enforcement, not defence in depth.
//
// THE SEGMENT ANCHOR (MR3) is server-derived, claim-validated: the wire carries an index + the client's
// claimed speaker; this verb re-parses the variant's CANON with the room's present characters names
// (`loadPresentCharacterNames` — the client mirror is `speakerThemesByName`'s key set) and stores ITS OWN
// speaker + snippet from that parse. A claim the parse refutes is `invalid_segment` (a benign race —
// refusing beats silently retargeting a member's click), and free text never crosses the wire into a
// column every transcript renders.
//
// DURABLE-FIRST. The bus emit happens strictly AFTER the write commits, and ONLY when the write actually
// changed something (both persistence statements answer with `RETURNING`): a repeat add and a repeat remove
// are no-ops, and announcing one would repaint every other member's transcript for nothing — and would fire
// every `reactionsChanged` automation rule in the room off a click that changed no state.
//
// THE DIRECTION IS THE SERVER'S DECISION. The client sends "toggle this emoji", not "add"/"remove": a tab a
// repaint behind would otherwise re-add a reaction the reader just removed. The verb reads what the seat
// holds (the same keyed DELETE that removes it answers whether it was there) and returns the RESULTING state
// so the clicking tab can settle without waiting for its own bus round-trip.

import type { ChatMetadata, ChatReactionsView, DurableChatBusEvent, MessageReactionGroup, ReactionEmoji } from "@orb/contracts/chat";
import {
  CHAT_REACTION_SLOT_WINDOW,
  isNarratorVoiced,
  REACTION_SEGMENT_SNIPPET_MAX,
  reactionEmojiSchema,
  resolveCharactersCanReact,
  resolveReactionsEnabled,
} from "@orb/contracts/chat";
import type { ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import { parseSpeakerSpans, segmentSnippet } from "@orb/kit/speaker-label";
import type { ChatContext } from "../context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import { DEFAULT_CHAT_BEHAVIOR } from "../contract/foreign.ts";
import type { ListReactionsParams, ReactAsCharacterParams, StoredSegmentAnchor, ToggleReactionParams } from "../contract/params.ts";
import type { ReactAsCharacterOp } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { requireParticipant } from "../guard.ts";
import {
  deleteReaction,
  insertReaction,
  listChatReactions,
  loadCharacterSeatByName,
  loadNewestSelectedSlot,
  loadPresentCharacterNames,
  loadPresentHostUserId,
  loadReactorSeatId,
  loadVariantSlotInChat,
} from "../persistence/reactions.ts";

/** One row of the window read, taken off the query's OWN return type — the shape is that query's, and
 *  `no-inline-types` keeps a persistence file from exporting it as if it were a contract. */
type ReactionRow = Awaited<ReturnType<typeof listChatReactions>>[number];

/** The reaction verbs' collaborators not on `ChatContext`. The emit is typed to `DurableChatBusEvent` (the
 *  narrowing every durable emit surface takes) — `reactionsChanged` is canon and replays, so appending it is
 *  correct and a live-only member here would be a compile error. */
interface ReactionsDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
}

/** The room's RESOLVED reaction posture: room metadata over the PRESENT HOST's per-user defaults (the
 *  `resolveOfferChoices` precedence, per knob). A hostless/stale room resolves against
 *  {@link DEFAULT_CHAT_BEHAVIOR} — the same floor the turn path defaults to, so the two paths cannot
 *  disagree about what "nobody ever chose" means. */
async function resolveReactionPosture(
  ctx: ChatContext,
  chatId: Parameters<typeof loadPresentHostUserId>[1],
  metadata: ChatMetadata,
): Promise<{ readonly reactionsEnabled: boolean; readonly charactersCanReact: boolean }> {
  const hostUserId = await loadPresentHostUserId(ctx.db, chatId);
  const defaults = hostUserId === undefined ? DEFAULT_CHAT_BEHAVIOR : await ctx.readReactionDefaults(hostUserId);
  return {
    reactionsEnabled: resolveReactionsEnabled(metadata.reactionsEnabled, defaults.reactionsEnabled),
    charactersCanReact: resolveCharactersCanReact(metadata.charactersCanReact, defaults.charactersCanReact),
  };
}

/** Group the flat rows into the chip projection — `GROUP BY (variantId, emoji, segmentIndex)`, order
 *  preserved from the query (oldest reaction first within a chip, chips in first-reacted order per variant).
 *  A `Map` keyed on the tuple rather than a nested object: the key is composite and a nested record would
 *  need multiple lookups and a prototype guard for an emoji that happens to spell `__proto__`. The parts are
 *  joined on an ESCAPED NUL (`\u0000`, never a raw byte — `no-nul-bytes-in-source`): it is the one separator
 *  no id and no emoji can contain, so `a|bc` can never collide with `ab|c` (the index part is a number or
 *  the literal `w`, which no emoji is). The group's speaker/snippet are the FIRST (oldest) row's: rows in a
 *  group share `(variant, emoji, index)` by the partial unique, and if canon moved between two writes the
 *  oldest capture is the deterministic pick — staleness is re-judged at render anyway (kit
 *  `resolveSegmentAnchor`). */
function groupReactions(rows: readonly ReactionRow[]): readonly MessageReactionGroup[] {
  const byKey = new Map<
    string,
    {
      variantId: MessageVariantId;
      emoji: ReactionEmoji;
      emojiImageAssetId: ReactionRow["emojiImageAssetId"];
      segmentIndex: number | null;
      segmentSpeaker: string | null;
      segmentSnippet: string | null;
      reactors: ChatParticipantId[];
    }
  >();
  for (const row of rows) {
    // THE READ SEAM (the `parseChatMetadata` posture, never a cast): the column is plain TEXT — the
    // vocabulary is open by design — so the token is PARSED back into the wire union here. A row that
    // fails is DROPPED rather than thrown on: a projection degrades (`contentSpansToBlocks` doctrine),
    // and the only way to produce one today is a hand-written row, which must not break a room's pills.
    const token = reactionEmojiSchema.safeParse(row.emoji);
    if (!token.success) {
      continue;
    }
    const key = `${row.variantId}\u0000${row.emoji}\u0000${row.segmentIndex ?? "w"}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        variantId: row.variantId,
        emoji: token.data,
        emojiImageAssetId: row.emojiImageAssetId,
        segmentIndex: row.segmentIndex,
        segmentSpeaker: row.segmentSpeaker,
        segmentSnippet: row.segmentSnippet,
        reactors: [row.reactorParticipantId],
      });
      continue;
    }
    existing.reactors.push(row.reactorParticipantId);
  }
  return [...byKey.values()].map((g) => ({
    variantId: g.variantId,
    emoji: g.emoji,
    emojiImageAssetId: g.emojiImageAssetId,
    segmentIndex: g.segmentIndex,
    segmentSpeaker: g.segmentSpeaker,
    segmentSnippet: g.segmentSnippet,
    reactorParticipantIds: g.reactors,
  }));
}

/** The whole-message arm of {@link createReactAsCharacter}'s target resolution — one frozen value. */
const NO_SPEAKER_TARGET: { readonly segment: StoredSegmentAnchor | null; readonly target: string } = { segment: null, target: "the whole message" };

/** Resolve a `react` call's `toSpeaker` to that speaker's LAST canon span ("react to what they just
 *  said"). An unmatched name DEGRADES to whole-message with the degrade narrated — the model's intent to
 *  react is clear, its spelling of a name may not be, and a dropped reaction helps nobody. */
function resolveToSpeakerAnchor(
  content: string,
  characterNames: readonly string[],
  speaker: string,
): { readonly segment: StoredSegmentAnchor | null; readonly target: string } {
  const spans = parseSpeakerSpans(content, characterNames);
  const index = spans.findLastIndex((s) => s.speaker === speaker);
  const span = spans[index];
  if (index < 0 || span === undefined) {
    return { segment: null, target: `the whole message (no line by "${speaker}" found in it)` };
  }
  return {
    segment: { segmentIndex: index, segmentSpeaker: span.speaker, segmentSnippet: segmentSnippet(span.text, REACTION_SEGMENT_SNIPPET_MAX) },
    target: `${speaker}'s line`,
  };
}

/** Validate a member's segment CLAIM against the server's OWN canon parse and mint the stored trio.
 *  Throws `invalid_segment` on any mismatch — an out-of-range index or a span that is not the claimed
 *  speaker's is a content/roster race, and refusing beats landing the click on somebody else's line. */
function mintSegmentAnchor(
  content: string,
  characterNames: readonly string[],
  claim: { readonly index: number; readonly speaker: string | null },
): StoredSegmentAnchor {
  const span = parseSpeakerSpans(content, characterNames)[claim.index];
  if (span === undefined || span.speaker !== claim.speaker) {
    throw new ChatOperationError(CHAT_OP_CODES.invalidSegment, "That line has changed since you picked it — react again.");
  }
  return { segmentIndex: claim.index, segmentSpeaker: span.speaker, segmentSnippet: segmentSnippet(span.text, REACTION_SEGMENT_SNIPPET_MAX) };
}

/** The toggle's segment arm: absent claim ⇒ whole-message (`null`); present ⇒ validated + minted. The
 *  plain-`Name:` grammar's character-name set applies ONLY to a narrator-voiced row — the SAME `isNarratorVoiced`
 *  gate the client renderer/picker uses (`message-content.tsx`), or the two parses disagree about one body
 *  (a `<speaker>` tag splits unconditionally on both sides either way). */
async function resolveSegmentClaim(
  ctx: ChatContext,
  chatId: Parameters<typeof loadPresentCharacterNames>[1],
  slot: { readonly kind: Parameters<typeof isNarratorVoiced>[0]; readonly content: string },
  claim: { readonly segmentIndex: number | undefined; readonly segmentSpeaker: string | null | undefined },
): Promise<StoredSegmentAnchor | null> {
  if (claim.segmentIndex === undefined) {
    return null;
  }
  const characterNames = isNarratorVoiced(slot.kind) ? await loadPresentCharacterNames(ctx.db, chatId) : [];
  return mintSegmentAnchor(slot.content, characterNames, { index: claim.segmentIndex, speaker: claim.segmentSpeaker ?? null });
}

/** The reaction slice of `ChatService` (both verbs share the gate + the seat resolution, so one factory). */
export function createReactions(ctx: ChatContext, deps: ReactionsDeps): Pick<ChatService, "toggleReaction" | "listReactions"> {
  async function toggleReaction({ principal, chatId, emoji, variantId, segmentIndex, segmentSpeaker }: ToggleReactionParams): Promise<boolean> {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Defense in depth over the transport parse (the `setUserMacroValues` precedent): the vocabulary is
    // wire-validated, and this is the boundary a non-tRPC caller would enter through.
    const token = reactionEmojiSchema.parse(emoji);
    // The B7 posture gate — enforced, not hidden (see the header).
    const posture = await resolveReactionPosture(ctx, chatId, membership.chat.metadata);
    if (!posture.reactionsEnabled) {
      throw new ChatOperationError(CHAT_OP_CODES.reactionsDisabled, "Reactions are turned off in this chat.");
    }
    // The caller is a present member (the guard proved it), so the seat exists — EXCEPT for a principal
    // whose membership is a CHARACTER seat, which cannot happen (a character has no userId to authenticate
    // as). A miss is therefore the racing-leave case, and it collapses to the same leak-free NOT_FOUND the
    // guard would have thrown a moment earlier.
    const seatId = await loadReactorSeatId(ctx.db, chatId, principal.userId);
    if (seatId === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    // The variant's OWN belt: in THIS chat, and at or above the caller's D16 read floor. One `undefined` for
    // absent / other-room / below-floor, so a member learns nothing about a variant they may not read.
    const slot = await loadVariantSlotInChat(ctx.db, chatId, variantId, membership.historyFloorSeq);
    if (slot === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    // MR3 — resolve the segment CLAIM (if any) against the server's own parse of the canon bytes.
    const segment = await resolveSegmentClaim(ctx, chatId, slot, { segmentIndex, segmentSpeaker });
    // REMOVE-FIRST is what makes this a toggle without a read: the keyed DELETE both removes the reaction and
    // ANSWERS whether the seat held it. A separate "does it exist?" SELECT would be a TOCTOU window between
    // two of the reader's own devices. Whole-message and per-segment are INDEPENDENT toggles (MA-2 §4) —
    // the delete keys the same partial-unique arm the insert would land in.
    const removed = await deleteReaction(ctx.db, { variantId, reactorParticipantId: seatId, emoji: token, segmentIndex: segment?.segmentIndex ?? null });
    const added = removed
      ? false
      : await insertReaction(ctx.db, {
          id: ctx.newMessageReactionId(),
          variantId,
          reactorParticipantId: seatId,
          emoji: token,
          segment,
          createdAt: ctx.now(),
        });
    if (removed || added) {
      await deps.emit({ type: "reactionsChanged", chatId, messageId: slot.messageId, variantId, emoji: token, added });
    }
    return added;
  }

  async function listReactions({ principal, chatId }: ListReactionsParams): Promise<ChatReactionsView> {
    const membership = await requireParticipant(ctx, principal, chatId);
    // OFF answers empty-with-verdict rather than throwing: a read is how every member's client LEARNS the
    // posture (the pills and the picker doors key on `reactionsEnabled`), and an error here would turn a
    // host's legitimate off-switch into a toast on every open transcript.
    const posture = await resolveReactionPosture(ctx, chatId, membership.chat.metadata);
    if (!posture.reactionsEnabled) {
      return { reactionsEnabled: false, groups: [] };
    }
    const rows = await listChatReactions(ctx.db, chatId, { slotWindow: CHAT_REACTION_SLOT_WINDOW, floorSeq: membership.historyFloorSeq });
    return { reactionsEnabled: true, groups: groupReactions(rows) };
  }

  return { toggleReaction, listReactions };
}

/** `reactAsCharacter` — the `react` TOOL's write half (B7/MR5), a STANDALONE factory (not a `ChatService`
 *  member: its one consumer is the composition root, which closes the tool definition over it —
 *  `contract/params.ts::ReactAsCharacterParams` states the argument).
 *
 *  EVERY refusal is errors-as-data (`ok:false` with words the model can narrate), because the caller IS a
 *  model mid-turn: a thrown error here would surface as a tool-execution fault and read as a platform bug,
 *  when "there is no character named that here" is a legality answer the model should hear and route
 *  around. The ONE throw kept is the membership guard's leak-free `ChatNotFoundError` — a non-member
 *  principal is our wiring bug, never model data.
 *
 *  ADD-ONLY, deliberately not a toggle: a model that retries a call must never UN-react (least of all a
 *  human's identical reaction — seats differ, but its own repeat would flap). A repeat add lands on the
 *  partial unique and comes back `alreadyReacted`. The unknown-`toSpeaker` arm DEGRADES to whole-message
 *  (narrated) rather than refusing: the model's intent to react is clear, its spelling of a name may not
 *  be, and a dropped reaction helps nobody. */
export function createReactAsCharacter(ctx: ChatContext, deps: ReactionsDeps): ReactAsCharacterOp {
  return async ({ principal, chatId, characterName, emoji, toSpeaker }: ReactAsCharacterParams) => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const token = reactionEmojiSchema.parse(emoji);
    // BOTH knobs, resolved fresh: the attach gate (the S2 contribution) already keeps the tool off the wire
    // when either resolves off, so this is the write-side belt for a knob flipped MID-turn.
    const posture = await resolveReactionPosture(ctx, chatId, membership.chat.metadata);
    if (!(posture.reactionsEnabled && posture.charactersCanReact)) {
      return { ok: false, reason: "Reactions by characters are turned off in this chat." };
    }
    const seat = await loadCharacterSeatByName(ctx.db, chatId, characterName);
    if (seat === undefined) {
      return { ok: false, reason: `No present character named "${characterName}" in this chat — use a present character's exact name.` };
    }
    // THE SEAT KILL-SWITCH (#1402). `disabled` is the host's per-seat mute: the arbiter never selects that
    // character (`participant::isArbiterEligible`) and `{{groupNotMuted}}` excludes it. A reaction is that seat
    // SPEAKING onto the transcript, so a muted seat may not author one — and nothing upstream enforces it: the
    // attach gate is knob-level only (`teaching-contribution.ts` attaches the tool when the ROOM's
    // `reactionsEnabled && charactersCanReact` resolve on; it knows no seat, and the model picks the name at
    // call time). Errors-as-data with the seat's real state, so the model routes to another seated character.
    if (seat.disabled) {
      return { ok: false, reason: `The character "${seat.characterName}" is muted in this chat and cannot react.` };
    }
    // The target read obeys the CALLER's own D16 floor — the `toggleReaction`/`loadVariantSlotInChat` shape.
    // A caller whose visible window is empty gets the empty-room answer, never a pre-join slot's ids.
    const slot = await loadNewestSelectedSlot(ctx.db, chatId, membership.historyFloorSeq);
    if (slot === undefined) {
      return { ok: false, reason: "There is no message to react to yet." };
    }
    const speaker = toSpeaker?.trim() ?? "";
    const { segment, target } =
      speaker.length > 0 ? resolveToSpeakerAnchor(slot.content, await loadPresentCharacterNames(ctx.db, chatId), speaker) : NO_SPEAKER_TARGET;
    const added = await insertReaction(ctx.db, {
      id: ctx.newMessageReactionId(),
      variantId: slot.variantId,
      reactorParticipantId: seat.participantId,
      emoji: token,
      segment,
      createdAt: ctx.now(),
    });
    if (added) {
      await deps.emit({ type: "reactionsChanged", chatId, messageId: slot.messageId, variantId: slot.variantId, emoji: token, added: true });
    }
    return { ok: true, alreadyReacted: !added, character: seat.characterName, emoji: token, target };
  };
}
