// One COMPACT dense row of the Settings → Connections → Model roles list (W10 Panel 1 — owner ruling: a
// scannable list of rows, NOT a card-per-slot form; space-efficiency is a hard requirement so the future
// per-agent list reuses this SAME row pattern). Layout (dense @2xl): a SHARED COLUMN RHYTHM so every row's
// cells line up on the same left edges (the owner ruling — ragged content-sized cells read as mush): a
// FIXED label track (`--width-sidebar-sm`) · a FIXED source track (`SOURCE_COL`) · a FLEXIBLE model cell
// (`flex-1 min-w-0`, so it truncates rather than pushing the tail) · an auto-sized tail (status dot + Clear)
// pinned right. All heterogeneous rows (agent mirror · chat's Protocol sub-row · the embed advisory · the
// source-polymorphic model cell) sit in this SAME rhythm by reusing the same track widths. Below @2xl the
// row stacks into a clean labeled vertical group (@container axis 1, never viewport). The chat slot
// additionally carries the protocol `api` knob on a second line.
//
// The MODEL cell is dispatched by the LIVE source (CONNECTIONS-BUILD-SPEC §1 table):
//   • openrouter / max-pro-sub / custom_openai → the ModelPicker (Popover + Command, searchable)
//   • vllm / local-light                       → a STATIC read-only display of the facade `defaultModelId`
//   • unset ("")                               → the resolver-default GHOST (never a picker)
// Flipping the source CLEARS the model (`<role>.model` → "") so no stale `claude-*` id rides a flip to vllm.
//
// Binds the LIVE autosave form (the appearance-reading-section precedent — the form instance is a prop,
// minus `reset`). Owner-gating: `max-pro-sub` is D17 owner-only, so a non-owner sees the option DISABLED
// with an "(owner only)" suffix (visible, never hidden). The `agent` row is a read-only LIVE MIRROR of Chat.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { UserCredentialId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/AlertTriangle fine (the tag-settings-surface.tsx precedent).
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { AppFormInstance } from "#forms";
import { useFetchModels } from "../hooks/use-connections-mutations";
import { useRoleSourceModels } from "../hooks/use-role-source-models";
import type { RoleSlot, RoutingForm } from "../lib/connections-model";
import { CHAT_API_LABELS, chatApisForSource, SOURCE_LABELS } from "../lib/connections-model";
import { ModelPicker } from "./model-picker";
import { RoleStatusDot } from "./role-status-dot";
import { StaticModelDisplay } from "./static-model-display";

/** The autosave form instance as the surface hands it down (minus `reset`, per the factory). */
type ConnectionsForm = Omit<AppFormInstance<RoutingForm>, "reset">;

/** An editable role — a key of the flat form (excludes the read-only `agent`, which has no form entry). */
type EditableRole = keyof RoutingForm;

// The empty option prepended to every picker ("no preference" — falls through to the resolver default).
const NO_PREFERENCE = "";

// The SHARED dense-row column tracks (@2xl and up) — every row reuses these so the source cell, the model
// cell, and the tail line up on identical left edges down all 7 rows (FIX 1). `w-full` below @2xl (stacked).
// Label track is `--width-sidebar-sm` (SlotLabel owns it); these are the source + model-cell tracks.
const SOURCE_COL = "w-full shrink-0 @2xl:w-40";
const MODEL_COL = "min-w-0 flex-1";

export interface RoleSlotRowProps {
  readonly slot: RoleSlot;
  readonly form: ConnectionsForm;
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

/** One role's compact row — an editable (source · model) pair, or the agent's read-only live mirror. */
export function RoleSlotRow({
  slot,
  form,
  isOwner,
  customCredentialId,
  onScrollToKeys,
}: RoleSlotRowProps): ReactElement {
  if (slot.readOnly) {
    return <AgentMirrorRow slot={slot} form={form} />;
  }
  // The role narrows to an editable key here (the read-only branch returned above), so the `name` paths are
  // valid `RoutingForm` field paths.
  const role = slot.role as EditableRole;
  const sourceItems: SelectItems<string> = [
    { label: "Default", value: NO_PREFERENCE },
    ...slot.sources.map((source) => ({
      label:
        source === "max-pro-sub" && !isOwner
          ? `${SOURCE_LABELS[source]} (owner only)`
          : SOURCE_LABELS[source],
      value: source,
      // max-pro-sub is D17 owner-only — DISABLED (not hidden) for a non-owner (§1.3).
      ...(source === "max-pro-sub" && !isOwner ? { disabled: true } : {}),
    })),
  ];

  return (
    <Stack gap="field" data-slot="role-slot-row">
      {/* @container orientation switch (surface root is the @container consumer): below @2xl (672px) the
          heterogeneous controls stack into a clean labeled vertical group; at/above @2xl they snap to the
          compact dense horizontal row (space-efficiency is the owner-ruled hard requirement). Container
          query, not viewport. */}
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
                field.handleChange(value as string);
                // Source change CLEARS the model (§1.1) — no stale id riding a flip to a new source.
                form.setFieldValue(`${role}.model`, NO_PREFERENCE);
              }}
            />
          )}
        </form.AppField>

        {/* The source-polymorphic model cell + status dot — reads the LIVE source field. The model track
            grows (flex-1 min-w-0) so it truncates rather than pushing the tail off its shared right edge. */}
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

              {/* A per-row clear — the tail, pinned right (shrink-0 so it never gets squeezed by the model
                  cell). Sets both source + model back to unset (the "Default" resolution). */}
              {source === NO_PREFERENCE ? null : (
                <Button
                  intent="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={(): void => {
                    form.setFieldValue(`${role}.source`, NO_PREFERENCE);
                    form.setFieldValue(`${role}.model`, NO_PREFERENCE);
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
    </Stack>
  );
}

