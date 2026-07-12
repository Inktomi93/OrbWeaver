// The chat CONTEXT panel (task #28) — the shell's right-region body for the active committed chat:
// ONE section, Base UI Tabs (Overrides · Preview · Injections). Composed of three sub-features over
// EXISTING server verbs (all newly wired thin on the router): room-overrides (setRoomOverrides +
// ChatDetail.roomOverrides), preview-request (previewAssembly), manual injections (list/set/delete
// ChatInjection). UI-Arch §4.1 — the CONTEXT region is the shell's designed detail home.
//
// SELF-CONTAINED BY DESIGN: this surface does NOT assume it is the sole CONTEXT occupant. The route
// mounts it via the chats `SectionSlot.context` entry directly (owner-parked — chat keeps its DIRECT
// mount). The cross-feature CONTEXT graft point has LANDED as the `CONTEXT_SLOTS` registry +
// `<ContextTabsPanel>` (app-shell/lib/context-slots.ts — the founding consumer is the `characters`
// section, FINAL-Character §7; rpg/crew will register there too — rpg-design/11 §1, chat-crew-design/07).
// MIGRATING chat onto that registry is a SEPARATE, currently-PARKED chat-lane task: this panel already
// renders as one bounded Tabs section (not a full-panel takeover), so the move is a straight lift with no
// rework when it's picked up.
//
// HOST GATE (UI-Arch §5.1): "am I host" resolves per-viewer from the server-resolved
// `ChatDetail.viewerIsHost` — the ONE honest source EVERY tab (incl. the People tab's invite controls)
// shares. `=== true` guards the load window: default NON-host until the chat read resolves, so host UI
// never flashes for a member. Host → full editing across all tabs + the Preview tab; member → read-only
// Overrides + Injections, and Preview is HIDDEN (previewAssembly is host-only server-side; a
// member-scoped previewSection affordance is deferred — task #28 flag). This SUPERSEDED the interim
// first-human-seat `resolveViewerIsHost` proxy (task #50), which mis-granted host UI to a non-host
// member once a SECOND human was seated — reachable the moment the Model-B invite lane shipped.
//
// ROSTER GATE (D16 — roster-of-1 is degenerate, not an `isGroup` branch): the Roster tab is HOST-AND-
// GROUP gated (`resolveIsGroupChat`, ../lib/roster.ts) — mute/talkativeness/force-turn are meaningless
// with one character, so a solo (1-character) chat shows no Roster tab even to its host. Mirrors
// `ChatCastBar`'s identical `cast.length <= 1 → null` size-gate for the member-visible glance strip.

import type { ParticipantView, RoomOverrides } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";

import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { setContextTab, useContextTab } from "#state";
import { AssemblyPreviewPanel } from "../components/assembly-preview-panel";
import { CommittedGroupConfigTab } from "../components/group-config-form";
import { InjectionsManager } from "../components/injections-manager";
import { PeoplePanel } from "../components/people-panel";
import { RoomOverridesForm } from "../components/room-overrides-form";
import type { RosterMember } from "../components/roster-panel";
import { RosterPanel } from "../components/roster-panel";
import { useSetRoomOverrides } from "../hooks/use-context-panel-mutations";
import {
  useForceCharacterTurn,
  useSetParticipantDisabled,
  useSetParticipantTalkativeness,
} from "../hooks/use-roster-mutations";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";
import { filterCharacters, resolveHumanParticipants, resolveIsGroupChat } from "../lib/roster";

/** Project a committed chat's character participants into the source-agnostic `RosterMember` view. */
function toRosterMembers(participants: readonly ParticipantView[]): RosterMember[] {
  return filterCharacters(participants).map((p) => ({
    characterId: p.characterId,
    displayName: p.displayName,
    disabled: p.disabled,
    talkativeness: p.talkativeness,
  }));
}

