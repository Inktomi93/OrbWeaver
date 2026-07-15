// The draft chat's CONTEXT-panel tab bodies — the twins of the committed tabs for a chat with no server
// row yet. A draft is fully editable pre-send, so each tab writes the draft-config store; the first send
// carries the whole config into chat.startChat. Each body re-reads `useDraftConfig(draftKey)` in-body
// (a `ContextTabDef.body` is not a hook context, so the read lives here, not in the section definition).

import type { ChatInjectionInput, RoomOverrides } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  groupConfigSchema,
  TALKATIVENESS_DEFAULT,
} from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useTRPC } from "#data";
import type { DraftConfig } from "#state";
import {
  setDraftGroupConfig,
  setDraftInjections,
  setDraftRoomOverrides,
  setDraftRosterOverride,
  useDraftConfig,
} from "#state";
import { GROUP_CONFIG_ENTITY_PREFIX } from "../hooks/use-group-config-form";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import { fromInjectionForm } from "../hooks/use-injection-row-form";
import type { MemberCastRow } from "../lib/member-rows";
import { ROOM_OVERRIDES_ENTITY_PREFIX } from "../lib/room-overrides-form-model";
import { GroupConfigForm } from "./group-config-form";
import { InjectionsList } from "./injections-manager";
import { MembersPanel } from "./members-panel";
import { RoomOverridesForm } from "./room-overrides-form";

const EMPTY_ROOM_OVERRIDES: RoomOverrides = {};
const NO_INJECTIONS: readonly ChatInjectionInput[] = [];
const NEW_DRAFT_INJECTION: ChatInjectionInput = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
};

export interface DraftTabBodyProps {
  readonly draftKey: string;
}

export function DraftOverridesTabBody({ draftKey }: DraftTabBodyProps): ReactElement {
  const cfg = useDraftConfig(draftKey);
  return (
    <RoomOverridesForm
      entityId={`${ROOM_OVERRIDES_ENTITY_PREFIX}draft:${draftKey}`}
      roomOverrides={cfg.roomOverrides ?? EMPTY_ROOM_OVERRIDES}
      isHost={true}
      save={(overrides): Promise<void> => {
        setDraftRoomOverrides(draftKey, overrides);
        return Promise.resolve();
      }}
    />
  );
}

export function DraftGroupConfigTabBody({ draftKey }: DraftTabBodyProps): ReactElement {
  const cfg = useDraftConfig(draftKey);
  return (
    <GroupConfigForm
      entityId={`${GROUP_CONFIG_ENTITY_PREFIX}draft:${draftKey}`}
      config={groupConfigSchema.parse(cfg.groupConfig ?? DEFAULT_GROUP_CONFIG)}
      save={(next): Promise<void> => {
        setDraftGroupConfig(draftKey, next);
        return Promise.resolve();
      }}
    />
  );
}

export interface DraftMembersTabBodyProps {
  readonly draftKey: string;
  readonly cast: readonly CharacterId[];
}

export function DraftMembersTabBody({ draftKey, cast }: DraftMembersTabBodyProps): ReactElement {
  const cfg = useDraftConfig(draftKey);
  return (
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
      <DraftMembersRoster
        draftKey={draftKey}
        characterIds={cast}
        rosterOverrides={cfg.rosterOverrides}
      />
    </QueryBoundary>
  );
}

interface DraftMembersRosterProps {
  readonly draftKey: string;
  readonly characterIds: readonly CharacterId[];
  readonly rosterOverrides: DraftConfig["rosterOverrides"];
}

function DraftMembersRoster({
  draftKey,
  characterIds,
  rosterOverrides,
}: DraftMembersRosterProps): ReactElement {
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

// A draft injection has no server id, so each row is keyed by a stable client-side key held in a
// WeakMap over the injection object. Keying by array index would, on a delete, shift a survivor onto
// the deleted row's autosave form instance and hand it a stale un-flushed draft.
export function DraftInjectionsTab({ draftKey }: DraftTabBodyProps): ReactElement {
  const cfg = useDraftConfig(draftKey);
  const current = cfg.injections ?? NO_INJECTIONS;
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
