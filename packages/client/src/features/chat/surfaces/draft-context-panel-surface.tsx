// The DRAFT CONTEXT panel (J2/J3) — the shell's right-region body for an active DRAFT chat, the twin of
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
import { Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
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
import { DraftAddMemberPopover } from "../components/add-member-popover";
import { GroupConfigForm } from "../components/group-config-form";
import { InjectionsList } from "../components/injections-manager";
import { RoomOverridesForm } from "../components/room-overrides-form";
import type { RosterMember } from "../components/roster-panel";
import { RosterPanel } from "../components/roster-panel";
import { GROUP_CONFIG_ENTITY_PREFIX } from "../hooks/use-group-config-form";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import { fromInjectionForm } from "../hooks/use-injection-row-form";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";

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
  /** The founding SEED cast (from `draftSeed`). Pre-send add-member widens the effective cast internally
   *  (seed ∪ `config.addedCharacterIds`) — home-page threads only the seed, mirroring `resolveDraftCommit`. */
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
  // The EFFECTIVE founding cast = the seed ∪ any pre-send add-member picks (the SAME fold the commit does,
  // draft-commit.ts). Deduped so a re-add never double-seats. Drives the Roster/Group tabs + their gate,
  // and the add-member picker's exclude set — so an added member disappears from the picker + appears in
  // Roster the instant it's added, and a 2nd add flips a solo draft into a group (Roster/Group tabs appear).
  const cast = [...new Set([...characterIds, ...(draftConfig.addedCharacterIds ?? [])])];
  // A draft is always hosted by its author. The Roster tab shows only for a GROUP draft (mirrors the
  // committed host-AND-group gate). A hidden/stale `contextTab` request safely falls back to Overrides.
  const showRoster = cast.length >= GROUP_FLOOR;
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
      {/* Pre-send add-member (the audit's D3): a "Cast" header row with the same "+" picker the committed
          cast bar carries, ABOVE the tabs so it's reachable even on a solo draft (add-member is how a solo
          draft grows into a group). Writes `addDraftCharacter`; `cast` excludes the current members. */}
      <Row align="center" justify="between" className="px-block py-row">
        <Text size="label" tone="muted" weight="medium">
          Cast
        </Text>
        <DraftAddMemberPopover draftKey={draftKey} existingCharacterIds={cast} />
      </Row>
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
                characterIds={cast}
                rosterOverrides={draftConfig.rosterOverrides}
              />
            </QueryBoundary>
          </TabsPanel>
        ) : null}

        {showRoster ? (
          <TabsPanel value="group">
            <GroupConfigForm
              entityId={`${GROUP_CONFIG_ENTITY_PREFIX}draft:${draftKey}`}
              // The draft stores a lenient `GroupConfigInput`; parse it (defaults-filled) to the full
              // `GroupConfig` the form edits. Absent ⇒ the default room behavior.
              config={groupConfigSchema.parse(draftConfig.groupConfig ?? DEFAULT_GROUP_CONFIG)}
              save={(next): Promise<void> => {
                setDraftGroupConfig(draftKey, next);
                return Promise.resolve();
              }}
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
 *  `InjectionsList`, writing back via `setDraftInjections` (add = append, save = replace-in-place, delete =
 *  filter-out). No server round-trip; the first send carries the whole array into `chat.startChat`.
 *
 *  ROW IDENTITY: a draft injection has no server id, so each row is keyed by a STABLE client-side key held
 *  in a WeakMap over the injection OBJECT (the store preserves the untouched items' object identity across
 *  add/save/delete). Keying by array INDEX instead would, on a delete, shift a survivor onto the deleted
 *  row's autosave form instance (the row's `entityId` = its key) and hand it a stale un-flushed draft. */
function DraftInjectionsTab({ draftKey, injections }: DraftInjectionsTabProps): ReactElement {
  const current = injections ?? NO_INJECTIONS;
  const keysRef = useRef(new WeakMap<ChatInjectionInput, string>());
  const seqRef = useRef(0);
  const keyFor = (injection: ChatInjectionInput): string => {
    const existing = keysRef.current.get(injection);
    if (existing !== undefined) {
      return existing;
    }
    seqRef.current += 1;
    const key = `draft-injection-${seqRef.current}`;
    keysRef.current.set(injection, key);
    return key;
  };
  // keyFor lazily stamps the WeakMap during render — safe under double-render: existing objects return
  // their assigned key (idempotent), and a new object at worst takes a higher-but-still-unique seq.
  // eslint-disable-next-line react-hooks/refs -- intentional WeakMap-over-object-identity keying (see the ROW IDENTITY note).
  const rows = current.map((value) => ({ key: keyFor(value), value }));

  return (
    <InjectionsList
      rows={rows}
      isHost={true}
      // A FRESH object per add (spread) so two added rows never share one WeakMap key.
      onAdd={(): void => setDraftInjections(draftKey, [...current, { ...NEW_DRAFT_INJECTION }])}
      onSave={(key, values: InjectionFormValues): Promise<unknown> => {
        const next = current.map((inj) => (keyFor(inj) === key ? fromInjectionForm(values) : inj));
        setDraftInjections(draftKey, next);
        return Promise.resolve();
      }}
      onDelete={(key): void =>
        setDraftInjections(
          draftKey,
          current.filter((inj) => keyFor(inj) !== key),
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
