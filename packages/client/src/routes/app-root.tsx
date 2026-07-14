// app-root.tsx — the `/` route (O7, renamed from home-page): a THIN mount of the four-region AppShell.
// The section registry (assembled in main.tsx) drives rail/list/content/header/placeholder; this route
// keeps only §7 residue (the always-on user bus, the aria announcer, the ?join handoff, first-run persona)
// + the FLAG[lockdown-M3] CONTEXT bridge (context bodies stay hand-wired until M3 consumes each section's
// ContextDefinition) + the modals composition (until M4). The ONE sanctioned composition route — it may
// import feature front doors (G1 exempts it, like router.tsx→auth); a `sections={{…}}` god-map is RED.

import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuthConfig, useInvalidation, useUserBus } from "#data";
import { AppShell, ContextTabsPanel, YouSheet } from "#features/app-shell";
import { AccountSurface } from "#features/auth";
import {
  CharacterActionsMenu,
  CharacterFacetInspector,
  CharacterOptionsTab,
  CharacterRelationsTab,
} from "#features/character";
import type { GoToSection } from "#features/chat";
import {
  ChatContextPanel,
  CommandPaletteSurface,
  clearJoinParam,
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
} from "#features/discovery";
import { NotificationBell } from "#features/notifications";
import { FirstRunPersonaDialog, PersonaPanelSurface } from "#features/persona";
import { PresetSectionInspector, PresetUsageContext } from "#features/preset";
import { SettingsShell, ThemePickerSurface } from "#features/settings";
import { AnalyticsModelsTab, AnalyticsPersonasTab, AnalyticsTimeTab } from "#features/stats";
import {
  dismissPresetSection,
  isCommitted,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useSectionRegistry,
  useSelectedCharacterId,
  useSelectedPresetId,
} from "#state";

export function AppRoot(): ReactElement {
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

  const registry = useSectionRegistry();
  const handle = useActiveChatHandle();
  const draftSeed = useActiveDraftSeed();
  const activeSection = useActiveSection();
  const selectedPresetId = useSelectedPresetId();
  const selectedCharacterId = useSelectedCharacterId();
  const activeChatId = isCommitted(handle) ? handle.id : null;
  const draftCharacterIds = handle.kind === "draft" ? (draftSeed?.characterIds ?? []) : [];

  // The palette's "Go to" targets, derived from the section registry.
  const goToSections = useMemo<readonly GoToSection[]>(
    () => registry.list().map((d) => ({ id: d.id, label: d.rail.label })),
    [registry],
  );

  // The M3 CONTEXT bridge bodies (null ⇒ the shell renders its own "select something" placeholder).
  const chatsContext = ((): ReactNode => {
    if (activeChatId !== null) {
      return <ChatContextPanel chatId={activeChatId} multiHumanCapable={multiHumanCapable} />;
    }
    if (handle.kind === "draft") {
      return <DraftContextPanel draftKey={handle.draftKey} characterIds={draftCharacterIds} />;
    }
    return null;
  })();
  const charactersContext =
    selectedCharacterId === null ? null : (
      <ContextTabsPanel
        section="characters"
        actions={<CharacterActionsMenu characterId={selectedCharacterId} />}
        bodies={{
          field: <CharacterFacetInspector characterId={selectedCharacterId} />,
          links: <CharacterRelationsTab characterId={selectedCharacterId} />,
          options: <CharacterOptionsTab characterId={selectedCharacterId} />,
        }}
      />
    );
  const presetsContext =
    selectedPresetId === null ? null : (
      <ContextTabsPanel
        section="presets"
        bodies={{
          section: <PresetSectionInspector onDismiss={dismissPresetSection} />,
          usage: <PresetUsageContext presetId={selectedPresetId} />,
        }}
      />
    );
  const worldInfoContext = registry.get("worldInfo").context;

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
        // FLAG[lockdown-M3]: TEMPORARY CONTEXT bridge — each section's CONTEXT body stays hand-wired here
        // until M3 consumes its ContextDefinition from the registry. A sanctioned per-section scaffold
        // (G2 allowlist), deleted at M3; NOT a returning god-map (list/content/header ride the registry).
        sectionContext={{
          chats: { context: chatsContext },
          characters: { context: charactersContext },
          corpus: {
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
          analytics: {
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
          presets: { context: presetsContext },
          worldInfo: {
            context: worldInfoContext.kind === "single" ? worldInfoContext.body() : null,
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
