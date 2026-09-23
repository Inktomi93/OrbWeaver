// The committed chat's Members tab body — People (multi-human installs) + Character rows, with the host
// membership gestures (invite/kick/nominate/leave) and the per-character roster controls. The `chat`
// slice + gates arrive already-resolved from the section's `ChatContextState` projection (no re-fetch).

import type { ChatIdentity, ParticipantView, SeatKnobs } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Users } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { goToLanding, openModal, useTurnSpeakerCharacterId } from "#state";
import { useKickMember, useNominateHostHandoff, useSelfLeave, useSetMemberHistoryVisibility } from "../hooks/use-membership-mutations.ts";
import { useForceCharacterTurn, useRemoveCharacterFromChat, useSetSeatKnobs } from "../hooks/use-roster-mutations.ts";
import { useRosterPresence } from "../hooks/use-roster-presence.ts";
import type { MemberRowActions } from "../lib/member-rows.ts";
import { toCharacterRows, toPersonRows } from "../lib/member-rows.ts";
import { filterCharacters, resolveIsGroupChat } from "../lib/roster.ts";
import { AddMemberPopover } from "./add-member-popover.tsx";
import { InviteDialog } from "./invite-dialog.tsx";
import { MemberCardViewer } from "./member-card-viewer.tsx";
import { MembersPanel } from "./members-panel.tsx";

/** The Members tab body's props — the `chat` slice + gates the section's projection carries
 *  (`toMembersTabProps` in `chats-section.tsx` builds this from `CommittedChatContext`). */
export interface CommittedMembersTabProps {
  readonly chatId: ChatId;
  readonly chat: {
    readonly participants: readonly ParticipantView[];
    /** The room's member-gated CHAT IDENTITY producer (`ChatDetail.identities`) — how a human seat's
     *  `activePersonaId` becomes the name and portrait the row renders (see `toPersonRows`). */
    readonly identities: readonly ChatIdentity[];
    readonly viewerUserId: UserId;
    readonly pendingHostUserId: UserId | null;
  };
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
}

/** The three GROUP-ARBITER seams, present or absent as one decision (see the applicability comment in the
 *  body). Lifted out of the component because the panel takes them as three independent props and inlining
 *  three gated closures put the tab over the cognitive-complexity ceiling; local (not exported) — the seams'
 *  one type home is `MemberRowActions`. */
type ArbitrationSeams = Pick<MemberRowActions, "onSetDisabled" | "onSetTalkativeness" | "onForceTurn">;

function arbitrationSeams(wiring: {
  readonly arbitrationApplies: boolean;
  readonly muteApplies: boolean;
  readonly setSeatKnob: (characterId: CharacterId, patch: SeatKnobs) => void;
  readonly forceTurn: (characterId: CharacterId) => void;
}): ArbitrationSeams {
  const { arbitrationApplies, muteApplies, setSeatKnob, forceTurn } = wiring;
  return {
    onSetDisabled: muteApplies ? (characterId, disabled): void => setSeatKnob(characterId, { disabled }) : undefined,
    onSetTalkativeness: arbitrationApplies ? (characterId, talkativeness): void => setSeatKnob(characterId, { talkativeness }) : undefined,
    onForceTurn: arbitrationApplies ? forceTurn : undefined,
  };
}

