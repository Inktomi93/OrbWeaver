// The chat context panel — the shell's right-region body for the active committed chat: one section,
// Base UI Tabs (Members / Overrides / Group / Preview / Injections). "Am I host" resolves once from
// ChatDetail.viewerIsHost, the one source every tab shares. The Members tab renders when either section
// is non-empty (People needs a multi-human install with >1 human; Cast needs >=2 characters); the
// default tab is Members when it renders, else Overrides.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import {
  goToLanding,
  selectCharacter,
  setActiveSection,
  setContextTab,
  useContextTab,
  useTurnSpeakerCharacterId,
} from "#state";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { CommittedGroupConfigTab } from "../components/group-config-form";
import { InjectionsManager } from "../components/injections-manager";
import { InviteDialog } from "../components/invite-dialog";
import { MembersPanel } from "../components/members-panel";
import { RoomOverridesTab } from "../components/room-overrides-tab";
import {
  useKickMember,
  useNominateHostHandoff,
  useSelfLeave,
} from "../hooks/use-membership-mutations";
import {
  useForceCharacterTurn,
  useSetParticipantDisabled,
  useSetParticipantTalkativeness,
} from "../hooks/use-roster-mutations";
import type { MemberCastRow, MemberPersonRow } from "../lib/member-rows";
import {
  castSectionVisible,
  filterCharacters,
  membersTabJustified,
  resolveHumanParticipants,
  resolveIsGroupChat,
} from "../lib/roster";

function toPersonRows(
  participants: readonly ParticipantView[],
  viewerUserId: UserId | null,
  pendingHostUserId: UserId | null,
): MemberPersonRow[] {
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
    });
  }
  return rows;
}

function toCastRows(
  participants: readonly ParticipantView[],
  respondingCharacterId: CharacterId | null,
): MemberCastRow[] {
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

export interface ChatContextPanelProps {
  readonly chatId: ChatId;
  /** True ⇒ the People section + membership actions exist; single-user deployments never render them. */
  readonly multiHumanCapable?: boolean;
}

export function ChatContextPanel({
  chatId,
  multiHumanCapable = false,
}: ChatContextPanelProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading chat details…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load chat details.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      <ChatContextPanelBody chatId={chatId} multiHumanCapable={multiHumanCapable} />
    </QueryBoundary>
  );
}

function ChatContextPanelBody({
  chatId,
  multiHumanCapable = false,
}: ChatContextPanelProps): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const isHost = chat.viewerIsHost === true;
  const castJustifiesTab = castSectionVisible(chat.participants);
  const showMembers = membersTabJustified(chat.participants, multiHumanCapable);
  const showGroup = isHost && resolveIsGroupChat(chat.participants);

  const contextTab = useContextTab();
  const activeTab = resolveActiveTab(contextTab, { showMembers, showGroup, isHost });

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <Tabs
        value={activeTab}
        onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
        className="flex-1 min-h-0 flex flex-col"
      >
        <TabsList>
          {showMembers ? <TabsTab value="members">Members</TabsTab> : null}
          <TabsTab value="overrides">Overrides</TabsTab>
          {showGroup ? <TabsTab value="group">Group</TabsTab> : null}
          {isHost ? <TabsTab value="preview">Preview</TabsTab> : null}
          <TabsTab value="injections">Injections</TabsTab>
          <TabsIndicator />
        </TabsList>

        {showMembers ? (
          <TabsPanel value="members" className="min-h-0 flex-1">
            <CommittedMembersTab
              chatId={chatId}
              chat={chat}
              isHost={isHost}
              multiHumanCapable={multiHumanCapable}
              castVisible={castJustifiesTab}
            />
          </TabsPanel>
        ) : null}

        <TabsPanel value="overrides">
          <RoomOverridesTab chatId={chatId} roomOverrides={chat.roomOverrides} isHost={isHost} />
        </TabsPanel>

        {showGroup ? (
          <TabsPanel value="group">
            <QueryBoundary
              fallback={<Text tone="muted">Loading group settings…</Text>}
              renderError={(_error, retry): ReactElement => (
                <Text tone="muted">
                  Couldn't load group settings.{" "}
                  <Button intent="ghost" onClick={retry}>
                    Retry
                  </Button>
                </Text>
              )}
            >
              <CommittedGroupConfigTab chatId={chatId} />
            </QueryBoundary>
          </TabsPanel>
        ) : null}

        {isHost ? (
          <TabsPanel value="preview">
            <AssemblyPreviewPanel chatId={chatId} />
          </TabsPanel>
        ) : null}

        <TabsPanel value="injections">
          <QueryBoundary
            fallback={<Text tone="muted">Loading injections…</Text>}
            renderError={(_error, retry): ReactElement => (
              <Text tone="muted">
                Couldn't load injections.{" "}
                <Button intent="ghost" onClick={retry}>
                  Retry
                </Button>
              </Text>
            )}
          >
            <InjectionsManager chatId={chatId} isHost={isHost} />
          </QueryBoundary>
        </TabsPanel>
      </Tabs>
    </Stack>
  );
}

