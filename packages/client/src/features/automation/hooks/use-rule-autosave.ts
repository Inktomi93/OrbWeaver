import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useEffect, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import type { RuleCreation } from "#state";
import { assertRuleDraftOwner } from "#state";
import type { RuleEditorValues } from "../lib/contract/rule-editor.ts";
import { acknowledgeRuleDraft } from "../lib/rule-editor-drafts.ts";
import { ruleEditable, ruleEditorValues } from "../lib/rule-editor-model.ts";
import { useCreateRule, useUpdateRule } from "../lib/rule-mutations.ts";
import { createRuleSaveSession, editableRule } from "../lib/rule-save-session.ts";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** The owning editor is keyed once; acknowledgment never changes that key. */
export function useRuleAutosave(deps: {
  readonly owner: UserId;
  readonly chatId: ChatId | null;
  readonly creation: RuleCreation | null;
  readonly ruleId: AutomationRuleId | null;
  readonly rule: Rule | null;
}): {
  readonly acknowledged: Rule | null;
  readonly failure: Error | null;
  readonly save: (values: RuleEditorValues) => Promise<void>;
} {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const create = useCreateRule({ trpc, invalidation });
  const update = useUpdateRule({ trpc, invalidation });
  const [acknowledged, setAcknowledged] = useState<Rule | null>(null);
  const [queue] = useState(() =>
    createRuleSaveSession({
      chatId: deps.chatId,
      requestId: deps.creation?.requestId ?? null,
      ruleId: deps.ruleId,
      assertOwner: () => assertRuleDraftOwner(deps.owner),
      create: (input) => create.mutateAsync({ cacheOwnerId: deps.owner, chatId: deps.chatId, input }),
      update: (input) => update.mutateAsync({ cacheOwnerId: deps.owner, chatId: deps.chatId, input }),
      acknowledge: (row) => {
        if (deps.creation !== null) {
          acknowledgeRuleDraft(deps.creation.requestId, row.id, deps.owner, ruleEditorValues(editableRule(row), deps.creation.requestId));
        }
        setAcknowledged(row);
      },
    }),
  );
  useEffect(() => {
    if (deps.rule !== null) {
      queue.observe(deps.rule);
    }
  }, [queue, deps.rule]);
  const failure = update.error ?? create.error;
  return {
    acknowledged,
    failure: failure instanceof Error ? failure : null,
    save: (values: RuleEditorValues): Promise<void> => queue.save(ruleEditable(values)),
  };
}
