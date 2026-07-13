import type { CharacterId, ChatId, PresetId, WorldBookId } from "@orb/kit/ids";
import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";
import type { ChatBusDeps } from "#data";
import { useInvalidation, useUserBus } from "#data";
import {
  AppShell,
  ContextTabsPanel,
  RAIL_SECTIONS,
  useIsMobileViewport,
  useShellLayout,
  YouSheet,
} from "#features/app-shell";
import { AccountSurface, useAuthConfig } from "#features/auth";
import {
  CharacterActionsMenu,
  CharacterEditorSurface,
  CharacterFacetInspector,
  CharacterLibraryAnchor,
  CharacterLibrarySurface,
  CharacterLibraryWelcome,
  CharacterOptionsTab,
  CharacterRelationsTab,
} from "#features/character";
import type { GoToSection } from "#features/chat";
import {
  ChatContextPanel,
  ChatHeaderSurface,
  ChatLandingSurface,
  ChatListAnchor,
  ChatListSurface,
  ChatRoomSurface,
  CommandPaletteSurface,
  clearJoinParam,
  DraftChatHeader,
  DraftContextPanel,
  JoinInviteDialog,
  NewChatPicker,
  readJoinToken,
} from "#features/chat";
import { NotificationBell } from "#features/notifications";
import { FirstRunPersonaDialog, PersonaPanelSurface } from "#features/persona";
import {
  PresetEditorSurface,
  PresetLibraryAnchor,
  PresetLibrarySurface,
  PresetLibraryWelcome,
  PresetSectionInspector,
  PresetUsageContext,
} from "#features/preset";
import { ImportOnboardingCard, SettingsShell, ThemePickerSurface } from "#features/settings";
import {
  BookAttachments,
  WorldInfoEditorSurface,
  WorldInfoLibraryAnchor,
  WorldInfoLibrarySurface,
  WorldInfoWelcome,
} from "#features/world-info";
import {
  chatStream,
  clearPresetSection,
  commitDraft,
  goToLanding,
  isCommitted,
  isLanding,
  openModal,
  selectChat,
  selectPreset,
  selectWorldBook,
  setActiveSection,
  setContextTab,
  setMobileSheet,
  setPanelMode,
  startNewChat,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useActiveSessionKey,
  useSelectedCharacterId,
  useSelectedPresetId,
  useSelectedWorldBookId,
} from "#state";

