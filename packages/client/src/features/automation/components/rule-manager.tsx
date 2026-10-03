import type { AutomationRuleCreationId, AutomationRuleId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import type { RuleCreation } from "#state";
import { activeDurableLocalUserId, beginRuleCreation, durableLocalReadyFor, forgetRuleCreation, useRuleCreations } from "#state";
import { ruleEditorDrafts } from "../lib/rule-editor-drafts.ts";
import { useReorderRules } from "../lib/rule-mutations.ts";
import { RuleDraftRow } from "./rule-draft-row.tsx";
import { RuleEditor } from "./rule-editor.tsx";
import { RulePresetPicker } from "./rule-preset-picker.tsx";
import { RuleRow } from "./rule-row.tsx";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];
interface EditingRule {
  readonly identity: AutomationRuleCreationId | AutomationRuleId;
  readonly creation: RuleCreation | null;
  readonly ruleId: AutomationRuleId | null;
}

/** One scope's complete ordering and one stable editor epoch, shared by chat and owner-global hosts. */
export function RuleManager({ chatId, rules }: { readonly chatId: ChatId | null; readonly rules: readonly Rule[] }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reorder = useReorderRules({ trpc, invalidation });
  const sessions = useRuleCreations();
  const [editing, setEditing] = useState<EditingRule | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const customButton = useRef<HTMLButtonElement | null>(null);
  const owner = activeDurableLocalUserId();
  const ready = owner !== null && durableLocalReadyFor(owner);
  const reasonId = useId();
  const scoped = sessions.filter((session) => session.chatId === chatId);
  const activeCreation =
    editing?.creation === null ? null : (scoped.find((session) => session.requestId === editing?.creation?.requestId) ?? editing?.creation ?? null);
  const currentId = activeCreation?.ruleId ?? editing?.ruleId;
  const row = rules.find((candidate) => candidate.id === currentId) ?? null;

  const openRule = (rule: Rule, trigger: HTMLButtonElement): void => {
    opener.current = trigger;
    const pending = scoped.find((session) => session.ruleId === rule.id) ?? null;
    setEditing({ identity: pending?.requestId ?? rule.id, creation: pending, ruleId: rule.id });
  };
  const close = (): void => {
    if (editing !== null && activeCreation !== null && !ruleEditorDrafts.hasDraft(editing.identity) && owner !== null) {
      forgetRuleCreation(activeCreation.requestId, owner);
    }
    setEditing(null);
    (opener.current?.isConnected === true ? opener.current : customButton.current)?.focus();
  };

  return (
    <Stack gap="section">
      <SortableList
        items={rules}
        getItemKey={(rule): string => rule.id}
        itemLabel={(rule): string => rule.name}
        handle={true}
        disabled={reorder.isPending}
        aria-label="Rule order"
        onReorder={(ids): void => reorder.mutate({ chatId, orderedIds: ids.map(String) })}
        renderItem={(rule): ReactElement | null => (
          <RuleRow chatId={chatId} rule={rule} {...(ready ? { onEdit: (trigger: HTMLButtonElement): void => openRule(rule, trigger) } : {})} />
        )}
      />
      {editing === null || owner === null ? null : (
        <RuleEditor
          key={`${owner}:${editing.identity}`}
          identity={editing.identity}
          owner={owner}
          chatId={chatId}
          creation={activeCreation}
          rule={row}
          ruleId={currentId ?? null}
          onClose={close}
        />
      )}
      {scoped
        .filter((session) => session.requestId !== editing?.identity)
        .map((session, index) =>
          owner === null ? null : (
            <RuleDraftRow
              key={session.requestId}
              creation={session}
              owner={owner}
              ordinal={index + 1}
              onResume={(trigger): void => {
                opener.current = trigger;
                setEditing({ identity: session.requestId, creation: session, ruleId: session.ruleId });
              }}
            />
          ),
        )}
      <Stack gap="field">
        <Row gap="field">
          <Button
            ref={customButton}
            intent="secondary"
            size="sm"
            disabled={!ready}
            aria-describedby={ready ? undefined : reasonId}
            onClick={(event): void => {
              if (owner === null) {
                return;
              }
              opener.current = event.currentTarget;
              const creation = beginRuleCreation(chatId, owner);
              setEditing({ identity: creation.requestId, creation, ruleId: null });
            }}
          >
            Custom rule
          </Button>
          <RulePresetPicker chatId={chatId} />
        </Row>
        {!ready ? (
          <Text id={reasonId} voice="gloss">
            Rule editing is available after your signed-in account's local drafts have loaded.
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
