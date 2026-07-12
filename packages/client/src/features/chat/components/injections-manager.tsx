// The manual-injections manager (task #28 — the CONTEXT panel's Injections tab). Ad-hoc positional
// context a user adds to a chat (`chat_injections` rows): position (before_prompt · in_static ·
// in_prompt · in_chat) + depth (in_chat only) + role + content. NOT `createCollectionSurface` — a chat
// holds a handful of these, so it's a plain mapped list of per-row autosave forms (§13.0 — centralize
// only what repeats 3+ and changes together; this is a genuine small list).
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): the presentational `InjectionsList` is PURE — it takes `rows`
// (each `{key, value}`) + the CRUD callbacks (`onAdd`/`onSave`/`onDelete`), owning neither the read nor
// the writes. A COMMITTED chat's reader (`InjectionsManager`) reads `chat.listChatInjections` (rows keyed
// by the server id) + wires the `setChatInjection`/`deleteChatInjection` verbs; a DRAFT's reader (the draft
// panel) supplies `draftConfig.injections` (rows keyed by a stable client-side key) + wires
// `setDraftInjections`. Same
// list, same look — only the source + CRUD seam differ. There is NO enabled/disabled toggle — orbweaver's
// contract has no soft-disable; "off" = delete the row (a deliberate divergence from neo).
//
// HOST GATE: a non-host reader passes `isHost=false` — read-only list (disabled fields, no Add, no delete).

import type { ChatInjection } from "@orb/contracts/chat";
import { CHAT_INJECTION_POSITIONS } from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useDeleteChatInjection, useSetChatInjection } from "../hooks/use-context-panel-mutations";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import {
  fromInjectionForm,
  toInjectionForm,
  useInjectionRowForm,
} from "../hooks/use-injection-row-form";

/** An injection's editable fields — the source-agnostic subset both a persisted `ChatInjection` and a
 *  draft `ChatInjectionInput` project into (`id`/`order` are server-owned). */
type InjectionFields = Pick<ChatInjection, "position" | "role" | "depth" | "content">;

// ── Labelled Select options, built from the wire one-home tuples. Position labels via an exhaustive
// switch (snake_case union members can't be camelCase object keys; the switch is also §5.5-friendly —
// a new position is a tsc error at the missing case). Roles are a plain camelCase-keyed Record.
function positionLabel(position: ChatInjection["position"]): string {
  switch (position) {
    case "before_prompt":
      return "Before system prompt";
    case "in_static":
      return "In system (static)";
    case "in_prompt":
      return "In system (dynamic)";
    case "in_chat":
      return "In chat history (at depth)";
  }
}
const POSITION_ITEMS: SelectItems<string> = CHAT_INJECTION_POSITIONS.map((value) => ({
  value,
  label: positionLabel(value),
}));

/** The seed for a freshly-added injection (host "Add"). */
const NEW_INJECTION: InjectionFields = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
};

/** One row in the source-agnostic list — a stable key (committed → the server id; draft → a stable
 *  client-side key) + the editable fields. */
interface InjectionListRow {
  readonly key: string;
  readonly value: InjectionFields;
}

export interface InjectionsListProps {
  readonly rows: readonly InjectionListRow[];
  /** Host → add/edit/delete; non-host → read-only list. */
  readonly isHost: boolean;
  readonly onAdd: () => void;
  readonly onSave: (key: string, values: InjectionFormValues) => Promise<unknown>;
  readonly onDelete: (key: string) => void;
}

