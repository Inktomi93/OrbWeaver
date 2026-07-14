import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuthConfig, useInvalidation, useUserBus } from "#data";
import {
  AppShell,
  ContextTabsPanel,
  RAIL_SECTIONS,
  SectionPlaceholder,
  YouSheet,
} from "#features/app-shell";
import { AccountSurface } from "#features/auth";
import {
  CharacterActionsMenu,
  CharacterFacetInspector,
  CharacterOptionsTab,
  CharacterRelationsTab,
  charactersSection,
} from "#features/character";
import type { GoToSection } from "#features/chat";
import {
  ChatContextPanel,
  ChatHeaderSurface,
  CommandPaletteSurface,
  chatsSection,
  clearJoinParam,
  DraftChatHeader,
  DraftContextPanel,
  JoinInviteDialog,
  NewChatPicker,
  readJoinToken,
} from "#features/chat";
import {
  CorpusArchetypesTab,
  CorpusCompareTab,
  CorpusMapTab,
  CorpusSimilarityTab,
  CorpusVisualsTab,
  corpusSection,
} from "#features/discovery";
import { NotificationBell } from "#features/notifications";
import { FirstRunPersonaDialog, PersonaPanelSurface } from "#features/persona";
import { PresetSectionInspector, PresetUsageContext, presetsSection } from "#features/preset";
import { refinerySection } from "#features/refinery";
import { ImportOnboardingCard, SettingsShell, ThemePickerSurface } from "#features/settings";
import {
  AnalyticsModelsTab,
  AnalyticsPersonasTab,
  AnalyticsTimeTab,
  analyticsSection,
} from "#features/stats";
import { worldInfoSection } from "#features/world-info";
import type { ChatHandle } from "#state";
import {
  dismissPresetSection,
  isCommitted,
  isLanding,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useSelectedCharacterId,
  useSelectedPresetId,
} from "#state";

// The Chats CONTENT body — `chatsSection.content` is the bare landing-vs-room surface; the shared-
// with-settings `ImportOnboardingCard` chrome wraps ONLY the landing case (a cross-feature import a chat
// component can't make, so it stays hand-wired here, never folded into the section definition).
function renderChatsContent(handle: ChatHandle): ReactNode {
  const content = typeof chatsSection.content === "function" ? chatsSection.content() : null;
  if (!isLanding(handle)) {
    return content;
  }
  return (
    <Stack className="h-full min-h-0">
      <ImportOnboardingCard />
      <Stack className="min-h-0 flex-1">{content}</Stack>
    </Stack>
  );
}

