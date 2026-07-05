// The manual-injections manager (task #28 — the CONTEXT panel's Injections tab). Ad-hoc positional
// context a user adds to a chat (`chat_injections` rows): position (before_prompt · in_static ·
// in_prompt · in_chat) + depth (in_chat only) + role + content. NOT `createCollectionSurface` — a chat
// holds a handful of these, so it's a plain mapped list of per-row autosave forms (§13.0 — centralize
// only what repeats 3+ and changes together; this is a genuine small list).
//
// CRUD: the list read is `chat.listChatInjections` (member-gated — every viewer sees the list). Host-only
// writes: "Add" creates a blank row (`setChatInjection` no id ⇒ insert; the server mints the id, the
// refetch renders it as an editable row); each row autosaves via `setChatInjection` (upsert with its id);
// the row's trash button removes it (`deleteChatInjection`). There is NO enabled/disabled toggle —
// orbweaver's contract has no soft-disable; "off" = delete the row (a deliberate divergence from neo).
//
// HOST GATE: members get a read-only list (disabled fields, no Add, no delete); the host edits.

import type { ChatInjection } from "@orb/contracts/chat";
import { CHAT_INJECTION_POSITIONS } from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { useDeleteChatInjection, useSetChatInjection } from "../hooks/use-context-panel-mutations";
import type { InjectionFormValues } from "../hooks/use-injection-row-form";
import { toInjectionForm, useInjectionRowForm } from "../hooks/use-injection-row-form";
import { useInvalidation } from "../hooks/use-invalidation";

/** One persisted injection row (the `chat.listChatInjections` element — `ChatInjection` + its id). */
interface InjectionRowData extends ChatInjection {
  readonly id: ChatInjectionId;
}

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

const ROLE_LABELS: Record<MessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};
const ROLE_ITEMS: SelectItems<string> = MESSAGE_ROLES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

/** The seed for a freshly-added injection (host "Add" ⇒ create; the server mints the id). */
const NEW_INJECTION = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
} satisfies Omit<ChatInjection, "order">;

export interface InjectionsManagerProps {
  readonly chatId: ChatId;
  /** Host → add/edit/delete; member → read-only list. */
  readonly isHost: boolean;
}

/** The Injections tab body — the list of rows + (host) an Add button. */
export function InjectionsManager({ chatId, isHost }: InjectionsManagerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const addInjection = useSetChatInjection({ trpc, invalidation });
  const { data: injections } = useSuspenseQuery(
    trpc.chat.listChatInjections.queryOptions({ chatId }),
  );

  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        {isHost
          ? "Ad-hoc context spliced into this chat's prompt. Changes save automatically."
          : "Ad-hoc context the host has added to this chat's prompt."}
      </Text>

      {injections.length === 0 ? (
        <Text tone="muted">No injections yet.</Text>
      ) : (
        <Stack gap="section">
          {injections.map((injection) => (
            <InjectionRow
              key={injection.id}
              chatId={chatId}
              injection={injection}
              isHost={isHost}
            />
          ))}
        </Stack>
      )}

      {isHost ? (
        <Button
          intent="secondary"
          size="sm"
          disabled={addInjection.isPending}
          onClick={(): void => {
            addInjection.mutate({ chatId, ...NEW_INJECTION });
          }}
        >
          Add injection
        </Button>
      ) : null}
    </Stack>
  );
}

interface InjectionRowProps {
  readonly chatId: ChatId;
  readonly injection: InjectionRowData;
  readonly isHost: boolean;
}

/** One editable injection — its own autosave form; the depth field shows only for `in_chat`. */
function InjectionRow({ chatId, injection, isHost }: InjectionRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setInjection = useSetChatInjection({ trpc, invalidation });
  const deleteInjection = useDeleteChatInjection({ trpc, invalidation });

  const save = (values: InjectionFormValues): Promise<unknown> =>
    setInjection.mutateAsync({
      chatId,
      id: injection.id,
      // The SelectField is string-valued by design; the values are the wire unions by construction
      // (the items derive from CHAT_INJECTION_POSITIONS / MESSAGE_ROLES), so this is a boundary cast.
      position: values.position as ChatInjection["position"],
      role: values.role as MessageRole,
      depth: values.depth ?? 0,
      content: values.content,
    });

  const { form, mountKey } = useInjectionRowForm({
    entityId: injection.id,
    serverValues: toInjectionForm(injection),
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
              onClick={(): void => {
                deleteInjection.mutate({ chatId, injectionId: injection.id });
              }}
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
            <field.SelectField label="Role" items={ROLE_ITEMS} disabled={!isHost} />
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
