// One compact dense row of the Settings → Connections → Model roles list. Every row shares fixed
// label/source column tracks + a flexible model cell + a pinned tail, so heterogeneous rows (agent
// mirror, chat's protocol sub-row, the model cell) line up on the same edges; stacks below @2xl.
//
// The model cell is dispatched by the live source: openrouter/max-pro-sub/custom_openai get the
// searchable ModelPicker; vllm/local-light get a static read-only display; unset gets a resolver-default
// ghost. Flipping the source clears the model — and, on the chat row, re-derives the protocol `api` in the
// SAME patch — so no stale id and no incoherent (api, source) pair rides a flip. `max-pro-sub` is owner-only,
// so a non-owner sees it disabled with an "(owner only)" suffix. The `agent` row is a read-only live mirror of Chat.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { AppFormInstance, AutosaveSaveState } from "#forms";
import { useFetchModels } from "../hooks/use-connections-mutations";
import { useRoleSourceModels } from "../hooks/use-role-source-models";
import type { RoleSlot, RoutingForm } from "../lib/connections-model";
import {
  CHAT_API_LABELS,
  chatApiForSourceChange,
  chatApisForSource,
  persistedRoleLabel,
  ROLE_ROW_SYNC_LABELS,
  roleRowDrifted,
  SOURCE_LABELS,
} from "../lib/connections-model";
import { ModelPicker } from "./model-picker";
import { RoleStatusDot } from "./role-status-dot";
import { StaticModelDisplay } from "./static-model-display";

/** The autosave form instance as the surface hands it down (minus `reset`, per the factory). */
type ConnectionsForm = Omit<AppFormInstance<RoutingForm>, "reset">;

/** An editable role — a key of the flat form (excludes the read-only `agent`, which has no form entry). */
type EditableRole = keyof RoutingForm;

// The empty option prepended to every picker ("no preference" — falls through to the resolver default).
const NO_PREFERENCE = "";

// Shared dense-row column tracks (@2xl+); w-full below @2xl (stacked).
const SOURCE_COL = "w-full shrink-0 @2xl:w-40";
const MODEL_COL = "min-w-0 flex-1";

export interface RoleSlotRowProps {
  readonly slot: RoleSlot;
  readonly form: ConnectionsForm;
  /** The PERSISTED routing projection — what a turn resolves right now. The row discloses its own drift
   *  from it, so a draft selection can never be mistaken for the live connection. */
  readonly persisted: RoutingForm;
  /** The session's save lifecycle — colours a drifted row's chip (pending / saving / failed). */
  readonly saveState: AutosaveSaveState;
  /** The viewer's owner status (`sessions.me` — gates the D17 `max-pro-sub` source option). */
  readonly isOwner: boolean;
  /** The active custom_openai credential id, if any (feeds the picker's on-open `/models` probe). */
  readonly customCredentialId: UserCredentialId | null;
  /** Scroll the Saved keys section into view (the red status dot's action). */
  readonly onScrollToKeys: () => void;
}

/** The slot's label column — label + optional/read-only badges + the one-line description. */
function SlotLabel({ slot }: { readonly slot: RoleSlot }): ReactElement {
  return (
    <Stack className="w-(--width-sidebar-sm) shrink-0">
      <Row gap="field" align="center">
        <Text as="span" size="body" weight="medium">
          {slot.label}
        </Text>
        {slot.optional ? (
          <Text as="span" size="micro" tone="muted">
            optional
          </Text>
        ) : null}
      </Row>
      <Text as="span" size="micro" tone="muted">
        {slot.description}
      </Text>
    </Stack>
  );
}

/** What a DRIFTED row says, by the session's save phase — the one dispatch over `AutosaveSaveState` (a new
 *  member is a `tsc` error here). Keys derive from the label map, so the states have exactly one home. */
const DRAFT_STATE_BY_SAVE_STATE: Record<AutosaveSaveState, keyof typeof ROLE_ROW_SYNC_LABELS> = {
  saved: "pending",
  saving: "saving",
  error: "failed",
};

/** The per-row LIVE-vs-DRAFT disclosure. Renders NOTHING while the row matches the persisted selection —
 *  the row IS the truth then, and a chip on every row would be noise. The instant it drifts it says so, and
 *  names what a turn still resolves, so an unsaved edit can never be read as the live connection (the
 *  2026-08-01 phantom). Not `role="alert"`: a draft is a status, not an error — the failed arm rides the
 *  pane's `AutosaveStatus` retry. */
