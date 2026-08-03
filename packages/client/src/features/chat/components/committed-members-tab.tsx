// The committed chat's Members tab body — People (multi-human installs) + Cast rows, with the host
// membership gestures (invite/kick/nominate/leave) and the per-character roster controls. The `chat`
// slice + gates arrive already-resolved from the section's `ChatContextState` projection (no re-fetch).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { goToLanding, useTurnSpeakerCharacterId } from "#state";
import { useKickMember, useNominateHostHandoff, useSelfLeave, useSetMemberHistoryVisibility } from "../hooks/use-membership-mutations.ts";
import { useForceCharacterTurn, useRemoveCharacterFromChat, useSetSeatKnobs } from "../hooks/use-roster-mutations.ts";
import type { MemberCastRow, MemberPersonRow } from "../lib/member-rows.ts";
import { filterCharacters, resolveHumanParticipants } from "../lib/roster.ts";
import { InviteDialog } from "./invite-dialog.tsx";
import { MemberCardViewer } from "./member-card-viewer.tsx";
import { MembersPanel } from "./members-panel.tsx";

function toPersonRows(participants: readonly ParticipantView[], viewerUserId: UserId | null, pendingHostUserId: UserId | null): MemberPersonRow[] {
  const rows: MemberPersonRow[] = [];
  for (const p of resolveHumanParticipants(participants)) {
    if (p.userId === null) {
      continue;
    }
    rows.push({
      kind: "person",
      key: p.id,
      userId: p.userId,
      displayName: p.displayName,
      handle: p.handle,
      isHost: p.role === "host",
      isViewer: viewerUserId !== null && p.userId === viewerUserId,
      avatarHash: p.avatarHash,
      pendingNominee: pendingHostUserId !== null && p.userId === pendingHostUserId,
      historyVisibility: p.joinHistoryVisibility,
    });
  }
  return rows;
}

function toCastRows(participants: readonly ParticipantView[], respondingCharacterId: CharacterId | null): MemberCastRow[] {
  return filterCharacters(participants).map((p) => ({
    kind: "cast",
    key: p.id,
    characterId: p.characterId,
    displayName: p.displayName,
    disabled: p.disabled,
    talkativeness: p.talkativeness,
    avatarHash: p.avatarHash,
    responding: respondingCharacterId !== null && p.characterId === respondingCharacterId,
  }));
}

/** The Members tab body's props — the `chat` slice + gates the section's projection carries
 *  (`toMembersTabProps` in `chats-section.tsx` builds this from `CommittedChatContext`). */
export interface CommittedMembersTabProps {
  readonly chatId: ChatId;
  readonly chat: {
    readonly participants: readonly ParticipantView[];
    readonly viewerUserId: UserId;
    readonly pendingHostUserId: UserId | null;
  };
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
  readonly castVisible: boolean;
}

export function CommittedMembersTab({ chatId, chat, isHost, multiHumanCapable, castVisible }: CommittedMembersTabProps): ReactElement {
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
  const people = multiHumanCapable ? toPersonRows(chat.participants, chat.viewerUserId, chat.pendingHostUserId) : [];
  const cast = castVisible ? toCastRows(chat.participants, respondingCharacterId) : [];
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
