// The draft context panel — the twin of ChatContextPanel for a chat with no server row yet. A draft is
// fully editable pre-send, so its config tabs write to the draft-config store instead of server verbs;
// the first send carries the whole config into chat.startChat. A draft's author is always host, so
// every tab is live. No Preview tab — there's no server assembly to preview before the chat exists.

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
import { MembersPanel } from "../components/members-panel";
import { RoomOverridesForm } from "../components/room-overrides-form";
import { GROUP_CONFIG_ENTITY_PREFIX } from "../hooks/use-group-config-form";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import { fromInjectionForm } from "../hooks/use-injection-row-form";
import type { MemberCastRow } from "../lib/member-rows";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";

const EMPTY_ROOM_OVERRIDES: RoomOverrides = {};
const NO_INJECTIONS: readonly ChatInjectionInput[] = [];
const NEW_DRAFT_INJECTION: ChatInjectionInput = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
};
const GROUP_FLOOR = 2;

export interface DraftContextPanelProps {
  readonly draftKey: string;
  /** The founding seed cast; pre-send add-member widens the effective cast internally. */
  readonly characterIds: readonly CharacterId[];
}

export function DraftContextPanel({
  draftKey,
  characterIds,
}: DraftContextPanelProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const draftConfig = useDraftConfig(draftKey);
  // Deduped seed union pre-send add-member picks; drives the Members/Group tabs + gate.
  const cast = [...new Set([...characterIds, ...(draftConfig.addedCharacterIds ?? [])])];
  const showMembers = cast.length >= GROUP_FLOOR;
  const contextTab = useContextTab();
  const visibleTabs = new Set<string>(["overrides", "injections"]);
  if (showMembers) {
    visibleTabs.add("members");
    visibleTabs.add("group");
  }
  const defaultTab = showMembers ? "members" : "overrides";
  const activeTab = contextTab !== null && visibleTabs.has(contextTab) ? contextTab : defaultTab;

  const saveOverrides = (overrides: RoomOverrides): Promise<unknown> => {
    setDraftRoomOverrides(draftKey, overrides);
    return Promise.resolve();
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full outline-none">
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
          {showMembers ? <TabsTab value="members">Members</TabsTab> : null}
          {showMembers ? <TabsTab value="group">Group</TabsTab> : null}
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

        {showMembers ? (
          <TabsPanel value="members">
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
              <DraftMembersTab
                draftKey={draftKey}
                characterIds={cast}
                rosterOverrides={draftConfig.rosterOverrides}
              />
            </QueryBoundary>
          </TabsPanel>
        ) : null}

        {showMembers ? (
          <TabsPanel value="group">
            <GroupConfigForm
              entityId={`${GROUP_CONFIG_ENTITY_PREFIX}draft:${draftKey}`}
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

// A draft injection has no server id, so each row is keyed by a stable client-side key held in a
// WeakMap over the injection object. Keying by array index would, on a delete, shift a survivor onto
// the deleted row's autosave form instance and hand it a stale un-flushed draft.
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
  // eslint-disable-next-line react-hooks/refs -- intentional WeakMap-over-object-identity keying.
  const rows = current.map((value) => ({ key: keyFor(value), value }));

  return (
    <InjectionsList
      rows={rows}
      isHost={true}
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

interface DraftMembersTabProps {
  readonly draftKey: string;
  readonly characterIds: readonly CharacterId[];
  readonly rosterOverrides: DraftConfig["rosterOverrides"];
}

function DraftMembersTab({
  draftKey,
  characterIds,
  rosterOverrides,
}: DraftMembersTabProps): ReactElement {
  const trpc = useTRPC();
  const characters = useSuspenseQueries({
    queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })),
  });
  const cast: MemberCastRow[] = characters.map((c) => {
    const override = rosterOverrides?.[c.data.id];
    return {
      kind: "cast",
      key: c.data.id,
      characterId: c.data.id,
      displayName: c.data.name,
      disabled: override?.disabled ?? false,
      talkativeness: override?.talkativeness ?? TALKATIVENESS_DEFAULT,
      avatarHash: c.data.avatarHash ?? null,
      responding: false,
    };
  });

  return (
    <MembersPanel
      people={[]}
      cast={cast}
      onSetDisabled={(characterId, disabled): void =>
        setDraftRosterOverride(draftKey, characterId, { disabled })
      }
      onSetTalkativeness={(characterId, talkativeness): void =>
        setDraftRosterOverride(draftKey, characterId, { talkativeness })
      }
    />
  );
}