// The `/` home: the composition root + the app's central navigation seam. It mounts the four-region
// AppShell and is the ONE reactive reader of the active-chat store; a route may import a feature front
// door but a feature may NOT import another feature — every domain touch lives HERE.
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
  // The always-on per-user entity-changed stream, mounted once here (never in a feature, which could
  // unmount and drop the freshness driver).
  useUserBus({
    invalidateUser: invalidation.invalidateUser,
    invalidateAllUserRoots: invalidation.invalidateAllUserRoots,
  });

  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const activeSection = useActiveSection();
  const selectedPresetId = useSelectedPresetId();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = isCommitted(handle) ? handle.id : null;

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

  const chatsContent = renderChatsContent(handle);

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
          // chats is the last (M1.7) and hardest section migrated to the co-located SectionDefinition:
          // the LIST + CONTENT render from `chatsSection`, which reads its own selection/handle and folds
          // the LIST's mobile-sheet-close, new-chat, and delete-return-to-landing into #state intents (no
          // isMobile closures here). `header`/`context` stay hand-wired (chat's bespoke Tabs still serves
          // CONTEXT until the M1 cutover consumes `chatsSection.context`) — the shared-with-settings
          // `ImportOnboardingCard` chrome wraps ONLY the landing case, so it stays here too (a cross-
          // feature import `chatsSection.content` can't make).
          chats: {
            header: chatsHeader,
            context: chatsContext,
            list: chatsSection.list?.(),
            content: chatsContent,
          },
          // characters is the first section migrated to the co-located SectionDefinition (M1.1): the
          // LIST + CONTENT render from `charactersSection`, which reads its own selection and folds the
          // field-inspector reveal into a #state intent (no isMobile closure here). The CONTEXT still
          // rides the shell's ContextTabsPanel until the M1 cutover consumes `charactersSection.context`.
          characters: {
            list: charactersSection.list?.(),
            content:
              typeof charactersSection.content === "function" ? charactersSection.content() : null,
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
          // corpus is the fifth section migrated to the co-located SectionDefinition (M1.5): the LIST +
          // CONTENT render from `corpusSection`, which reads its own selection. The CONTEXT still rides
          // the shell's ContextTabsPanel until the M1 cutover consumes `corpusSection.context`.
          corpus: {
            list: corpusSection.list?.(),
            content: typeof corpusSection.content === "function" ? corpusSection.content() : null,
            // Five owner-scoped analytics tabs, always available: Archetypes / Visuals / Map / Similarity / Compare.
            context: (
              <ContextTabsPanel
                section="corpus"
                bodies={{
                  archetypes: <CorpusArchetypesTab />,
                  visuals: <CorpusVisualsTab />,
                  map: <CorpusMapTab />,
                  similarity: <CorpusSimilarityTab />,
                  compare: <CorpusCompareTab />,
                }}
              />
            ),
          },
          // analytics is the second section migrated to the co-located SectionDefinition (M1.2): the LIST
          // + CONTENT render from `analyticsSection`, which reads its own selection. The CONTEXT still
          // rides the shell's ContextTabsPanel until the M1 cutover consumes `analyticsSection.context`.
          analytics: {
            list: analyticsSection.list?.(),
            content:
              typeof analyticsSection.content === "function" ? analyticsSection.content() : null,
            // Three owner-scoped dimension tabs, always available: Models / Time / Personas.
            context: (
              <ContextTabsPanel
                section="analytics"
                bodies={{
                  models: <AnalyticsModelsTab />,
                  time: <AnalyticsTimeTab />,
                  personas: <AnalyticsPersonasTab />,
                }}
              />
            ),
          },
          // presets is the fourth section migrated to the co-located SectionDefinition (M1.4): the LIST +
          // CONTENT render from `presetsSection`, which reads its own selection and folds the LIST's
          // mobile-sheet-close and the section-inspector reveal/dismiss into #state intents (no isMobile
          // closures here). The CONTEXT still rides the shell's ContextTabsPanel until the M1 cutover
          // consumes `presetsSection.context`.
          presets: {
            list: presetsSection.list?.(),
            content: typeof presetsSection.content === "function" ? presetsSection.content() : null,
            context:
              selectedPresetId === null ? undefined : (
                <ContextTabsPanel
                  section="presets"
                  bodies={{
                    section: <PresetSectionInspector onDismiss={dismissPresetSection} />,
                    usage: <PresetUsageContext presetId={selectedPresetId} />,
                  }}
                />
              ),
          },
          // worldInfo is the third section migrated to the co-located SectionDefinition (M1.3): LIST +
          // CONTENT + CONTEXT all render from `worldInfoSection`, which reads its own selection and folds
          // the LIST's mobile-sheet-close into a #state intent. CONTEXT is the `single` arm (§6b) — this
          // route still hosts it directly (not via ContextTabsPanel, which only renders `tabs`) until the
          // M1 cutover consumes `worldInfoSection.context` through the shell.
          worldInfo: {
            list: worldInfoSection.list?.(),
            content:
              typeof worldInfoSection.content === "function" ? worldInfoSection.content() : null,
            context:
              worldInfoSection.context.kind === "single" ? worldInfoSection.context.body() : null,
          },
          // refinery is the founding DECLARED-PLANNED section (M1.6, §6a ratified O1): no list/context,
          // and CONTENT renders the definition's OWN placeholder copy (not the app-shell twin) since
          // `content` is the `{ planned }` arm, never a function.
          refinery: {
            content: (
              <SectionPlaceholder
                title={refinerySection.placeholder.title}
                description={refinerySection.placeholder.description}
                weave={true}
              />
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