function RowSyncDisclosure({
  form,
  persisted,
  role,
  saveState,
}: {
  readonly form: ConnectionsForm;
  readonly persisted: RoutingForm;
  readonly role: EditableRole;
  readonly saveState: AutosaveSaveState;
}): ReactElement {
  return (
    <form.Subscribe selector={(state): boolean => roleRowDrifted(state.values, persisted, role)}>
      {(drifted): ReactElement | null => {
        if (!drifted) {
          return null; // the row IS the persisted truth — nothing to disclose
        }
        const state = DRAFT_STATE_BY_SAVE_STATE[saveState];
        return (
          <Row gap="field" align="center" role="status" className="@2xl:ps-(--width-sidebar-sm)" data-slot="role-row-sync">
            <Badge intent={state === "failed" ? "danger" : "warning"} size="sm">
              {ROLE_ROW_SYNC_LABELS[state]}
            </Badge>
            <Text size="micro" tone="muted">
              Not applied yet — a turn still uses {persistedRoleLabel(persisted, role)}.
            </Text>
          </Row>
        );
      }}
    </form.Subscribe>
  );
}

/** One role's compact row — an editable (source · model) pair, or the agent's read-only live mirror. */
export function RoleSlotRow({ slot, form, persisted, saveState, isOwner, customCredentialId, onScrollToKeys }: RoleSlotRowProps): ReactElement {
  if (slot.readOnly) {
    return <AgentMirrorRow slot={slot} form={form} />;
  }
  const role = slot.role as EditableRole;
  const sourceItems: SelectItems<string> = [
    { label: "Default", value: NO_PREFERENCE },
    ...slot.sources.map((source) => ({
      label: source === "max-pro-sub" && !isOwner ? `${SOURCE_LABELS[source]} (owner only)` : SOURCE_LABELS[source],
      value: source,
      ...(source === "max-pro-sub" && !isOwner ? { disabled: true } : {}),
    })),
  ];

  return (
    <Stack gap="field" data-slot="role-slot-row">
      {/* below @2xl the heterogeneous controls stack; @2xl+ they snap to the compact dense row (container query, not viewport). */}
      <Row gap="field" className="flex-col items-stretch @2xl:flex-row @2xl:items-center">
        <SlotLabel slot={slot} />

        <form.AppField name={`${role}.source`}>
          {(field): ReactElement => (
            <Select
              aria-label={`${slot.label} provider`}
              className={SOURCE_COL}
              items={sourceItems}
              value={field.state.value}
              onValueChange={(value): void => {
                const next = value as string;
                field.handleChange(next);
                form.setFieldValue(`${role}.model`, NO_PREFERENCE);
                if (role === "chat") {
                  // The protocol rides the SAME patch as the source: (api, source) is one selection that the
                  // server's `assertCoherent` rejects when mismatched, so a source flip that left `api`
                  // behind persisted an untakeable turn (`{api:"agent-sdk", source:"vllm"}`).
                  form.setFieldValue("chat.api", chatApiForSourceChange(form.state.values.chat.api, next));
                }
              }}
            />
          )}
        </form.AppField>

        <form.Subscribe selector={(state): string => state.values[role].source}>
          {(source): ReactElement => (
            <Row gap="field" align="center" className={MODEL_COL}>
              <form.AppField name={`${role}.model`}>
                {(field): ReactElement => (
                  <ModelCell
                    slot={slot}
                    role={role}
                    source={source}
                    customCredentialId={customCredentialId}
                    value={field.state.value}
                    onValueChange={(id): void => field.handleChange(id)}
                    onScrollToKeys={onScrollToKeys}
                  />
                )}
              </form.AppField>

              {source === NO_PREFERENCE ? null : (
                <Button
                  intent="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={(): void => {
                    form.setFieldValue(`${role}.source`, NO_PREFERENCE);
                    form.setFieldValue(`${role}.model`, NO_PREFERENCE);
                    if (role === "chat") {
                      // Clearing back to the app default clears the protocol with it — a pinned `api` over an
                      // unpinned source is paired server-side with whatever default the resolver picks.
                      form.setFieldValue("chat.api", NO_PREFERENCE);
                    }
                  }}
                >
                  Clear
                </Button>
              )}
            </Row>
          )}
        </form.Subscribe>
      </Row>

      {slot.carriesChatKnobs ? <ChatSlotKnobs form={form} /> : null}

      <RowSyncDisclosure form={form} persisted={persisted} role={role} saveState={saveState} />
    </Stack>
  );
}