export function CommittedMembersTab({ chatId, chat, isHost, multiHumanCapable }: CommittedMembersTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setSeatKnobs = useSetSeatKnobs({ trpc, invalidation });
  const forceTurn = useForceCharacterTurn({ trpc, invalidation });
  const removeCharacter = useRemoveCharacterFromChat({ trpc, invalidation });
  const kick = useKickMember({ trpc, invalidation });
  const selfLeave = useSelfLeave({ trpc, invalidation });
  const nominateHost = useNominateHostHandoff({ trpc, invalidation });
  const setHistoryVisibility = useSetMemberHistoryVisibility({ trpc, invalidation });
  const [inviteOpen, setInviteOpen] = useState(false);
  // The D22 member card-viewer target — a Character row's "View character" opens the CLAMPED in-room card
  // (getMemberCard) for THIS characterId, NOT a jump to the owner's editable characters library (a
  // member may not own the card, and the library isn't visibility-clamped). `null` = closed; the
  // useQuery inside the viewer is gated on `open`, so no read fires until a row is picked.
  const [viewCardCharacterId, setViewCardCharacterId] = useState<CharacterId | null>(null);

  const respondingCharacterId = useTurnSpeakerCharacterId(chatId);
  // Live presence for the People rows (#1039). Gated on the deployment's multi-human capability for the same
  // reason `people` is: the procedure rides the multi-human-capability belt and is refused as nonexistent below it, and a
  // single-human box has no other human to be present. A `null` here (unresolved / refused / errored) is
  // UNKNOWN, not offline — see `useRosterPresence`.
  const onlineUserIds = useRosterPresence(chat.participants, multiHumanCapable);
  const sources = {
    participants: chat.participants,
    identities: chat.identities,
    viewerUserId: chat.viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    respondingCharacterId,
    onlineUserIds,
  };
  const people = multiHumanCapable ? toPersonRows(sources) : [];
  // No display floor on the characters: the room's characters ARE the roster, and a "worth its own list" threshold
  // here hid every 1:1 room's whole character list plus its per-character controls (#162). The panel drops the section
  // entirely when there is nothing to show AND nothing this viewer can add.
  const characters = toCharacterRows(sources);
  const hostMembership = isHost && multiHumanCapable;
  // ARBITRATION APPLICABILITY (#182 — "some group stuff is showing up even when not in group", owner live
  // report 2026-08-18). Mute, Talkativeness and "Make X speak next" are not per-character preferences: all
  // three are inputs to the GROUP SPEAKER ARBITER (member-row-menu.tsx states it — "mute is passive
  // arbitration exclusion"; talkativeness is a RELATIVE weight; force-turn overrides the pick). A room with
  // one character has no arbitration to steer — the weight chip reads a ratio against nobody, muting the sole
  // voice leaves a room that cannot answer, and "speak next" is what pressing Send already does. So the three
  // seams are simply ABSENT below two characters, which the panel/row/menu already render as "no affordance"
  // (§8.1, the same mechanism that omits host-only controls for a member) — no second mode, no disabled
  // controls, no new branch downstream.
  //
  // THIS NARROWS #162 DELIBERATELY AND ONLY HERE. `lib/roster.ts`'s header rules that the old `>=2` CHARACTERS
  // FLOOR was wrong precisely because it withheld these controls — that ruling is about the SECTION: the
  // floor stays ZERO, the 1:1 room still renders its Characters section, its rows, its identity, View character,
  // Remove-from-chat and the add-character door. What moves is the three group-arbitration knobs, which the
  // floor was hiding as a side effect of hiding everything. The room's roster is not a group affordance; the
  // speaker arbiter's controls are.
  const arbitrationApplies = isHost && resolveIsGroupChat(chat.participants);
  // MUTE KEEPS AN EXIT. A seat muted while the room was a group stays muted after the roster shrinks to one character,
  // and a room whose only voice is excluded cannot answer at all — so gating the toggle on group-ness alone
  // would build a door that locks from the inside. Mute is therefore applicable while the room is a group OR
  // while a seat is ALREADY muted: the state stays reachable out of, never into, a 1:1 room.
  const muteApplies = arbitrationApplies || (isHost && characters.some((row) => row.disabled));

  // `setSeatKnobs` keys by the participant row id (D80); the character-row callbacks surface `characterId`, so
  // resolve the seat here from the same roster the rows were projected from.
  const participantIdByCharacter = new Map(filterCharacters(chat.participants).map((p) => [p.characterId, p.id]));

  const onLeave = (): void =>
    void selfLeave
      .mutateAsync({ chatId })
      .then(() => goToLanding())
      .catch(() => undefined);

  return (
    <>
      <MembersPanel
        people={people}
        characters={characters}
        onInvitePeople={hostMembership ? (): void => setInviteOpen(true) : undefined}
        // The roster's ADD door, character half (#162 — "add more characters or add people into it" is ONE
        // feature, and this tab used to offer only the human half). The SAME picker the character bar's "+" opens;
        // gated on `isHost` alone, not `hostMembership`, because adding a character is a single-human
        // capability that has nothing to do with the multi-human deployment flag.
        charactersAction={
          isHost ? (
            // `flex-wrap` + `justify="end"`: at the narrowest real pane the two doors cannot share a line
            // either, so they STACK — still trailing, still with their whole words. The panel's
            // `SectionHeader` owns the outer wrap and the trailing edge (its `ms-auto`); this Row owns only
            // the pair's own line-breaking.
            <Row align="center" className="flex-wrap" gap="tight" justify="end">
              {/* #26 — the saved-roster door (B10: apply-existing = Members "Saved rosters…"): the picker is the destination
                  (openModal, never a feature import); applying and "Save this room's roster" both live inside it, scoped to THIS open room.

                  IT SAYS *SAVED* ON THE BUTTON (#899 N6; retargeted to "roster" vocabulary #902 C1). Beside
                  it sits `AddMemberPopover`'s "Add a character", 4px away, and a cold reader could not tell
                  the two apart before the vocabulary split: "cast" was insider vocabulary for a STORED
                  GROUP, and next to "a character" it read as the same verb on a vaguer noun. The
                  discriminator is what each door actually opens — this one applies a group you saved
                  earlier, the other picks one existing character — so the visible words name the
                  DESTINATION vs the OBJECT. The accessible name is the visible text in both (no
                  `aria-label` on either), so 2.5.3 holds by construction.

                  THE SHORT `Rosters…` SPELLING IS RETIRED, AND IT NEVER BOUGHT WHAT IT COST (#912, owner
                  ruling 2026-08-30). #902 C1 shortened this label to clear a 320px overflow whose measured
                  right edge was 329.75px; MEASURED on the shipped tree afterwards, the cluster's right edge
                  at 320px was STILL 329.75px and this file's own pin was RED on main — the word was spent
                  and the defect kept. The constraint was never the label, it was that the header Row could
                  not wrap: the kicker and the two doors are one unbreakable line, so every mandated word
                  one character longer re-opened the negotiation. `members-panel.tsx` now wraps that Row and
                  this cluster wraps within it, which is what makes the honest spelling affordable at every
                  width the pane can be. The budget the words are priced against is recorded in
                  `members-panel.tsx`'s header — read it before changing either label. */}
              <Button type="button" intent="ghost" size="sm" onClick={(): void => openModal("savedRosters")}>
                <Icon icon={Users} size="sm" />
                Saved rosters…
              </Button>
              <AddMemberPopover chatId={chatId} existingCharacterIds={[...participantIdByCharacter.keys()]} />
            </Row>
          ) : undefined
        }
        onKick={hostMembership ? (userId): void => kick.mutate({ chatId, userId }) : undefined}
        onNominateHost={hostMembership ? (userId, offer): void => nominateHost.mutate({ chatId, userId, offer }) : undefined}
        onSetHistoryVisibility={hostMembership ? (userId, visibility): void => setHistoryVisibility.mutate({ chatId, userId, visibility }) : undefined}
        onLeave={multiHumanCapable ? onLeave : undefined}
        leaveArchivesRoom={isHost}
        {...arbitrationSeams({
          arbitrationApplies,
          muteApplies,
          setSeatKnob: (characterId, patch): void => {
            const participantId = participantIdByCharacter.get(characterId);
            if (participantId !== undefined) {
              setSeatKnobs.mutate({ chatId, participantId, patch });
            }
          },
          forceTurn: (characterId): void => forceTurn.mutate({ chatId, characterId }),
        })}
        onRemoveCharacter={isHost ? (characterId): void => removeCharacter.mutate({ chatId, characterId }) : undefined}
        onViewCharacter={(characterId): void => setViewCardCharacterId(characterId)}
      />

      {hostMembership ? <InviteDialog chatId={chatId} open={inviteOpen} onOpenChange={setInviteOpen} /> : null}
      {viewCardCharacterId === null ? null : (
        <MemberCardViewer
          chatId={chatId}
          characterId={viewCardCharacterId}
          open={true}
          onOpenChange={(open): void => {
            if (!open) {
              setViewCardCharacterId(null);
            }
          }}
        />
      )}
    </>
  );
}
