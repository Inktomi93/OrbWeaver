// The group-roster-controls write verbs (task #29 — the cast bar + the CONTEXT-panel Roster tab), each a
// module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a call site never hand-rolls
// `useMutation` + cache surgery). All three are host-only server-side (substrate/auth/matrix.ts); the
// client host-gates the SURFACE (the Roster tab is host-only, like Preview), so these never fire for a
// member. Settle-invalidation routes through the central seam:
//   • setParticipantDisabled / setParticipantTalkativeness → refetch `getChat` (the roster read the cast
//     bar + the Roster tab + the message-list attribution all share — one query, no extra fetch).
//   • forceCharacterTurn → a TURN trigger (like `generate`): the turn's own lifecycle is bus-driven
//     (`turnStarted`/`messageCommitted`/…), so it refetches `getChat` + `listMessages` (the transcript).
// TData is `unknown` on all three (the context-panel-mutations precedent): the return value is never read
// — invalidation + the bus drive the refetch. TVars reuse the CONTRACT param shapes (`characterId` etc.)
// so a params reshape breaks here at compile time, never a re-spelled union at the call site (§5.5).

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

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

/** `chat.setParticipantDisabled` vars — mute/unmute one roster character (host-only). */
interface SetParticipantDisabledVars {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly disabled: boolean;
}

export const useSetParticipantDisabled = createEntityMutation<SetParticipantDisabledVars, unknown>({
  options: (trpc) => trpc.chat.setParticipantDisabled.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the member's mute state.",
});

/** `chat.setParticipantTalkativeness` vars — set the 0–1 `natural`-policy sampling weight (host-only). */
interface SetParticipantTalkativenessVars {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly talkativeness: number;
}

export const useSetParticipantTalkativeness = createEntityMutation<SetParticipantTalkativenessVars, unknown>({
  options: (trpc) => trpc.chat.setParticipantTalkativeness.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the member's talkativeness.",
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
  errorToast: "Couldn't summon that member to speak.",
});
