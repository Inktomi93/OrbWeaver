// The group-roster-controls write verbs (task #29 — the cast bar + the CONTEXT-panel Roster tab), each a
// module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never hand-rolls
// `useMutation` + cache surgery). All are host-only server-side (substrate/auth/matrix.ts); the client
// host-gates the SURFACE (the Roster tab is host-only, like Preview), so these never fire for a member.
// Settle-invalidation routes through the central seam:
//   • setSeatKnobs → refetch `getChat` (the roster read the cast bar + the Roster tab + the message-list
//     attribution all share — one query, no extra fetch). The per-kind mute/talkativeness verbs are RETIRED
//     (D80): one participantId-keyed `setSeatKnobs` projecting `SeatKnobs` (a `patch` of disabled/talkativeness).
//   • forceCharacterTurn → a TURN trigger (like `generate`): the turn's own lifecycle is bus-driven
//     (`turnStarted`/`messageCommitted`/…), so it refetches `getChat` + `listMessages` (the transcript).
// TData is `unknown` on both (the context-panel-mutations precedent): the return value is never read —
// invalidation + the bus drive the refetch. TVars reuse the CONTRACT param shapes (`participantId`/`patch`
// etc.) so a params reshape breaks here at compile time, never a re-spelled union at the call site (§5.5).

import type { SeatKnobs } from "@orb/contracts/chat";
import type { CharacterId, ChatId, ChatParticipantId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice.ts";

/** `chat.addCharacterToChat` vars — add one host-owned character to the roster (J7 add-member, host-only). */
interface AddCharacterToChatVars {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

// All four roster mutations are BUS-DRIVEN on the OPEN chat (the mutation-vs-bus rule, invalidation.ts):
// the roster verbs emit `chatUpdated` (add/mute/talkativeness) — or a turn (`forceCharacterTurn`) — on the
// chat you're in, delivered by the active subscription; `chatUpdated`/turn events → chatReads, which covers
// `getChat` (+ `listMessages`). So all four are `busDriven` — the cast bar + Roster tab read from `getChat`,
// refreshed by the bus, not a redundant mutation-side invalidate.
export const useAddCharacterToChat = createEntityMutation<AddCharacterToChatVars, unknown>({
  options: (trpc) => trpc.chat.addCharacterToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't add that character to the chat.",
});

/** `chat.removeCharacterFromChat` vars — the symmetric drop for the add (host-only). leftSeq-stamps the
 *  seat out; reversible via a re-add. Bus-driven: the verb emits `chatUpdated` on the OPEN chat. */
interface RemoveCharacterFromChatVars {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

export const useRemoveCharacterFromChat = createEntityMutation<RemoveCharacterFromChatVars, unknown>({
  options: (trpc) => trpc.chat.removeCharacterFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove that character from the chat.",
});

/** `chat.setSeatKnobs` vars — patch one participant's AI-seat knobs (mute + talkativeness) in one verb
 *  (D80 — the per-kind knob-verb forking is retired). Keyed by `participantId` (the `ParticipantView.id`),
 *  host-only. */
interface SetSeatKnobsVars {
  readonly chatId: ChatId;
  readonly participantId: ChatParticipantId;
  readonly patch: SeatKnobs;
}

export const useSetSeatKnobs = createEntityMutation<SetSeatKnobsVars, unknown>({
  options: (trpc) => trpc.chat.setSeatKnobs.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the member's seat.",
});

/** `chat.forceCharacterTurn` vars — the host summons one member to speak next (a lock-holding round).
 *  A MUTED member is still summonable server-side (#29 — mute is passive arbitration exclusion). */
interface ForceCharacterTurnVars {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

export const useForceCharacterTurn = createEntityMutation<ForceCharacterTurnVars, unknown>({
  options: (trpc) => trpc.chat.forceCharacterTurn.mutationOptions(),
  // Bus-driven: summoning a member runs a turn (turnCompleted → chatReads) on the OPEN chat.
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't summon that member to speak."),
});
