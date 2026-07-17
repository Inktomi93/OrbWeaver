// The manual-injections manager: ad-hoc positional context a user adds to a chat. Not
// createCollectionSurface — a chat holds a handful of these, so it's a plain mapped list of per-row
// autosave forms. Source-agnostic: the presentational InjectionsList takes rows + CRUD callbacks,
// owning neither read nor write; a committed chat wires chat.listChatInjections + the verbs, a draft
// wires draftConfig.injections + setDraftInjections. No enabled/disabled toggle — "off" = delete the row.

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
import { createAutosaveEntityBoundary } from "#forms";
import { MESSAGE_ROLE_ITEMS } from "#lib";
import { useDeleteChatInjection, useSetChatInjection } from "../hooks/use-context-panel-mutations";
import type { InjectionFormValues } from "../lib/injection-row-model";
import { DEFAULT_INJECTION_FORM, fromInjectionForm, toInjectionForm } from "../lib/injection-row-model";
import { NEW_INJECTION } from "../lib/injection-seed";

// The per-injection-row session-boundary autosave form (D78 L3). Built at MODULE scope (stable component
// identity, §13.1); the persist fn arrives per-instance (closes over the live tRPC client + the row's
// id/chatId). The boundary owns the entity key (the row's stable key), so a row surviving a list reshuffle
// carries no stale FormApi — but the list `.map` key on `<InjectionRow>` already IS that identity (safe-by-
// key by construction, autosave-form-doctrine.md §8; harmless double-key).

const InjectionRowBoundary = createAutosaveEntityBoundary<InjectionFormValues>({
  defaultValues: DEFAULT_INJECTION_FORM,
});

type InjectionFields = Pick<ChatInjection, "position" | "role" | "depth" | "content">;

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

interface InjectionListRow {
  readonly key: string;
  readonly value: InjectionFields;
}

export interface InjectionsListProps {
  readonly rows: readonly InjectionListRow[];
  readonly isHost: boolean;
  readonly onAdd: () => void;
  readonly onSave: (key: string, values: InjectionFormValues) => Promise<unknown>;
  readonly onDelete: (key: string) => void;
}

export function InjectionsList({ rows, isHost, onAdd, onSave, onDelete }: InjectionsListProps): ReactElement {
  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        {isHost ? "Ad-hoc context spliced into this chat's prompt. Changes save automatically." : "Ad-hoc context the host has added to this chat's prompt."}
      </Text>

      {rows.length === 0 ? (
        <Text tone="muted">No injections yet.</Text>
      ) : (
        <Stack gap="section">
          {rows.map((row) => (
            <InjectionRow key={row.key} row={row} isHost={isHost} onSave={onSave} onDelete={onDelete} />
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

function InjectionRow({ row, isHost, onSave, onDelete }: InjectionRowProps): ReactElement {
  const save = isHost ? (values: InjectionFormValues): Promise<unknown> => onSave(row.key, values) : undefined;

  return (
    // `save` spread, not passed as `undefined` — exactOptionalPropertyTypes; a non-host row is read-only.
    <InjectionRowBoundary entityId={row.key} serverValues={toInjectionForm(row.value)} {...(save === undefined ? {} : { save })}>
      {({ form }): ReactElement => (
        <Section>
          <Stack gap="block">
            <Row gap="block" align="center" justify="between">
              <Text size="label" weight="medium" tone="muted">
                Injection
              </Text>
              {isHost ? (
                <Button intent="ghost" size="sm" aria-label="Remove injection" onClick={(): void => onDelete(row.key)}>
                  Remove
                </Button>
              ) : null}
            </Row>

            <form.AppField name="position">
              {(field): ReactElement => <field.SelectField label="Position" items={POSITION_ITEMS} disabled={!isHost} />}
            </form.AppField>

            <form.AppField name="role">
              {(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} disabled={!isHost} />}
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

            <form.AppField name="content">{(field): ReactElement => <field.TextareaField label="Content" disabled={!isHost} rows={2} />}</form.AppField>
          </Stack>
        </Section>
      )}
    </InjectionRowBoundary>
  );
}

export interface InjectionsManagerProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

export function InjectionsManager({ chatId, isHost }: InjectionsManagerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const addInjection = useSetChatInjection({ trpc, invalidation });
  const setInjection = useSetChatInjection({ trpc, invalidation });
  const deleteInjection = useDeleteChatInjection({ trpc, invalidation });
  const { data: injections } = useSuspenseQuery(trpc.chat.listChatInjections.queryOptions({ chatId }));
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
