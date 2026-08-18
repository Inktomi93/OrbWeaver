// The committed chat's Members tab body — People (multi-human installs) + Cast rows, with the host
// membership gestures (invite/kick/nominate/leave) and the per-character roster controls. The `chat`
// slice + gates arrive already-resolved from the section's `ChatContextState` projection (no re-fetch).

import type { CastEntry, ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { goToLanding, useTurnSpeakerCharacterId } from "#state";
import { useKickMember, useNominateHostHandoff, useSelfLeave, useSetMemberHistoryVisibility } from "../hooks/use-membership-mutations.ts";
import { useForceCharacterTurn, useRemoveCharacterFromChat, useSetSeatKnobs } from "../hooks/use-roster-mutations.ts";
import { toCastRows, toPersonRows } from "../lib/member-rows.ts";
import { filterCharacters } from "../lib/roster.ts";
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
        castAction={isHost ? <AddMemberPopover chatId={chatId} existingCharacterIds={[...participantIdByCharacter.keys()]} /> : undefined}
        onKick={hostMembership ? (userId): void => kick.mutate({ chatId, userId }) : undefined}
        onNominateHost={hostMembership ? (userId, offer): void => nominateHost.mutate({ chatId, userId, offer }) : undefined}
        onSetHistoryVisibility={hostMembership ? (userId, visibility): void => setHistoryVisibility.mutate({ chatId, userId, visibility }) : undefined}
        onLeave={multiHumanCapable ? onLeave : undefined}
        leaveArchivesRoom={isHost}
        onSetDisabled={
          isHost
            ? (characterId, disabled): void => {
                const participantId = participantIdByCharacter.get(characterId);
                if (participantId !== undefined) {
                  setSeatKnobs.mutate({ chatId, participantId, patch: { disabled } });
                }
              }
            : undefined
        }
        onSetTalkativeness={
          isHost
            ? (characterId, talkativeness): void => {
                const participantId = participantIdByCharacter.get(characterId);
                if (participantId !== undefined) {
                  setSeatKnobs.mutate({ chatId, participantId, patch: { talkativeness } });
                }
              }
            : undefined
        }
        onForceTurn={isHost ? (characterId): void => forceTurn.mutate({ chatId, characterId }) : undefined}
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