function resolveActiveTab(
  contextTab: string | null,
  gates: { readonly showMembers: boolean; readonly showGroup: boolean; readonly isHost: boolean },
): string {
  const visibleTabs = new Set<string>(["overrides", "injections"]);
  if (gates.showMembers) {
    visibleTabs.add("members");
  }
  if (gates.showGroup) {
    visibleTabs.add("group");
  }
  if (gates.isHost) {
    visibleTabs.add("preview");
  }
  const defaultTab = gates.showMembers ? "members" : "overrides";
  return contextTab !== null && visibleTabs.has(contextTab) ? contextTab : defaultTab;
}

/** Exported for `chats-section.tsx`'s dormant CONTEXT port (§6c) — the Members tab body needs the same
 *  `chat` slice + gates the live surface computes, without re-fetching. */
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

export function CommittedMembersTab({
  chatId,
  chat,
  isHost,
  multiHumanCapable,
  castVisible,
}: CommittedMembersTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setDisabled = useSetParticipantDisabled({ trpc, invalidation });
  const setTalkativeness = useSetParticipantTalkativeness({ trpc, invalidation });
  const forceTurn = useForceCharacterTurn({ trpc, invalidation });
  const kick = useKickMember({ trpc, invalidation });
  const selfLeave = useSelfLeave({ trpc, invalidation });
  const nominateHost = useNominateHostHandoff({ trpc, invalidation });
  const [inviteOpen, setInviteOpen] = useState(false);

  const respondingCharacterId = useTurnSpeakerCharacterId(chatId);
  const people = multiHumanCapable
    ? toPersonRows(chat.participants, chat.viewerUserId, chat.pendingHostUserId)
    : [];
  const cast = castVisible ? toCastRows(chat.participants, respondingCharacterId) : [];
  const hostMembership = isHost && multiHumanCapable;

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
        onNominateHost={
          hostMembership ? (userId): void => nominateHost.mutate({ chatId, userId }) : undefined
        }
        onLeave={multiHumanCapable ? onLeave : undefined}
        leaveArchivesRoom={isHost}
        onSetDisabled={
          isHost
            ? (characterId, disabled): void => setDisabled.mutate({ chatId, characterId, disabled })
            : undefined
        }
        onSetTalkativeness={
          isHost
            ? (characterId, talkativeness): void =>
                setTalkativeness.mutate({ chatId, characterId, talkativeness })
            : undefined
        }
        onForceTurn={
          isHost ? (characterId): void => forceTurn.mutate({ chatId, characterId }) : undefined
        }
        onViewCharacter={(characterId): void => {
          selectCharacter(characterId);
          setActiveSection("characters");
        }}
      />

      {hostMembership ? (
        <InviteDialog chatId={chatId} open={inviteOpen} onOpenChange={setInviteOpen} />
      ) : null}
    </>
  );
}
