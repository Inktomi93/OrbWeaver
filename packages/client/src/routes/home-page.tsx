import type { CharacterId, ChatId } from "@orb/kit/ids";
import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import type { ChatBusDeps } from "#data";
import { createInvalidation, useTRPC, useUserBus } from "#data";
import {
  AppShell,
  ContextTabsPanel,
  RAIL_SECTIONS,
  useShellLayout,
  YouSheet,
} from "#features/app-shell";
import {
  CharacterActionsMenu,
  CharacterActivityTab,
  CharacterAppearanceTab,
  CharacterEditorSurface,
  CharacterHistoryTab,
  CharacterLibraryAnchor,
  CharacterLibrarySurface,
  CharacterLibraryWelcome,
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
  DraftChatHeader,
  DraftContextPanel,
  NewChatPicker,
} from "#features/chat";
import { PersonaPanelSurface } from "#features/persona";
import { SettingsShell, ThemePickerSurface } from "#features/settings";
import {
  chatStream,
  commitDraft,
  goToLanding,
  isCommitted,
  isLanding,
  openModal,
  selectChat,
  setActiveSection,
  setMobileSheet,
  startNewChat,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useActiveSessionKey,
  useSelectedCharacterId,
} from "#state";

// The `/` home: the composition root + the app's central navigation seam. It mounts the four-region
// <AppShell> (UI-Arch §4.1) and is the ONE reactive READER of the active-chat store (state/active-chat-
// store.ts) — it reads which chat is active and renders the right CONTENT (a <ChatRoomSurface> for the
// active draft/committed chat), plus the Chats-LIST + Characters-LIST as section content. A ROUTE may
// import a feature front door (route→feature is legal); a feature may NOT import another feature — so
// app-shell stays domain-agnostic (regions + slots) and every domain touch lives HERE.
//
// THE ANTI-JANK SEAM (UI-Arch §5.1): every WRITER of the active chat (the character card's "start chat",
// the chat-list select, a message row's Fork) only CALLS a store action; this route is the single
// reader. No surface reads-and-effects off an ambient active chat, so the neo `this_chid` chase is
// impossible by construction. The character library reaches "start a chat with X" via the SAME shared
// stores (startNewChat + setActiveSection), never a character→chat import.
//
// THE KEY (state/active-chat-store.ts THE KEY DISCIPLINE): `sessionKey` is <ChatRoomSurface>'s React
// key — stable across a draft→committed promotion, so the surface does NOT remount mid-first-turn
// (which would tear down the live SSE subscription + the in-flight send). It changes only on new-chat /
// select-different-chat. `onChatStarted`→`commitDraft` records the committed id WITHOUT changing the key;
// `onChatForked`→`selectChat` is the unified fork-nav landing (both seams terminate at the store).
//
// `stream` is the chat-stream singleton; `invalidate` is the central seam rebuilt per render from the
// provided tRPC proxy + QueryClient (stateless + fire-and-forget — identity churn is harmless, the
// subscription keys off ids, not deps identity).
export function HomePage(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = createInvalidation({ queryClient, trpc });
  const busDeps: ChatBusDeps = { stream: chatStream, invalidate: invalidation.invalidate };
  // PD user-bus lane: the ALWAYS-ON per-user entity-changed stream — device B's write to any owned
  // non-chat surface (or the chat LIST) invalidates this device's cache. Mounted ONCE here (the authed
  // composition reader), never in a feature (a feature could unmount + drop the freshness driver).
  useUserBus({
    invalidateUser: invalidation.invalidateUser,
    invalidateAllUserRoots: invalidation.invalidateAllUserRoots,
  });

  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const activeSection = useActiveSection();
  // The resolved shell layout — the composition root reads it to lay CONTENT out against the panels. Here:
  // when the Chats LIST is DOCKED it already IS the recents finder (§4.3 rule 5), so the landing drops its
  // own "Recent chats" to kill the duplicate (#13). Collapsed/overlay/mobile ⇒ the landing owns recents.
  const shellLayout = useShellLayout();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = isCommitted(handle) ? handle.id : null;

  // J5 delete-of-the-active-chat: after a host deletes the chat the CONTENT is showing, the id 404s —
  // return to the landing surface so the room never points at a dropped chat (the goToLanding consumer).
  const onDeletedChat = (deletedChatId: ChatId): void => {
    if (activeChatId === deletedChatId) {
      goToLanding();
    }
  };
  // Selecting a chat from the LIST panel: land on it AND close any open mobile list sheet (L6/J12) — a
  // mobile sheet is transient, so tapping a row must reveal the chat, not leave the list covering it.
  // `setMobileSheet(null)` is a no-op on desktop (the resolve ignores `mobileSheet`), so the docked
  // desktop list is untouched. Wired at the route (the §5.1 composition seam), not inside the chat feature.
  const selectChatFromList = (chatId: ChatId): void => {
    selectChat(chatId);
    setMobileSheet(null);
  };
  // Every "new chat" affordance (chat-list "+", landing hero, ⌘K) opens the J2 character picker first —
  // a characterless draft is no longer the default (D62 P4 / rule 2).
  const openNewChatPicker = (): void => openModal("newChat");
  // The Characters-section jump the landing quick-picks + "All characters →" use.
  const browseCharacters = (): void => setActiveSection("characters");
  const startChatWithCharacter = (characterId: CharacterId): void => {
    startNewChat({ characterIds: [characterId] });
  };

  // The ⌘K palette's "Go to" targets — bridged from the rail's OWN section registry (RAIL_SECTIONS) to
  // the chat-feature palette as {id,label} (§5.1 seam: the route owns app-shell↔chat composition, so the
  // section labels keep ONE home). Stable per render — RAIL_SECTIONS is a module constant.
  const goToSections = useMemo<readonly GoToSection[]>(
    () => RAIL_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
    [],
  );

  // UIP-202 + J2/J3: the Chats topbar identity — a committed chat's roster header, OR (character-first)
  // a DRAFT's seeded-character identity so a new chat is never an anonymous void. Landing/blank falls
  // back to the shell's section-name title. Lives in the CHATS SectionSlot entry, so it renders only
  // while Chats owns the shell — no per-region section guard (the shell reads sections[activeSection]).
  const draftCharacterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];
  const chatsHeader = ((): ReactElement | null => {
    if (activeChatId !== null) {
      return <ChatHeaderSurface chatId={activeChatId} />;
    }
    if (draftCharacterIds.length > 0) {
      return <DraftChatHeader characterIds={draftCharacterIds} />;
    }
    return null;
  })();

  // The Chats CONTEXT body (J2/J3): a committed chat's server-backed panel, or a DRAFT's draft-config-
  // backed twin (fully editable pre-send). Landing / no draft ⇒ null (the shell shows its placeholder).
  // Section-keyed via the SectionSlot entry — CONTEXT follows CONTENT (§4.2 rule 1) by construction:
  // switching to another rail section swaps this out with that section's (or the placeholder), never
  // leaving a stale chat panel mounted beside foreign CONTENT.
  const chatsContext = ((): ReactElement | null => {
    if (activeChatId !== null) {
      return <ChatContextPanel chatId={activeChatId} />;
    }
    if (handle.kind === "draft") {
      return <DraftContextPanel draftKey={handle.draftKey} characterIds={draftCharacterIds} />;
    }
    return null; // landing / no draft → the shell renders its own placeholder (`context ?? …`)
  })();

  // Compute the current logical route for the accessibility announcer.
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
        sections={{
          chats: {
            // The Chats topbar identity + CONTEXT panel ride the SAME section entry as LIST/CONTENT
            // (§4.2: the four regions are one ensemble, keyed by the active section — Discord physics).
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
            // CONTENT branches on the handle: a `landing` handle (nothing selected — the at-rest state)
            // renders the welcome hero, never an empty room (D62 P4 / J1). Else the chat room (TS narrows
            // `handle` to `ActiveChatHandle` in this branch — a landing handle can't reach the composer).
            content: isLanding(handle) ? (
              <ChatLandingSurface
                onSelect={selectChat}
                onStartChat={startChatWithCharacter}
                onNewChat={openNewChatPicker}
                onBrowseCharacters={browseCharacters}
                showRecents={shellLayout.listMode !== "docked"}
              />
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
            // LIST = the section's collection (UI-Arch §4.1): search + the character rows, mirroring the
            // Chats section's list/content split (ChatListAnchor+ChatListSurface / ChatRoomSurface).
            list: (
              <CharacterLibraryAnchor>
                <CharacterLibrarySurface />
              </CharacterLibraryAnchor>
            ),
            // CONTENT branches on the selection (FINAL-Character §6 · UI-Arch §4.2 rule 1: LIST selection
            // drives CONTENT): a selected row opens the character EDITOR (character.get + the draft card
            // form); nothing selected shows the teaching welcome. The route is the single reader of the
            // character-selection store (§5.1).
            content:
              selectedCharacterId === null ? (
                <CharacterLibraryWelcome />
              ) : (
                <CharacterEditorSurface characterId={selectedCharacterId} />
              ),
            // CONTEXT (FINAL-Character §7): the relationship ledger + config + actions, composed via the
            // CONTEXT_SLOTS registry — the route injects the per-tab bodies + the Actions menu; the shell
            // renders the registry-driven tab strip. Nothing selected ⇒ the shell's own placeholder.
            context:
              selectedCharacterId === null ? undefined : (
                <ContextTabsPanel
                  section="characters"
                  actions={<CharacterActionsMenu characterId={selectedCharacterId} />}
                  bodies={{
                    activity: <CharacterActivityTab characterId={selectedCharacterId} />,
                    appearance: <CharacterAppearanceTab characterId={selectedCharacterId} />,
                    relations: <CharacterRelationsTab characterId={selectedCharacterId} />,
                    history: <CharacterHistoryTab characterId={selectedCharacterId} />,
                  }}
                />
              ),
          },
        }}
        // Route-composed modal bodies (over the app-shell placeholder slots — the shell stays domain-
        // agnostic): the appearance settings pane, the J2 new-chat picker, and the J4 ⌘K palette.
        modals={{
          theme: <ThemePickerSurface />,
          settings: <SettingsShell />,
          newChat: <NewChatPicker />,
          command: <CommandPaletteSurface goToSections={goToSections} />,
          // The mobile "You" bottom sheet (L6/J12) — a shell-tier body the route composes over the `you`
          // slot (the same seam as the four above), keeping app-shell's modal-slots lib component-free.
          you: <YouSheet />,
        }}
      />
    </>
  );
}
