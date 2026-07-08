// The DRAFT CONTEXT panel (J2/J3) — the shell's right-region body for an active DRAFT chat, the twin of
import { useRef } from "react";
import { useFocusOnMount } from "#lib";
// `ChatContextPanel` for a chat that has no server row yet. A draft is fully editable pre-send, so its
// config tabs write to the `draft-config` store (keyed by `draftKey`) instead of the server verbs; the
// first send carries the whole config into `chat.startChat` (use-send-message.ts). Same editors, same
// look as the committed panel — only the SOURCE (draftConfig + the founding cards) + SAVE seam (setDraft*)
// differ (the source-agnostic editor discipline, decision #3), never a separate "draft mode" UI.
//
// HOST: a draft is authored by (and only visible to) its creator, so the viewer is ALWAYS host — every
// tab is live. The Overrides tab needs no server read (draftConfig); the Roster tab reads the FOUNDING
// cards (`character.get`) for the member names — the same reads the greeting preview already warmed
// (shared Query cache) — inside its own QueryBoundary.
//
// TABS: Overrides · Injections (always) · Roster · Group (GROUP drafts only — ≥2 founding characters,
// mirroring the committed host-AND-group gate). The Preview tab is deliberately ABSENT — there is no
// server assembly to preview before the chat exists.

import type { ChatInjectionInput, RoomOverrides } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  groupConfigSchema,
  TALKATIVENESS_DEFAULT,
} from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useTRPC } from "#data";
import type { DraftConfig } from "#state";
import {
  setContextTab,
  setDraftGroupConfig,
  setDraftInjections,
  setDraftRoomOverrides,
  setDraftRosterOverride,
  useContextTab,
  useDraftConfig,
} from "#state";
import { GroupConfigForm } from "../components/group-config-form";
import { InjectionsList } from "../components/injections-manager";
import { RoomOverridesForm } from "../components/room-overrides-form";
import type { RosterMember } from "../components/roster-panel";
import { RosterPanel } from "../components/roster-panel";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import { fromInjectionForm } from "../hooks/use-injection-row-form";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../hooks/use-room-overrides-form";

const EMPTY_ROOM_OVERRIDES: RoomOverrides = {};
const NO_INJECTIONS: readonly ChatInjectionInput[] = [];
/** The seed for a freshly-added draft injection (mirrors the committed `NEW_INJECTION`). */
const NEW_DRAFT_INJECTION: ChatInjectionInput = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
};
/** A group draft (mute/talkativeness are meaningless for a solo cast — the committed roster-of-1 gate). */
const GROUP_FLOOR = 2;

export interface DraftContextPanelProps {
  /** The active draft's key — the draft-config store partition every tab reads/writes. */
  readonly draftKey: string;
  /** The founding cast — drives the Roster tab (its member rows) + the group gate. */
  readonly characterIds: readonly CharacterId[];
}

