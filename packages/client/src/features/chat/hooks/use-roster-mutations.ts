import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { turnMutationToast } from "#lib";

// All four roster mutations are BUS-DRIVEN on the OPEN chat (the mutation-vs-bus rule, invalidation.ts):
// the roster verbs emit `chatUpdated` (add/mute/talkativeness) — or a turn (`forceCharacterTurn`) — on the
// chat you're in, delivered by the active subscription; `chatUpdated`/turn events → chatReads, which covers
// `getChat` (+ `listMessages`). So all four are `busDriven` — the character bar + Roster tab read from `getChat`,
// refreshed by the bus, not a redundant mutation-side invalidate.
/** `chat.addCharacterToChat` — add one host-owned character to the roster (J7 add-member, host-only). */
export const useAddCharacterToChat = createEntityMutation<inferInput<Trpc["chat"]["addCharacterToChat"]>, unknown>({
  options: (trpc) => trpc.chat.addCharacterToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't add that character to the chat.",
});

/** `chat.removeCharacterFromChat` — the symmetric drop for the add (host-only). leftSeq-stamps the
 *  seat out; reversible via a re-add. Bus-driven: the verb emits `chatUpdated` on the OPEN chat. */
export const useRemoveCharacterFromChat = createEntityMutation<inferInput<Trpc["chat"]["removeCharacterFromChat"]>, unknown>({
  options: (trpc) => trpc.chat.removeCharacterFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove that character from the chat.",
});

/** `chat.setSeatKnobs` — patch one participant's AI-seat knobs (mute + talkativeness) in one verb
 *  (D80 — the per-kind knob-verb forking is retired). Keyed by `participantId` (the `ParticipantView.id`),
 *  host-only. */
export const useSetSeatKnobs = createEntityMutation<inferInput<Trpc["chat"]["setSeatKnobs"]>, unknown>({
  options: (trpc) => trpc.chat.setSeatKnobs.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update the member's seat.",
});

/** `chat.forceCharacterTurn` — the host summons one member to speak next (a lock-holding round).
 *  A MUTED member is still summonable server-side (#29 — mute is passive arbitration exclusion). */
export const useForceCharacterTurn = createEntityMutation<inferInput<Trpc["chat"]["forceCharacterTurn"]>, unknown>({
  options: (trpc) => trpc.chat.forceCharacterTurn.mutationOptions(),
  // Bus-driven: summoning a member runs a turn (turnCompleted → chatReads) on the OPEN chat.
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't summon that member to speak."),
});