/** The Injections tab body (PURE) — the list of rows + (host) an Add button. */
export function InjectionsList({
  rows,
  isHost,
  onAdd,
  onSave,
  onDelete,
}: InjectionsListProps): ReactElement {
  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        {isHost
          ? "Ad-hoc context spliced into this chat's prompt. Changes save automatically."
          : "Ad-hoc context the host has added to this chat's prompt."}
      </Text>

      {rows.length === 0 ? (
        <Text tone="muted">No injections yet.</Text>
      ) : (
        <Stack gap="section">
          {rows.map((row) => (
            <InjectionRow
              key={row.key}
              row={row}
              isHost={isHost}
              onSave={onSave}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      )}

      {isHost ? (
        <Button intent="secondary" size="sm" onClick={onAdd}>
          Add injection
        </Button>
      ) : null}
    </Stack>
  );
}

interface InjectionRowProps {
  readonly row: InjectionListRow;
  readonly isHost: boolean;
  readonly onSave: (key: string, values: InjectionFormValues) => Promise<unknown>;
  readonly onDelete: (key: string) => void;
}

/** One editable injection — its own autosave form; the depth field shows only for `in_chat`. */
function InjectionRow({ row, isHost, onSave, onDelete }: InjectionRowProps): ReactElement {
  const save = (values: InjectionFormValues): Promise<unknown> => onSave(row.key, values);

  const { form, mountKey } = useInjectionRowForm({
    entityId: row.key,
    serverValues: toInjectionForm(row.value),
    // Non-host: no persist fn ⇒ read-only form (spread, not `undefined` — exactOptionalPropertyTypes).
    ...(isHost ? { save } : {}),
  });

  return (
    <Section key={mountKey}>
      <Stack gap="block">
        <Row gap="block" align="center" justify="between">
          <Text size="label" weight="medium" tone="muted">
            Injection
          </Text>
          {isHost ? (
            <Button
              intent="ghost"
              size="sm"
              aria-label="Remove injection"
              onClick={(): void => onDelete(row.key)}
            >
              Remove
            </Button>
          ) : null}
        </Row>

        <form.AppField name="position">
          {(field): ReactElement => (
            <field.SelectField label="Position" items={POSITION_ITEMS} disabled={!isHost} />
          )}
        </form.AppField>

        <form.AppField name="role">
          {(field): ReactElement => (
            <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} disabled={!isHost} />
          )}
        </form.AppField>

        <form.Subscribe selector={(state): string => state.values.position}>
          {(position): ReactElement | null =>
            position === "in_chat" ? (
              <form.AppField name="depth">
                {(field): ReactElement => (
                  <field.NumberField
                    label="Depth"
                    description="0 = at the tail (just before the new turn); higher = further back."
                    min={0}
                    max={100}
                    disabled={!isHost}
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>

        <form.AppField name="content">
          {(field): ReactElement => (
            <field.TextareaField label="Content" disabled={!isHost} rows={2} />
          )}
        </form.AppField>
      </Stack>
    </Section>
  );
}

export interface InjectionsManagerProps {
  readonly chatId: ChatId;
  /** Host → add/edit/delete; member → read-only list. */
  readonly isHost: boolean;
}

/** The COMMITTED reader (the surface's Injections tab): reads `chat.listChatInjections` (rows keyed by the
 *  server id) + wires the CRUD verbs, then renders the pure `InjectionsList`. A draft renders `InjectionsList`
 *  directly with its own `draftConfig.injections` source + `setDraftInjections` seam. */
export function InjectionsManager({ chatId, isHost }: InjectionsManagerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const addInjection = useSetChatInjection({ trpc, invalidation });
  const setInjection = useSetChatInjection({ trpc, invalidation });
  const deleteInjection = useDeleteChatInjection({ trpc, invalidation });
  const { data: injections } = useSuspenseQuery(
    trpc.chat.listChatInjections.queryOptions({ chatId }),
  );
  const rows: InjectionListRow[] = injections.map((injection) => ({
    key: injection.id,
    value: injection,
  }));

  return (
    <InjectionsList
      rows={rows}
      isHost={isHost}
      onAdd={(): void => {
        addInjection.mutate({ chatId, ...NEW_INJECTION });
      }}
      onSave={(key, values): Promise<unknown> =>
        setInjection.mutateAsync({
          chatId,
          id: castId<ChatInjectionId>(key),
          ...fromInjectionForm(values),
        })
      }
      onDelete={(key): void => {
        deleteInjection.mutate({ chatId, injectionId: castId<ChatInjectionId>(key) });
      }}
    />
  );
}