/** The draft CONTEXT panel — the pre-send config tabs, writing to the draft-config store. */
export function DraftContextPanel({
  draftKey,
  characterIds,
}: DraftContextPanelProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const draftConfig = useDraftConfig(draftKey);
  // A draft is always hosted by its author. The Roster tab shows only for a GROUP draft (mirrors the
  // committed host-AND-group gate). A hidden/stale `contextTab` request safely falls back to Overrides.
  const showRoster = characterIds.length >= GROUP_FLOOR;
  const contextTab = useContextTab();
  const visibleTabs = new Set<string>(["overrides", "injections"]);
  if (showRoster) {
    // Group config is group-only (the same gate as Roster — generation behavior is meaningless solo).
    visibleTabs.add("roster");
    visibleTabs.add("group");
  }
  const activeTab = contextTab !== null && visibleTabs.has(contextTab) ? contextTab : "overrides";

  // The draft persist seam for Overrides (the committed twin passes the `setRoomOverrides` verb): a
  // synchronous store write, wrapped as the Promise the autosave form's `save` contract expects.
  const saveOverrides = (overrides: RoomOverrides): Promise<unknown> => {
    setDraftRoomOverrides(draftKey, overrides);
    return Promise.resolve();
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full outline-none">
      <Tabs
        value={activeTab}
        onValueChange={(value): void => setContextTab(typeof value === "string" ? value : null)}
      >
        <TabsList>
          <TabsTab value="overrides">Overrides</TabsTab>
          {showRoster ? <TabsTab value="roster">Roster</TabsTab> : null}
          {showRoster ? <TabsTab value="group">Group</TabsTab> : null}
          <TabsTab value="injections">Injections</TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="overrides">
          <RoomOverridesForm
            entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}draft:${draftKey}`}
            roomOverrides={draftConfig.roomOverrides ?? EMPTY_ROOM_OVERRIDES}
            isHost={true}
            save={saveOverrides}
          />
        </TabsPanel>

        {showRoster ? (
          <TabsPanel value="roster">
            <QueryBoundary
              fallback={<Text tone="muted">Loading roster…</Text>}
              renderError={(_error, retry): ReactElement => (
                <Text tone="muted">
                  Couldn't load the roster.{" "}
                  <Button intent="ghost" onClick={retry}>
                    Retry
                  </Button>
                </Text>
              )}
            >
              <DraftRosterTab
                draftKey={draftKey}
                characterIds={characterIds}
                rosterOverrides={draftConfig.rosterOverrides}
              />
            </QueryBoundary>
          </TabsPanel>
        ) : null}

        {showRoster ? (
          <TabsPanel value="group">
            <GroupConfigForm
              // The draft stores a lenient `GroupConfigInput`; parse it (defaults-filled) to the full
              // `GroupConfig` the form edits. Absent ⇒ the default room behavior.
              config={groupConfigSchema.parse(draftConfig.groupConfig ?? DEFAULT_GROUP_CONFIG)}
              onSave={(next): void => setDraftGroupConfig(draftKey, next)}
            />
          </TabsPanel>
        ) : null}

        <TabsPanel value="injections">
          <DraftInjectionsTab draftKey={draftKey} injections={draftConfig.injections} />
        </TabsPanel>
      </Tabs>
    </Stack>
  );
}

interface DraftInjectionsTabProps {
  readonly draftKey: string;
  readonly injections: DraftConfig["injections"];
}

/** The draft Injections tab body — the local `draftConfig.injections` array projected into the pure
 *  `InjectionsList` (rows keyed by array INDEX — a draft injection has no server id yet), writing back via
 *  `setDraftInjections` (add = append, save = replace-at-index, delete = filter-out). No server round-trip;
 *  the first send carries the whole array into `chat.startChat`. */
function DraftInjectionsTab({ draftKey, injections }: DraftInjectionsTabProps): ReactElement {
  const current = injections ?? NO_INJECTIONS;
  const rows = current.map((value, index) => ({ key: String(index), value }));

  return (
    <InjectionsList
      rows={rows}
      isHost={true}
      onAdd={(): void => setDraftInjections(draftKey, [...current, NEW_DRAFT_INJECTION])}
      onSave={(key, values: InjectionFormValues): Promise<unknown> => {
        const index = Number(key);
        const next = current.map((inj, i) => (i === index ? fromInjectionForm(values) : inj));
        setDraftInjections(draftKey, next);
        return Promise.resolve();
      }}
      onDelete={(key): void =>
        setDraftInjections(
          draftKey,
          current.filter((_, i) => i !== Number(key)),
        )
      }
    />
  );
}

interface DraftRosterTabProps {
  readonly draftKey: string;
  readonly characterIds: readonly CharacterId[];
  readonly rosterOverrides: DraftConfig["rosterOverrides"];
}

/** The draft Roster tab body — the founding cast projected into `RosterMember`s (names from the founding
 *  cards, mute/talkativeness from `draftConfig.rosterOverrides`), writing to `setDraftRosterOverride`. No
 *  force-turn (a draft has no turn to force — the `RosterPanel.onForceTurn` omission). */
function DraftRosterTab({
  draftKey,
  characterIds,
  rosterOverrides,
}: DraftRosterTabProps): ReactElement {
  const trpc = useTRPC();
  const characters = useSuspenseQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  const members: RosterMember[] = characters.map((c) => {
    const override = rosterOverrides?.[c.data.id];
    return {
      characterId: c.data.id,
      displayName: c.data.name,
      disabled: override?.disabled ?? false,
      talkativeness: override?.talkativeness ?? TALKATIVENESS_DEFAULT,
    };
  });

  return (
    <RosterPanel
      members={members}
      onSetDisabled={(characterId, disabled): void =>
        setDraftRosterOverride(draftKey, characterId, { disabled })
      }
      onSetTalkativeness={(characterId, talkativeness): void =>
        setDraftRosterOverride(draftKey, characterId, { talkativeness })
      }
    />
  );
}
