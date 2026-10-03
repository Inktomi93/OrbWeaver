import { AUTOMATION_ACTION_TYPES, automationActionSchema, automationRuleEditableSchema } from "@orb/contracts/automation";
import { ruleEditorCommitSchema, ruleEditorDraftSchema } from "../../../../../packages/client/src/features/automation/lib/contract/rule-editor.ts";
import {
  emptyRuleEditor,
  newRuleAction,
  ruleEditable,
  ruleEditorValues,
} from "../../../../../packages/client/src/features/automation/lib/rule-editor-model.ts";
import { ruleToolArgumentGuidance } from "../../../../../packages/client/src/features/automation/lib/rule-tool-arguments.ts";
import { ruleActionExamples } from "../../../../support/factories/automation-rule-actions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test.each(AUTOMATION_ACTION_TYPES)("metadata editing preserves every %s value without leaking UI row identities", (type) => {
  const action = automationActionSchema.parse(ruleActionExamples[type]);
  const body = automationRuleEditableSchema.parse({
    name: "Original",
    description: "",
    predicateCel: null,
    trigger: { bus: "chat", type: "turnStarted" },
    actions: [action],
    matchAutomationEvents: true,
    cooldownSeconds: 0,
    maxFiresPerHour: 0,
  });
  const values = ruleEditorValues(body, "editing-session");
  const result = ruleEditable({ ...values, name: "Changed" });
  expect(result).toEqual({ ...body, name: "Changed" });
  expect(Object.keys(result)).not.toContain("actionIds");
});

test("unfinished actions survive draft validation while canonical writes remain blocked", () => {
  const draft = {
    ...emptyRuleEditor(null),
    name: "Incomplete",
    actions: [{ type: "run_tool", name: "", argsTemplate: "{ incomplete {{", resultVar: "", resultScope: "global" }],
    actionIds: ["row"],
    choiceIds: [[]],
    keywordIds: [[]],
  };
  expect(ruleEditorDraftSchema.safeParse(draft).success).toBe(true);
  expect(ruleEditorCommitSchema.safeParse(draft).success).toBe(false);
  expect(ruleEditorCommitSchema.safeParse(emptyRuleEditor(null)).success).toBe(false);
});

test("a persisted draft cannot hide actions or choices behind missing or duplicate UI identities", () => {
  const body = automationRuleEditableSchema.parse({
    name: "Choices",
    trigger: { bus: "chat", type: "messageCommitted" },
    actions: [ruleActionExamples.surface_quick_reply],
  });
  const values = ruleEditorValues(body, "identity-control");
  expect(ruleEditorDraftSchema.safeParse(values).success).toBe(true);
  expect(ruleEditorDraftSchema.safeParse({ ...values, actionIds: [] }).success).toBe(false);
  expect(ruleEditorDraftSchema.safeParse({ ...values, choiceIds: [["same", "same"]] }).success).toBe(false);
  expect(ruleEditorDraftSchema.safeParse({ ...values, choiceIds: [[]] }).success).toBe(false);
});

test("literal tool arguments, invalid JSON, schema errors and macros have different advisory outcomes", () => {
  const tool = {
    name: "plugin.lookup",
    description: "Lookup",
    parameters: { type: "object", properties: { count: { type: "integer" } }, required: ["count"] },
  };
  expect(ruleToolArgumentGuidance('{"count":2}', tool)).toBe("Literal arguments match the current tool schema.");
  expect(ruleToolArgumentGuidance('{"count":', tool)).toContain("not a valid JSON");
  expect(ruleToolArgumentGuidance('{"count":"two"}', tool)).toContain("→ at count");
  expect(ruleToolArgumentGuidance('{"count":{{getvar::count}}}', tool)).toContain("contains macros");
  expect(ruleToolArgumentGuidance("{}", undefined)).toContain("metadata is unavailable");
});

test.each(AUTOMATION_ACTION_TYPES)("Add action constructs an editable %s draft without losing canonical defaults", (type) => {
  const action = newRuleAction(type, null);
  const values = {
    ...emptyRuleEditor(null),
    actions: [action],
    actionIds: ["added-action"],
    choiceIds: [action.type === "surface_quick_reply" ? action.choices.map((_choice, index) => `choice-${index}`) : []],
    keywordIds: [action.type === "insert_world_info_entry" ? action.keys.map((_key, index) => `keyword-${index}`) : []],
  };
  expect(ruleEditorDraftSchema.parse(values).actions[0]?.type).toBe(type);
});
