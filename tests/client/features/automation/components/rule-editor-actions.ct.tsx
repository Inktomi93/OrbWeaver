import type { AutomationActionType } from "@orb/contracts/automation";
import { AUTOMATION_ACTION_TYPES, automationActionSchema, automationRuleCreateSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { ruleActionExamples } from "../../../../support/factories/automation-rule-actions.ts";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ctSnapPath } from "../../../../support/node/snap-out.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const firstOwner = "fixture_editor_owner";
const secondOwner = "fixture_editor_other";
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const CONTROL_LABELS = {
  ["set_variable"]: "Variable name",
  ["transform_draft"]: "Draft transformation template",
  ["insert_world_info_entry"]: "Entry key",
  ["surface_quick_reply"]: "Reply 1 label",
  ["post_notification"]: "Notification template",
  ["trigger_turn"]: "Turn guidance",
  ["generate_image"]: "Image prompt",
  ["set_chat_background"]: "Background guidance",
  ["run_analysis"]: "Analysis brief",
  ["run_tool"]: "Argument template (JSON)",
} satisfies Record<AutomationActionType, string>;

for (const type of AUTOMATION_ACTION_TYPES) {
  test(`${type} renders its real controls and metadata editing preserves every action value`, async ({ mount, page }) => {
    const action = automationActionSchema.parse(ruleActionExamples[type]);
    let row: TrpcWireOutput<"automation.listRules">[number] = {
      id: ruleId,
      chatId,
      name: "Existing rule",
      description: null,
      enabled: false,
      position: 0,
      trigger: { bus: "chat", type: "turnStarted" },
      predicateCel: null,
      actions: [action],
      actionsCorrupt: false,
      rulePresetId: type === "generate_image" ? "illustrateScenes" : null,
      rulePresetKnobs: null,
      matchAutomationEvents: true,
      suggestOnRefusal: true,
      cooldownSeconds: 60,
      maxFiresPerHour: 0,
      lastError: null,
      lastFiredAt: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const recorder = await routeTrpc(page, {
      "automation.listRules": () => [row],
      "automation.listRulePresets": [],
      "automation.listRuleTools": [],
      "worldInfo.listForChat": [],
      "connection.list": [],
      "connection.listBindings": [],
      "character.get": { name: "Selected character" },
      "settings.getUserSettings": { userId: firstOwner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
      "automation.updateRule": (input) => {
        const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
        row = { ...row, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null, rulePresetId: null, rulePresetKnobs: null };
        return row;
      },
    });
    await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
    await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Existing rule" }).first().click();
    await page.getByRole("button", { name: "Edit Existing rule", exact: true }).click();
    await expect(page.getByRole("textbox", { name: CONTROL_LABELS[type], exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Value template", exact: true })).toHaveCount(0);
    await expect(page.getByText("plugin.unavailable (not listed for you)", { exact: true })).toHaveCount(type === "run_tool" ? 1 : 0);
    await expect(page.getByText("Editing makes this a custom rule and removes its rule-preset lineage.", { exact: true })).toHaveCount(
      type === "generate_image" ? 1 : 0,
    );
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the form has completed its rendered mount or invalid-draft reopen without any new valid edit; no update is pending. Ends if this assertion moves before that barrier.
    expect(recorder.count("automation.updateRule")).toBe(0);
    await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Edited name");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
    await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([action]);
    await expect(page.getByText("Editing makes this a custom rule and removes its rule-preset lineage.", { exact: true })).toHaveCount(0);
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the rendered existing-row save or invalid unnamed new form has settled; neither state permits a pending creation command. Ends if this assertion moves before that barrier.
    expect(recorder.count("automation.createRule")).toBe(0);
    await page.screenshot({ path: ctSnapPath(`rule-editor-${type}`), fullPage: true });
  });
}

test("custom draft-transform controls produce canonical actions and leave enabling as separate consent", async ({ mount, page }) => {
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => rows,
    "automation.listRulePresets": [],
    "settings.getUserSettings": { userId: firstOwner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      const row: TrpcWireOutput<"automation.createRule"> = {
        ...body,
        description: body.description ?? null,
        predicateCel: body.predicateCel ?? null,
        id: ruleId,
        enabled: false,
        position: 0,
        actionsCorrupt: false,
        rulePresetId: null,
        rulePresetKnobs: null,
        suggestOnRefusal: true,
        lastError: null,
        lastFiredAt: null,
        createdAt: 1,
        updatedAt: 1,
      };
      rows.push(row);
      return row;
    },
    "automation.setRuleEnabled": () => {
      const row = rows[0];
      if (row === undefined) {
        throw new Error("No born rule");
      }
      rows[0] = { ...row, enabled: true };
      return null;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Transform draft");
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: "rewrite part of the prompt", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("combobox", { name: "Transform target", exact: true }).click();
  await page.getByRole("option", { name: "Assembled dynamic prompt", exact: true }).click();
  await page.getByRole("switch", { name: "Include events caused by automation", exact: true }).click();
  await page.getByRole("textbox", { name: "Draft transformation template", exact: true }).fill("{{draft}}\nKeep the visible instruction.");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect
    .poll(() => automationRuleCreateSchema.parse(recorder.lastInput("automation.createRule")))
    .toMatchObject({
      chatId,
      trigger: { bus: "chat", type: "turnStarted" },
      matchAutomationEvents: true,
      actions: [{ type: "transform_draft", target: "assembled_dynamic", template: "{{draft}}\nKeep the visible instruction." }],
    });
  const enabled = page.getByRole("switch", { name: "Enable Transform draft", exact: true });
  await expect(enabled).not.toBeChecked();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): creation has rendered Saved and its switch is still off; no enable command is pending before the explicit consent click. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.setRuleEnabled")).toBe(0);
  await enabled.click();
  await expect(enabled).toBeChecked();
  await expect.poll(() => recorder.count("automation.setRuleEnabled")).toBe(1);
});

test("adding an image action uses canonical defaults without creating an unfinished rule", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    "automation.listRules": [],
    "automation.listRulePresets": [],
    "settings.getUserSettings": { userId: firstOwner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: "generate an image", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Image count", exact: true })).toHaveValue(String(generateImageActionArgsSchema.parse({}).n));
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the rendered existing-row save or invalid unnamed new form has settled; neither state permits a pending creation command. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.createRule")).toBe(0);
});
