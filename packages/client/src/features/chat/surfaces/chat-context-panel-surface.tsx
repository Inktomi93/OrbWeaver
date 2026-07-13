// The chat CONTEXT panel (task #28; Members merge — FINAL-Chat-Tab-Redesign §7/§7.1) — the shell's
// right-region body for the active committed chat: ONE section, Base UI Tabs
// (Members · Overrides · Group · Preview · Injections). Composed of sub-features over EXISTING server
// verbs: the Members panel (the Roster+People merge — membership + roster controls, members-panel.tsx),
// room-overrides (setRoomOverrides), preview-request (previewAssembly), manual injections
// (list/set/delete ChatInjection). UI-Arch §4.1 — the CONTEXT region is the shell's designed detail home.
//
// SELF-CONTAINED BY DESIGN: this surface does NOT assume it is the sole CONTEXT occupant. The route
// mounts it via the chats `SectionSlot.context` entry directly (owner-parked — chat keeps its DIRECT
// mount). MIGRATING chat onto the CONTEXT_SLOTS registry is a SEPARATE, currently-PARKED chat-lane task.
//
// HOST GATE (UI-Arch §5.1): "am I host" resolves per-viewer from the server-resolved
// `ChatDetail.viewerIsHost` — the ONE honest source EVERY tab shares. `=== true` guards the load window:
// default NON-host until the chat read resolves, so host UI never flashes for a member. Host → full
// editing + Preview; member → the Members list (read + own-row Leave), read-only Overrides + Injections.
//
// MEMBERS TAB GATES (§7/§7.1 + §12 disclosure):
//   • The tab renders when either section is non-empty — People: multi-human install AND >1 present
//     human; Cast: ≥2 characters. Hidden when both would be empty (a solo chat on a single-user install
//     opens to Overrides; the ⋯ menu's "Invite people…" keeps the mint reachable).
//   • When the tab renders on a multi-human install, the People section renders even with 1 human
//     ("you" + the host's Invite header action); the Cast section renders only at ≥2 characters (D16 —
//     mute/talkativeness/force-turn are meaningless for a solo cast).
//   • Default tab when opened (the §7 ONE rule): Members if it renders, else Overrides — also the
//     fallback for a stale/hidden `contextTab` request (e.g. "preview" as a non-host).
//
// The GROUP tab keeps its host-AND-group gate (generation behavior is host authority and meaningless
// solo); the old separate Roster/People tabs are SUPERSEDED by Members (do not resurrect them).

import type { ParticipantView, RoomOverrides } from "@orb/contracts/chat";
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
import { RoomOverridesForm } from "../components/room-overrides-form";
import { useSetRoomOverrides } from "../hooks/use-context-panel-mutations";
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
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";
import { filterCharacters, resolveHumanParticipants, resolveIsGroupChat } from "../lib/roster";

/** The Cast disclosure floor (§12): mute/weight/force are meaningless below 2 characters. */
const CAST_SECTION_FLOOR = 2;
/** The People-alone tab floor (§7): a lone "you" doesn't justify the tab by itself. */
const PEOPLE_TAB_FLOOR = 2;

