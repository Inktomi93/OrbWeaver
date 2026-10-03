import type { AutomationRuleCreateInput, AutomationRuleEditable, AutomationRuleUpdateInput } from "@orb/contracts/automation";
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import type { AutomationRuleCreationId, AutomationRuleId, ChatId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

type Rule = inferOutput<Trpc["automation"]["listRules"]>[number];

/** Project a server row, excluding lifecycle/provenance data from ordinary authored updates. */
export function editableRule(row: Rule): AutomationRuleEditable {
  return automationRuleEditableSchema.parse({
    name: row.name,
    description: row.description,
    trigger: row.trigger,
    predicateCel: row.predicateCel,
    actions: row.actions,
    matchAutomationEvents: row.matchAutomationEvents,
    cooldownSeconds: row.cooldownSeconds,
    maxFiresPerHour: row.maxFiresPerHour,
  });
}

/** One logical editor queue retains birth identity through ambiguous failures and later deletion. */
export function createRuleSaveSession(deps: {
  readonly chatId: ChatId | null;
  readonly requestId: AutomationRuleCreationId | null;
  readonly ruleId: AutomationRuleId | null;
  readonly assertOwner: () => void;
  /** The saver's zone, read at each write: the rule's clock follows whoever saves it, so a rule saved before
   *  rules carried a zone takes one on its next edit and never by merely opening. */
  readonly timeZone: () => string;
  readonly create: (input: AutomationRuleCreateInput) => Promise<Rule>;
  readonly update: (input: AutomationRuleUpdateInput) => Promise<Rule>;
  /** `sentZone` is the zone this write carried; a row whose zone differs is the server's UTC fallback. */
  readonly acknowledge: (row: Rule, sentZone: string) => void;
}): { readonly save: (body: AutomationRuleEditable) => Promise<void>; readonly observe: (row: Rule) => void } {
  let target = deps.ruleId;
  let confirmed: string | null = null;
  let chain = Promise.resolve();
  const save = (body: AutomationRuleEditable): Promise<void> => {
    const snapshot = structuredClone(body);
    const fingerprint = stableStringify(snapshot);
    const run = chain.then(async () => {
      deps.assertOwner();
      if (target === null) {
        if (deps.requestId === null) {
          throw new Error("A new rule needs its durable creation request.");
        }
        const birthZone = deps.timeZone();
        const recovered = await deps.create({ ...snapshot, timeZone: birthZone, chatId: deps.chatId, creationRequestId: deps.requestId });
        deps.assertOwner();
        target = recovered.id;
        deps.acknowledge(recovered, birthZone);
        confirmed = stableStringify(editableRule(recovered));
      }
      if (confirmed !== fingerprint) {
        deps.assertOwner();
        const editZone = deps.timeZone();
        const updated = await deps.update({ ...snapshot, timeZone: editZone, ruleId: target });
        deps.assertOwner();
        confirmed = stableStringify(editableRule(updated));
        deps.acknowledge(updated, editZone);
      }
    });
    // @orb-waive caught-failure-ownership(run): the original rejecting promise belongs to the canonical form status; this catch only permits the queue's next retry. Ends if callers receive the recovered chain instead.
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    save,
    observe: (row: Rule): void => {
      if (row.id === target) {
        confirmed = stableStringify(editableRule(row));
      }
    },
  };
}