/** The unset row's cell. "Uses the app default" alone names NOTHING — the owner could not tell which
 *  connection a turn would actually take from the pane that configures it. The CHAT row therefore names the
 *  real resolution: `connection.resolveChatCapability` returns the `(api, source, model)` a turn would run as
 *  (the caller's OWN resolution — the verb takes no user id), so this is the resolver's answer, not a
 *  client-side re-derivation of the fallback ladder. The other roles have no such one-hop read, so they keep
 *  the bare line rather than guess; a pending/failed resolve degrades to it too (never a fabricated name). */
function AppDefaultDisplay({ isChat }: { readonly isChat: boolean }): ReactElement {
  const trpc = useTRPC();
  // `enabled` only stops the FETCH — a disabled query still hands back a cache entry another row filled, so
  // the CHAT gate has to hold on the render too, or every role would claim the chat resolution as its own.
  const resolved = useQuery({ ...trpc.connection.resolveChatCapability.queryOptions(), enabled: isChat }).data;
  const named = !isChat || resolved === undefined ? null : `${SOURCE_LABELS[resolved.source]} · ${resolved.model} · ${CHAT_API_LABELS[resolved.api]}`;
  return (
    <Text
      as="span"
      size="body"
      tone="muted"
      className="min-w-0 flex-1 truncate italic"
      data-slot="role-app-default"
      {...(named === null ? {} : { title: named })}
    >
      {named === null ? "Uses the app default" : `Uses the app default: ${named}`}
    </Text>
  );
}

