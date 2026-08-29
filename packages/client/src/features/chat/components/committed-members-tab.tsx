// The committed chat's Members tab body — People (multi-human installs) + Cast rows, with the host
// membership gestures (invite/kick/nominate/leave) and the per-character roster controls. The `chat`
// slice + gates arrive already-resolved from the section's `ChatContextState` projection (no re-fetch).

import type { CastEntry, ParticipantView, SeatKnobs } from "@orb/contracts/chat";
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
import type { MemberRowActions } from "../lib/member-rows.ts";
import { toCastRows, toPersonRows } from "../lib/member-rows.ts";
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
    /** The room's member-gated CAST producer (`ChatDetail.cast`) — how a human seat's `activePersonaId`
     *  becomes the name and portrait the row renders (see `toPersonRows`). */
    readonly cast: readonly CastEntry[];
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
  // The D22 member card-viewer target — a Cast row's "View character" opens the CLAMPED in-room card
  // (getMemberCard) for THIS characterId, NOT a jump to the owner's editable characters library (a
  // member may not own the card, and the library isn't visibility-clamped). `null` = closed; the
  // useQuery inside the viewer is gated on `open`, so no read fires until a row is picked.
  const [viewCardCharacterId, setViewCardCharacterId] = useState<CharacterId | null>(null);

  const respondingCharacterId = useTurnSpeakerCharacterId(chatId);
  const sources = {
    participants: chat.participants,
    cast: chat.cast,
    viewerUserId: chat.viewerUserId,
    pendingHostUserId: chat.pendingHostUserId,
    respondingCharacterId,
  };
  const people = multiHumanCapable ? toPersonRows(sources) : [];
  // No display floor on the cast: the room's characters ARE the roster, and a "worth its own list" threshold
  // here hid every 1:1 room's whole cast plus its per-character controls (#162). The panel drops the section
  // entirely when there is nothing to show AND nothing this viewer can add.
  const cast = toCastRows(sources);
  const hostMembership = isHost && multiHumanCapable;
  // ARBITRATION APPLICABILITY (#182 — "some group stuff is showing up even when not in group", owner live
  // report 2026-08-18). Mute, Talkativeness and "Make X speak next" are not per-character preferences: all
  // three are inputs to the GROUP SPEAKER ARBITER (member-row-menu.tsx states it — "mute is passive
  // arbitration exclusion"; talkativeness is a RELATIVE weight; force-turn overrides the pick). A room with
  // one character has no arbitration to steer — the weight chip reads a ratio against nobody, muting the sole
  // voice leaves a room that cannot answer, and "speak next" is what pressing Send already does. So the three
  // seams are simply ABSENT below a cast of two, which the panel/row/menu already render as "no affordance"
  // (§8.1, the same mechanism that omits host-only controls for a member) — no second mode, no disabled
  // controls, no new branch downstream.
  //
  // THIS NARROWS #162 DELIBERATELY AND ONLY HERE. `lib/roster.ts`'s header rules that the old `>=2` CAST
  // FLOOR was wrong precisely because it withheld these controls — that ruling is about the SECTION: the
  // floor stays ZERO, the 1:1 room still renders its Cast section, its rows, its identity, View character,
  // Remove-from-chat and the add-character door. What moves is the three group-arbitration knobs, which the
  // floor was hiding as a side effect of hiding everything. The room's roster is not a group affordance; the
  // speaker arbiter's controls are.
  const arbitrationApplies = isHost && resolveIsGroupChat(chat.participants);
  // MUTE KEEPS AN EXIT. A seat muted while the room was a group stays muted after the cast shrinks to one,
  // and a room whose only voice is excluded cannot answer at all — so gating the toggle on group-ness alone
  // would build a door that locks from the inside. Mute is therefore applicable while the room is a group OR
  // while a seat is ALREADY muted: the state stays reachable out of, never into, a 1:1 room.
  const muteApplies = arbitrationApplies || (isHost && cast.some((row) => row.disabled));

  // `setSeatKnobs` keys by the participant row id (D80); the cast-row callbacks surface `characterId`, so
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
        cast={cast}
        onInvitePeople={hostMembership ? (): void => setInviteOpen(true) : undefined}
        // The roster's ADD door, character half (#162 — "add more characters or add people into it" is ONE
        // feature, and this tab used to offer only the human half). The SAME picker the cast bar's "+" opens;
        // gated on `isHost` alone, not `hostMembership`, because adding a character is a single-human
        // capability that has nothing to do with the multi-human deployment flag.
        castAction={
          isHost ? (
            <Row align="center" gap="tight">
              {/* #26 — the saved-cast door (B10: apply-existing = Members “Add cast…”): the picker is the destination (openModal, never a feature
                  import); "Add cast…"/"Save current cast" both live inside it, scoped to THIS open room. */}
              <Button type="button" intent="ghost" size="sm" onClick={(): void => openModal("savedCasts")}>
                <Icon icon={Users} size="sm" />
                Add cast…
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