/** The model cell — dispatched by the live source. Owns the per-(source, role) facade read (shared with the
 *  status dot) and, for custom_openai, the on-open `/models` probe. A REAL component (not a render-prop
 *  body) so the facade hook stays at the top level (useHookAtTopLevel). */
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
  // The custom-endpoint /models probe RESULT (the mutation returns it; `createEntityMutation` doesn't expose
  // `.data`, so hold it in row state — best-effort `[]` on failure keeps free-text usable). Fired on open.
  const [customModels, setCustomModels] = useState<readonly string[]>([]);

  // Unset source → the resolver-default GHOST (never a picker; the facade isn't queried for "").
  if (source === NO_PREFERENCE) {
    return (
      <Text as="span" size="body" tone="muted" className="min-w-0 flex-1 truncate italic">
        Uses the app default
      </Text>
    );
  }

  const defaultModelId = result?.defaultModelId ?? null;

  // vllm / local-light → STATIC read-only display of the facade's derived default (persist NOTHING — the
  // resolver derives it live from env/builtin; §2.3 auto-fill contract). A non-empty legacy hand-typed value
  // shows with a "clears to server config" hint; Clear releases it.
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

  // openrouter / max-pro-sub / custom → the searchable picker.
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
        {result !== undefined ? (
          <RoleStatusDot state={result.state} source={source} onScrollToKeys={onScrollToKeys} />
        ) : null}
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

/** The agent row's read-only LIVE MIRROR of Chat — the resolver reads `rd.chat` for the agent role, so the
 *  mirror is honest (§1.4). Ghosts chat's effective source + model with a "follows Chat ↑" chip. */
function AgentMirrorRow({
  slot,
  form,
}: {
  readonly slot: RoleSlot;
  readonly form: ConnectionsForm;
}): ReactElement {
  return (
    <Row
      gap="field"
      className="flex-col items-stretch @2xl:flex-row @2xl:items-center"
      data-slot="role-slot-row"
    >
      <SlotLabel slot={slot} />
      {/* The "follows Chat" chip sits in the shared SOURCE track; the ghost model in the MODEL track — so
          this read-only mirror lines up on the same column edges as the editable rows (FIX 1). */}
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

/** The stale-stored-id amber advisory: a non-empty stored model that is NOT in the source's catalog (and the
 *  source has a catalog + no free-text) heals to the facade `defaultModelId` at turn time (§1.6). Returns the
 *  advisory string, or `null` when the id is present / the source allows free text / there's no catalog. */
function staleIdWarning(
  value: string,
  result:
    | { readonly models: readonly { readonly id: string }[]; readonly allowsFreeText: boolean }
    | undefined,
): string | null {
  if (value === "" || result === undefined || result.allowsFreeText || result.models.length === 0) {
    return null;
  }
  const present = result.models.some((entry) => entry.id === value);
  return present
    ? null
    : `“${value}” isn't in the catalog — it falls back to the default at run time.`;
}

/** The chat slot's extra inline knob: the protocol `api` picker, FILTERED by the live chat source (the
 *  `assertCoherent` mirror — an illegal (api, source) pair hard-throws at turn time, §1.2). A second row
 *  under the chat slot so the primary (source · model) line stays scannable. */
function ChatSlotKnobs({ form }: { readonly form: ConnectionsForm }): ReactElement {
  return (
    <Row
      gap="field"
      className="flex-col items-stretch @2xl:flex-row @2xl:items-center @2xl:ps-(--width-sidebar-sm)"
    >
      <Text as="span" size="micro" tone="muted">
        Protocol
      </Text>
      <form.Subscribe selector={(state): string => state.values.chat.source}>
        {(source): ReactElement => {
          const apiItems: SelectItems<string> = [
            { label: "Auto", value: NO_PREFERENCE },
            ...chatApisForSource(source).map((api: ChatApi) => ({
              label: CHAT_API_LABELS[api],
              value: api,
            })),
          ];
          return (
            <form.AppField name="chat.api">
              {(field): ReactElement => {
                // An illegal STORED api (left from a source flip) isn't offered → render Auto selected.
                const legal = apiItems.some((item) => item.value === field.state.value);
                return (
                  <Select
                    aria-label="Chat protocol"
                    className="w-auto min-w-32"
                    items={apiItems}
                    value={legal ? field.state.value : NO_PREFERENCE}
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