// The `/` home: the composition root + the app's central navigation seam. It mounts the four-region
// AppShell and is the ONE reactive reader of the active-chat store; a route may import a feature front
// door but a feature may NOT import another feature — every domain touch lives HERE.
//
// `sessionKey` is ChatRoomSurface's React key — stable across a draft→committed promotion so the
// surface does not remount mid-first-turn (which would tear down the live SSE subscription).
export function HomePage(): ReactElement {
  // Single-user renders none of the three multi-human surfaces (bell, People tab, /join landing);
  // `false` until the config lands so chrome never flashes-then-yanks.
  const { data: authConfig } = useAuthConfig();
  const multiHumanCapable = authConfig?.multiHumanCapable === true;
  // The one-shot `?join=<token>` handoff — captured at mount then scrubbed from the address bar (a
  // raw invite token must not linger in history).
  const [joinToken, setJoinToken] = useState(readJoinToken);
  useEffect(() => {
    if (joinToken !== null) {
      clearJoinParam();
    }
  }, [joinToken]);
  const invalidation = useInvalidation();
  const busDeps: ChatBusDeps = { stream: chatStream, invalidate: invalidation.invalidate };
  // The always-on per-user entity-changed stream, mounted once here (never in a feature, which could
  // unmount and drop the freshness driver).
  useUserBus({
    invalidateUser: invalidation.invalidateUser,
    invalidateAllUserRoots: invalidation.invalidateAllUserRoots,
  });

  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const activeSection = useActiveSection();
  const selectedPresetId = useSelectedPresetId();
  const selectedWorldBookId = useSelectedWorldBookId();
  // When the Chats LIST is docked it already is the recents finder, so the landing drops its own
  // "Recent chats" to avoid duplicating it.
  const shellLayout = useShellLayout();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = isCommitted(handle) ? handle.id : null;
  const isMobile = useIsMobileViewport();
  const revealSectionInspector = (): void => {
    setContextTab("section");
    if (isMobile) {
      setMobileSheet("context");
    } else {
      setPanelMode("context", "docked");
    }
  };
  // Clear the section selection and, on mobile, close the CONTEXT sheet (no-op on desktop).
  const dismissSectionInspector = (): void => {
    clearPresetSection();
    if (isMobile) {
      setMobileSheet(null);
    }
  };
  // Closes any open mobile LIST sheet so it doesn't stay over the editor after a selection.
  const selectPresetFromList = (id: PresetId): void => {
    selectPreset(id);
    setMobileSheet(null);
  };
  const selectWorldBookFromList = (id: WorldBookId): void => {
    selectWorldBook(id);
    setMobileSheet(null);
  };
  // A facet-row click opens the CONTEXT "field" tab, docked on desktop / a sheet on mobile.
  const revealFieldInspector = (): void => {
    setContextTab("field");
    if (isMobile) {
      setMobileSheet("context");
    } else {
      setPanelMode("context", "docked");
    }
  };

  // After a host deletes the chat the CONTENT is showing, return to the landing surface so the room
  // never points at a dropped chat.
  const onDeletedChat = (deletedChatId: ChatId): void => {
    if (activeChatId === deletedChatId) {
      goToLanding();
    }
  };
  // Land on the selected chat and close any open mobile list sheet (no-op on desktop).
  const selectChatFromList = (chatId: ChatId): void => {
    selectChat(chatId);
    setMobileSheet(null);
  };
  const openNewChatPicker = (): void => openModal("newChat");
  const browseCharacters = (): void => setActiveSection("characters");
  const startChatWithCharacter = (characterId: CharacterId): void => {
    startNewChat({ characterIds: [characterId] });
  };

  // The palette's "Go to" targets, bridged from the rail's own section registry.
  const goToSections = useMemo<readonly GoToSection[]>(
    () => RAIL_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
    [],
  );

  // The Chats topbar identity: a committed chat's roster header, or a draft's seeded-character
  // identity so a new chat is never an anonymous void.
  const draftCharacterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];
  const chatsHeader = ((): ReactElement | null => {
    if (activeChatId !== null) {
      return <ChatHeaderSurface chatId={activeChatId} multiHumanCapable={multiHumanCapable} />;
    }
    if (draftCharacterIds.length > 0) {
      return <DraftChatHeader characterIds={draftCharacterIds} />;
    }
    return null;
  })();

  // The Chats CONTEXT body: a committed chat's server-backed panel, or a draft's editable twin.
  const chatsContext = ((): ReactElement | null => {
    if (activeChatId !== null) {
      return <ChatContextPanel chatId={activeChatId} multiHumanCapable={multiHumanCapable} />;
    }
    if (handle.kind === "draft") {
      return <DraftContextPanel draftKey={handle.draftKey} characterIds={draftCharacterIds} />;
    }
    return null;
  })();

  const routeAnnouncement = ((): string => {
    if (activeSection === "chats") {
      if (activeChatId !== null) {
        return "Loaded chat.";
      }
      if (draftCharacterIds.length > 0) {
        return "New chat draft.";
      }
      return "Chats list.";
    }
    if (activeSection === "characters") {
      if (selectedCharacterId !== null) {
        return "Loaded character details.";
      }
      return "Character library.";
    }
    return "App loaded.";
  })();

  return (
    <>
      <AriaAnnouncer message={routeAnnouncement} />
      <AppShell
        railFoot={<PersonaPanelSurface />}
        // Topbar chrome, mounted only while the deployment can seat a second human.
        topbarTrail={multiHumanCapable ? <NotificationBell /> : undefined}
        sections={{
          chats: {
            header: chatsHeader,
            context: chatsContext,
            list: (
              <ChatListAnchor>
                <ChatListSurface
                  activeChatId={activeChatId}
                  onNewChat={openNewChatPicker}
                  onSelect={selectChatFromList}
                  onDeletedChat={onDeletedChat}
                />
              </ChatListAnchor>
            ),
            // A landing handle (nothing selected) renders the welcome hero, never an empty room.
            content: isLanding(handle) ? (
              <Stack className="h-full min-h-0">
                <ImportOnboardingCard />
                <Stack className="min-h-0 flex-1">
                  <ChatLandingSurface
                    onSelect={selectChat}
                    onStartChat={startChatWithCharacter}
                    onNewChat={openNewChatPicker}
                    onBrowseCharacters={browseCharacters}
                    showRecents={shellLayout.listMode !== "docked"}
                  />
                </Stack>
              </Stack>
            ) : (
              <ChatRoomSurface
                key={sessionKey}
                busDeps={busDeps}
                draftSeed={draftSeed}
                initialHandle={handle}
                onChatForked={selectChat}
                onChatStarted={commitDraft}
              />
            ),
          },
          characters: {
            list: (
              <CharacterLibraryAnchor>
                <CharacterLibrarySurface />
              </CharacterLibraryAnchor>
            ),
            // A selected row opens the character editor; nothing selected shows the teaching welcome.
            content:
              selectedCharacterId === null ? (
                <CharacterLibraryWelcome />
              ) : (
                <CharacterEditorSurface
                  characterId={selectedCharacterId}
                  onRevealField={revealFieldInspector}
                />
              ),
            // Three tabs: Field (drilled facet detail), Links (world books + personas), Options.
            context:
              selectedCharacterId === null ? undefined : (
                <ContextTabsPanel
                  section="characters"
                  actions={<CharacterActionsMenu characterId={selectedCharacterId} />}
                  bodies={{
                    field: <CharacterFacetInspector characterId={selectedCharacterId} />,
                    links: <CharacterRelationsTab characterId={selectedCharacterId} />,
                    options: <CharacterOptionsTab characterId={selectedCharacterId} />,
                  }}
                />
              ),
          },
          presets: {
            list: (
              <PresetLibraryAnchor>
                <PresetLibrarySurface onSelectPreset={selectPresetFromList} />
              </PresetLibraryAnchor>
            ),
            content:
              selectedPresetId === null ? (
                <PresetLibraryWelcome />
              ) : (
                <PresetEditorSurface
                  presetId={selectedPresetId}
                  onRevealSection={revealSectionInspector}
                  onDismissSection={dismissSectionInspector}
                />
              ),
            context:
              selectedPresetId === null ? undefined : (
                <ContextTabsPanel
                  section="presets"
                  bodies={{
                    section: <PresetSectionInspector onDismiss={dismissSectionInspector} />,
                    usage: <PresetUsageContext presetId={selectedPresetId} />,
                  }}
                />
              ),
          },
          worldInfo: {
            list: (
              <WorldInfoLibraryAnchor>
                <WorldInfoLibrarySurface onSelectBook={selectWorldBookFromList} />
              </WorldInfoLibraryAnchor>
            ),
            content:
              selectedWorldBookId === null ? (
                <WorldInfoWelcome />
              ) : (
                <WorldInfoEditorSurface bookId={selectedWorldBookId} />
              ),
            context:
              selectedWorldBookId === null ? undefined : (
                <BookAttachments bookId={selectedWorldBookId} />
              ),
          },
        }}
        modals={{
          theme: <ThemePickerSurface />,
          settings: <SettingsShell />,
          newChat: <NewChatPicker />,
          command: <CommandPaletteSurface goToSections={goToSections} />,
          account: <AccountSurface />,
          you: <YouSheet />,
        }}
      />
      {/* Renders nothing once the viewer owns a persona; forces the create flow on a fresh account. */}
      <FirstRunPersonaDialog />
      {/* The /join link landing — mounts only when a token arrived and the deployment is capable. */}
      {multiHumanCapable && joinToken !== null ? (
        <JoinInviteDialog token={joinToken} onDone={(): void => setJoinToken(null)} />
      ) : null}
    </>
  );
}