/** The model cell — dispatched by the live source. A real component (not a render-prop body) so the facade hook stays at the top level. */
function ModelCell({
  slot,
  role,
  source,
  customCredentialId,
  value,
  onValueChange,
  onScrollToKeys,
}: {
  readonly slot: RoleSlot;
  readonly role: EditableRole;
  readonly source: string;
  readonly customCredentialId: UserCredentialId | null;
  readonly value: string;
  readonly onValueChange: (id: string) => void;
  readonly onScrollToKeys: () => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { result, isLoading } = useRoleSourceModels(source, role);
  const fetchModels = useFetchModels({ trpc, invalidation });
  // Held in row state since createEntityMutation doesn't expose .data; best-effort [] on failure.
  const [customModels, setCustomModels] = useState<readonly string[]>([]);

  if (source === NO_PREFERENCE) {
    return <AppDefaultDisplay isChat={role === "chat"} />;
  }

  const defaultModelId = result?.defaultModelId ?? null;

  if (source === "vllm" || source === "local-light") {
    return (
      <StaticModelDisplay
        source={source}
        value={value}
        defaultModelId={defaultModelId}
        dimensions={result?.models[0]?.dimensions ?? undefined}
        state={result?.state}
        onScrollToKeys={onScrollToKeys}
      />
    );
  }

  const ghostLabel = defaultModelId ?? "Choose a model";
  const staleAmber = staleIdWarning(value, result);

  return (
    <Stack gap="field" className="min-w-0 flex-1">
      <Row gap="field" align="center" className="min-w-0">
        <ModelPicker
          source={source as CredentialSource}
          ariaLabel={`${slot.label} model`}
          value={value}
          onValueChange={onValueChange}
          result={result}
          isLoading={isLoading}
          ghostLabel={ghostLabel}
          {...(source === "custom_openai"
            ? {
                customModels,
                customModelsPending: fetchModels.isPending,
                onOpen: (): void => {
                  if (customCredentialId !== null) {
                    void fetchModels
                      .mutateAsync({ credentialId: customCredentialId })
                      .then(setCustomModels)
                      .catch((): void => setCustomModels([]));
                  }
                },
              }
            : {})}
        />
        {result !== undefined ? <RoleStatusDot state={result.state} source={source} onScrollToKeys={onScrollToKeys} /> : null}
      </Row>
      {staleAmber !== null ? (
        <Row gap="field" align="center" role="alert">
          <Badge intent="warning" size="sm">
            <Icon icon={AlertTriangle} size="xs" />
            not in catalog
          </Badge>
          <Text size="micro" tone="muted">
            {staleAmber}
          </Text>
        </Row>
      ) : null}
    </Stack>
  );
}

/** The agent mirror's ghost text — chat's stored model, else its source default, else the app default. */
function agentMirrorLabel(source: string, model: string): string {
  if (model !== "") {
    return model;
  }
  if (source !== "") {
    return `${SOURCE_LABELS[source as CredentialSource]} default`;
  }
  return "the app default";
}

/** The agent row's read-only live mirror of Chat — ghosts chat's effective source + model with a "follows Chat ↑" chip. */
function AgentMirrorRow({ slot, form }: { readonly slot: RoleSlot; readonly form: ConnectionsForm }): ReactElement {
  return (
    <Row gap="field" className="flex-col items-stretch @2xl:flex-row @2xl:items-center" data-slot="role-slot-row">
      <SlotLabel slot={slot} />
      <Row align="center" className={SOURCE_COL}>
        <Badge intent="neutral" size="sm">
          follows Chat ↑
        </Badge>
      </Row>
      <form.Subscribe
        selector={(state): { readonly source: string; readonly model: string } => ({
          source: state.values.chat.source,
          model: state.values.chat.model,
        })}
      >
        {(chat): ReactElement => (
          <Text as="span" size="body" tone="muted" className={`${MODEL_COL} truncate italic`}>
            {agentMirrorLabel(chat.source, chat.model)}
          </Text>
        )}
      </form.Subscribe>
    </Row>
  );
}

/** The stale-stored-id amber advisory: a non-empty stored model not in the source's catalog. `null` when the id is present / free text is allowed / there's no catalog. */
function staleIdWarning(
  value: string,
  result: { readonly models: readonly { readonly id: string }[]; readonly allowsFreeText: boolean } | undefined,
): string | null {
  if (value === "" || result === undefined || result.allowsFreeText || result.models.length === 0) {
    return null;
  }
  const present = result.models.some((entry) => entry.id === value);
  return present ? null : `“${value}” isn't in the catalog — it falls back to the default at run time.`;
}

/** The chat slot's extra inline knob: the protocol `api` picker, filtered by the live chat source.
 *
 *  The picker renders the STORED value, never a healed stand-in. It used to fall back to "Auto" whenever the
 *  value was illegal for the live source, which read as a cleared protocol while the store still held e.g.
 *  `agent-sdk` — the pane looked coherent and the turn threw `assertCoherent`. A value the source can't take
 *  (only reachable from data written before the source switch healed `api`) is offered as a MARKED option, so
 *  what the store holds is on screen and one click fixes it. */
function ChatSlotKnobs({ form }: { readonly form: ConnectionsForm }): ReactElement {
  return (
    <Row gap="field" className="flex-col items-stretch @2xl:flex-row @2xl:items-center @2xl:ps-(--width-sidebar-sm)">
      <Text as="span" size="micro" tone="muted">
        Protocol
      </Text>
      <form.Subscribe selector={(state): string => state.values.chat.source}>
        {(source): ReactElement => {
          const legalApis = chatApisForSource(source);
          return (
            <form.AppField name="chat.api">
              {(field): ReactElement => {
                const stored = field.state.value;
                const items: SelectItems<string> = [
                  { label: "Auto", value: NO_PREFERENCE },
                  ...legalApis.map((api: ChatApi) => ({ label: CHAT_API_LABELS[api], value: api })),
                  ...(stored !== NO_PREFERENCE && !legalApis.includes(stored as ChatApi)
                    ? // The cast is sound: a non-empty `api` reached the form through the settings schema's
                      // `chatApiSchema` parse, so it is a known protocol — just not one THIS source can take.
                      [{ label: `${CHAT_API_LABELS[stored as ChatApi]} — not supported by this provider`, value: stored }]
                    : []),
                ];
                return (
                  <Select
                    aria-label="Chat protocol"
                    className="w-auto min-w-32"
                    items={items}
                    value={stored}
                    onValueChange={(value): void => field.handleChange(value as string)}
                  />
                );
              }}
            </form.AppField>
          );
        }}
      </form.Subscribe>
    </Row>
  );
}
