import type { AutomationActionInput, AutomationRuleEditable } from "@orb/contracts/automation";
import {
  AUTOMATION_RULE_DEFAULT_MAX_FIRES_PER_HOUR,
  automationActionSchema,
  automationRuleEditableSchema,
  automationTriggerFor,
} from "@orb/contracts/automation";
import { MULTIMODAL_MODES } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { formValuesEqual } from "#forms";
import type { RuleEditorValues } from "./contract/rule-editor.ts";
import { ruleEditorDraftSchema } from "./contract/rule-editor.ts";

/** Strip local row identities before canonical validation and normalization. */
export function ruleEditable(values: RuleEditorValues): AutomationRuleEditable {
  const { actionIds: _actions, choiceIds: _choices, keywordIds: _keywords, ...body } = values;
  return automationRuleEditableSchema.parse(body);
}

/** Stable identities for a server snapshot; newly inserted rows receive their own UUID. */
export function ruleEditorValues(body: AutomationRuleEditable, identity: string): RuleEditorValues {
  return ruleEditorDraftSchema.parse({
    ...body,
    description: body.description ?? null,
    predicateCel: body.predicateCel ?? null,
    actionIds: body.actions.map((_action, index) => `${identity}:action:${index}`),
    choiceIds: body.actions.map((action, index) =>
      action.type === "surface_quick_reply" ? action.choices.map((_choice, choice) => `${identity}:${index}:choice:${choice}`) : [],
    ),
    keywordIds: body.actions.map((action, index) =>
      action.type === "insert_world_info_entry" ? action.keys.map((_key, key) => `${identity}:${index}:key:${key}`) : [],
    ),
  });
}

/** The echo of this editor's own save carries the same rows in the same order, so it keeps the rows' local
 *  identities. Re-minting them from the index would re-key every list row, and a row the user just moved
 *  would swap places with its neighbour's DOM, focus included. Any other server body takes fresh identities. */
export function keepRowIdentities(server: RuleEditorValues, submitted: RuleEditorValues | null): RuleEditorValues {
  if (submitted === null || !formValuesEqual(ruleEditable(server).actions, ruleEditable(submitted).actions)) {
    return server;
  }
  return { ...server, actionIds: submitted.actionIds, choiceIds: submitted.choiceIds, keywordIds: submitted.keywordIds };
}

/** An unopened action list is deliberately incomplete: opening a draft never creates a row. */
export function emptyRuleEditor(chatId: ChatId | null): RuleEditorValues {
  return {
    name: "",
    description: null,
    predicateCel: null,
    trigger: automationTriggerFor(chatId === null ? "character.updated" : "messageCommitted"),
    actions: [],
    actionIds: [],
    choiceIds: [],
    keywordIds: [],
    matchAutomationEvents: false,
    cooldownSeconds: 0,
    maxFiresPerHour: AUTOMATION_RULE_DEFAULT_MAX_FIRES_PER_HOUR,
  };
}

/** Canonical discriminants make adding an action a compile-time editor obligation. */
export function newRuleAction(type: AutomationActionInput["type"], chatId: ChatId | null): RuleEditorValues["actions"][number] {
  const scope = chatId === null ? "global" : "chat";
  switch (type) {
    case "set_variable":
      return { type, scope, key: "", op: "set" };
    case "transform_draft":
      return { type, target: "user_input", template: "" };
    case "insert_world_info_entry":
      return { type, bookId: "", entryKey: "", keys: [], contentTemplate: "", position: "before", confirmFirst: false };
    case "surface_quick_reply":
      return { type, choices: [] };
    case "post_notification":
      return { type, recipient: "host", messageTemplate: "" };
    case "trigger_turn":
      return { type, confirmFirst: false };
    case "generate_image":
      return automationActionSchema.parse({ type, ...(chatId === null ? { mode: MULTIMODAL_MODES[0], quiet: true } : {}) });
    case "set_chat_background":
      return { type, confirmFirst: false };
    case "run_analysis":
      return { type, brief: "", routes: {} };
    case "run_tool":
      return { type, name: "", argsTemplate: "{}", resultScope: scope };
  }
}