/** Project the PRESENT human seats into `MemberPersonRow`s (People section; §7.1). */
function toPersonRows(
  participants: readonly ParticipantView[],
  viewerUserId: UserId | null,
  pendingHostUserId: UserId | null,
): MemberPersonRow[] {
  const rows: MemberPersonRow[] = [];
  for (const p of resolveHumanParticipants(participants)) {
    if (p.userId === null) {
      continue; // a human seat always carries a userId; skip a malformed row rather than crash.
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

/** Project the character seats into `MemberCastRow`s (Cast section). `responding` reads the live
 *  turn's `speakerCharacterId` — a lifecycle read, NEVER a token subscriber (§7.1). */
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
  /** A COMMITTED chat id — the route passes this only when a committed chat is active (a draft has no
   *  server row for the reads/writes to target). */
  readonly chatId: ChatId;
  /** `/api/auth/config.multiHumanCapable` (route-threaded — the honest PD-106 capability signal). TRUE
   *  ⇒ the People section + membership actions exist; single-user deployments never render them.
   *  Never derived from a probed NOT_FOUND. */
  readonly multiHumanCapable?: boolean;
}

/** The CONTEXT panel front door — suspends on the chat read (roster + overrides), then the tabs. */
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
  const invalidation = useInvalidation();
  // The chat read carries the roster (host detection + Members rows), the pending host nomination,
  // and the current room overrides — one query, already the shell's chat read (no new fetch).
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // The ONE host gate for the whole surface (see header).
  const isHost = chat.viewerIsHost === true;
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });
  // `.catch` swallows the autosave rejection so a failed write doesn't leak an unhandled TRPCClientError
  // as a page error — the mutation's `meta.errorToast` already surfaces the failure to the user.
  const saveOverrides = (overrides: RoomOverrides): Promise<unknown> =>
    setOverrides.mutateAsync({ chatId, overrides }).catch(() => undefined);

  const humans = resolveHumanParticipants(chat.participants);
  const characterCount = filterCharacters(chat.participants).length;
  // §7: the tab renders when either section is non-empty (People: multi-human install with >1 human;
  // Cast: ≥2 characters); hidden when both would be empty.
  const peopleJustifiesTab = multiHumanCapable && humans.length >= PEOPLE_TAB_FLOOR;
  const castJustifiesTab = characterCount >= CAST_SECTION_FLOOR;
  const showMembers = peopleJustifiesTab ? true : castJustifiesTab;
  // Group config stays host-AND-group (generation behavior is meaningless for a solo cast).
  const showGroup = isHost && resolveIsGroupChat(chat.participants);

  // CONTROLLED by the shell's `contextTab` seam — the chat options menu / member-count chip jump straight
  // to a tab. Resolve against the CURRENTLY-VISIBLE tabs; the fallback is the §7 ONE rule (Members if it
  // renders, else Overrides) so a stale/hidden request never selects nothing.
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
          <RoomOverridesForm
            entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`}
            roomOverrides={chat.roomOverrides}
            isHost={isHost}
            save={isHost ? saveOverrides : undefined}
          />
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

/** The visible-tab resolve (§7's ONE default rule): a stale/hidden `contextTab` request falls back to
 *  Members when it renders, else Overrides. */
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

interface CommittedMembersTabProps {
  readonly chatId: ChatId;
  readonly chat: {
    readonly participants: readonly ParticipantView[];
    readonly viewerUserId: UserId;
    readonly pendingHostUserId: UserId | null;
  };
  readonly isHost: boolean;
  readonly multiHumanCapable: boolean;
  /** The §12 Cast disclosure verdict (≥2 characters) — resolved by the parent alongside the tab gate. */
  readonly castVisible: boolean;
}

/** The committed Members tab body — projects the roster into the source-agnostic `MembersPanel` rows
 *  and wires the membership/roster verbs, mirroring the server gates (§8.1: host-only callbacks are
 *  ABSENT for a member; membership callbacks are absent on a single-user install). */
function CommittedMembersTab({
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
      // The room would 404 for the departed viewer — land on the landing (its own mount-focus takes
      // over, gate surface-a11y-focus). Failure: the mutation's errorToast surfaced it; stay put.
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
          // Cross-section jump (FINAL-Chats §9e) — store actions only, never a feature import.
          selectCharacter(characterId);
          setActiveSection("characters");
        }}
      />

      {/* The §8.2 mint dialog (mode toggle · expiry/max-uses · raw-link-shown-once · outstanding
          list). A component owns the Dialog root (client-structure rule 7); host-only opener above. */}
      {hostMembership ? (
        <InviteDialog chatId={chatId} open={inviteOpen} onOpenChange={setInviteOpen} />
      ) : null}
    </>
  );
}