export interface ChatContextPanelProps {
  /** A COMMITTED chat id — the route passes this only when a committed chat is active (a draft has no
   *  server row for the reads/writes to target). */
  readonly chatId: ChatId;
  /** `/api/auth/config.multiHumanCapable` (route-threaded — the honest PD-106 capability signal). TRUE
   *  ⇒ the People tab (present humans + the host's invite affordances) exists; single-user deployments
   *  never render it. Never derived from a probed NOT_FOUND. */
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
  // The chat read carries BOTH the roster (host detection) and the current room overrides — one query,
  // already the shell's chat read (no new fetch for the overrides tab).
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // The ONE host gate for the whole surface: the server-resolved, per-viewer `ChatDetail.viewerIsHost`
  // (`=== true` → NON-host while the read is in-flight/absent, the safe read-only floor). Drives every
  // tab — Overrides/Preview/Injections editing, the Roster/Group host gate, and the People invite
  // controls — so no tab can disagree with another on who the host is.
  const isHost = chat.viewerIsHost === true;
  // The committed persist seam for the Overrides tab (the editor is source-agnostic — a draft passes
  // `setDraftRoomOverrides` instead). The verb takes/returns the domain `RoomOverrides`.
  const setOverrides = useSetRoomOverrides({ trpc, invalidation });
  // `.catch` swallows the autosave rejection so a failed write doesn't leak an unhandled TRPCClientError as a
  // page error — the mutation's `meta.errorToast` already surfaces the failure to the user.
  const saveOverrides = (overrides: RoomOverrides): Promise<unknown> =>
    setOverrides.mutateAsync({ chatId, overrides }).catch(() => undefined);
  // The committed roster seam (the panel is source-agnostic — a draft passes store writes instead): the
  // three per-member verbs + the participants projected into the `RosterMember` view.
  const setDisabled = useSetParticipantDisabled({ trpc, invalidation });
  const setTalkativeness = useSetParticipantTalkativeness({ trpc, invalidation });
  const forceTurn = useForceCharacterTurn({ trpc, invalidation });
  const rosterMembers = toRosterMembers(chat.participants);
  // The People tab (multi-human invites lane): capability-gated on the honest `/api/auth/config`
  // signal — a single-user deployment renders NO people surface at all. Visible to every member when
  // capable (who's in the room is member-visible, like the cast bar); the INVITE controls inside are
  // additionally host-gated on the same `isHost` (the surface-wide `viewerIsHost` gate above). NOT
  // group-gated: inviting a buddy into a solo (1-character) room is the core flow, so People exists
  // even where Roster does not.
  const showPeople = multiHumanCapable;
  const humans = resolveHumanParticipants(chat.participants);
  // D16 roster-of-1 is degenerate, not a group — mute/talkativeness/force-turn are meaningless for one
  // character, so a solo chat must not show the Roster tab even to its host (mirrors ChatCastBar's
  // identical `cast.length <= 1 → null` gate for the member-visible glance strip).
  const showRoster = isHost && resolveIsGroupChat(chat.participants);

  // CONTROLLED by the shell's `contextTab` seam (ux-flow-revamp J6) — the chat options menu (J3 header)
  // sets it to jump straight to a tab. Resolve against the CURRENTLY-VISIBLE tabs so a stale/hidden
  // request (e.g. "preview" as a non-host) safely falls back to Overrides rather than selecting nothing.
  // A manual tab click writes back through `setContextTab`, so the seam stays the single source of truth.
  const contextTab = useContextTab();
  const visibleTabs = new Set<string>(["overrides", "injections"]);
  if (showRoster) {
    // Group config is host-AND-group (the same gate as the Roster tab — generation behavior is
    // meaningless for a solo chat).
    visibleTabs.add("roster");
    visibleTabs.add("group");
  }
  if (showPeople) {
    visibleTabs.add("people");
  }
  if (isHost) {
    visibleTabs.add("preview");
  }
  const activeTab = contextTab !== null && visibleTabs.has(contextTab) ? contextTab : "overrides";

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
          <TabsTab value="overrides">Overrides</TabsTab>
          {/* Roster (group controls, task #29) — host-AND-group-only, mirroring the Preview gate: mute /
            talkativeness / force-turn are host authority (substrate/auth/matrix.ts) AND meaningless for
            a solo (1-character) chat, so neither a member nor a solo-chat host sees the tab. The cast
            bar (chat-room-surface) is the member-visible glance surface, size-gated the same way. */}
          {showRoster ? <TabsTab value="roster">Roster</TabsTab> : null}
          {showRoster ? <TabsTab value="group">Group</TabsTab> : null}
          {/* People (multi-human invites lane) — capability-gated, member-visible, NOT group-gated
              (see the `showPeople` derivation above). */}
          {showPeople ? <TabsTab value="people">People</TabsTab> : null}
          {isHost ? <TabsTab value="preview">Preview</TabsTab> : null}
          <TabsTab value="injections">Injections</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="overrides">
          <RoomOverridesForm
            entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}${chatId}`}
            roomOverrides={chat.roomOverrides}
            isHost={isHost}
            save={isHost ? saveOverrides : undefined}
          />
        </TabsPanel>

        {showRoster ? (
          <TabsPanel value="roster">
            <RosterPanel
              members={rosterMembers}
              onSetDisabled={(characterId, disabled): void =>
                setDisabled.mutate({ chatId, characterId, disabled })
              }
              onSetTalkativeness={(characterId, talkativeness): void =>
                setTalkativeness.mutate({ chatId, characterId, talkativeness })
              }
              onForceTurn={(characterId): void => forceTurn.mutate({ chatId, characterId })}
            />
          </TabsPanel>
        ) : null}

        {showRoster ? (
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

        {showPeople ? (
          <TabsPanel value="people">
            <PeoplePanel chatId={chatId} humans={humans} viewerIsHost={isHost} />
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
