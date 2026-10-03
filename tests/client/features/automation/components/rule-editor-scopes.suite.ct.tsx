import { automationRuleCreateSchema, automationRuleReorderSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ctSnapPath } from "../../../../support/node/snap-out.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";
const firstId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const secondId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const settings = { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null };

for (const scope of [chatId, null]) {
  test(`keyboard ordering sends the entire ${scope === null ? "owner-global" : "chat"} scope without caller identity`, async ({ mount, page }) => {
    let rows: TrpcWireOutput<"automation.listRules"> = [firstId, secondId].map((id, index) => ({
      id,
      chatId: scope,
      name: index === 0 ? "First rule" : "Second rule",
      description: null,
      enabled: false,
      position: index,
      trigger: { bus: "domain", type: "character.updated" },
      predicateCel: null,
      actions: [{ type: "set_variable", scope: "global", key: "seen", op: "inc", value: "1" }],
      actionsCorrupt: false,
      rulePresetId: null,
      rulePresetKnobs: null,
      matchAutomationEvents: false,
      suggestOnRefusal: true,
      timeZone: UTC_TIME_ZONE,
      cooldownSeconds: 0,
      maxFiresPerHour: 30,
      lastError: null,
      lastFiredAt: null,
      createdAt: 1,
      updatedAt: 1,
    }));
    const recorder = await routeTrpc(page, {
      "automation.listRules": () => rows,
      "automation.listOwnerRules": () => rows,
      "automation.listRulePresets": [],
      "automation.getOwnerBudgets": { maxFiresPerHour: 30 },
      "sessions.me": { userId: owner, handle: "fixture_viewer", globalRole: "owner" },
      "settings.getUserSettings": settings,
      "automation.reorderRules": (input) => {
        const parsed = automationRuleReorderSchema.parse(input);
        rows = parsed.orderedIds.flatMap((id) => rows.find((row) => row.id === id) ?? []);
        return null;
      },
    });
    await mount(<RuleEditorRulesStory chatId={scope} firstOwner={owner} secondOwner={other} />);
    await page.getByRole("button", { name: "Reorder First rule", exact: true }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect.poll(() => recorder.count("automation.reorderRules")).toBe(1);
    await expect.poll(() => recorder.lastInput("automation.reorderRules")).toEqual({ chatId: scope, orderedIds: [secondId, firstId] });
    await expect(page.getByRole("list", { name: "Rule order", exact: true }).locator('[data-slot="sortable-item"]').first()).toContainText("Second rule");
  });
}

test("owner-global creation offers only independent actions and carries explicit global tool capture scope", async ({ mount, page }) => {
  const rows: TrpcWireOutput<"automation.listOwnerRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    "automation.listOwnerRules": () => rows,
    "automation.listRulePresets": [],
    "automation.getOwnerBudgets": { maxFiresPerHour: 30 },
    "sessions.me": { userId: owner, handle: "fixture_viewer", globalRole: "owner" },
    "settings.getUserSettings": settings,
    "automation.listRuleTools": [{ name: "fixture.lookup", description: "Look up a saved record", parameters: { type: "object", properties: {} } }],
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      const row: TrpcWireOutput<"automation.createRule"> = {
        ...body,
        description: body.description ?? null,
        predicateCel: body.predicateCel ?? null,
        id: firstId,
        enabled: false,
        position: 0,
        actionsCorrupt: false,
        rulePresetId: null,
        rulePresetKnobs: null,
        suggestOnRefusal: true,
        timeZone: UTC_TIME_ZONE,
        lastError: null,
        lastFiredAt: null,
        createdAt: 1,
        updatedAt: 1,
      };
      rows.push(row);
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={null} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Global lookup");
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await expect(page.getByRole("option", { name: "ask for a reply", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "run a tool", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("button", { name: "Capture tool result", exact: true }).click();
  await page.getByRole("textbox", { name: "Result variable name", exact: true }).fill("lookup_result");
  await page.getByRole("combobox", { name: "Tool", exact: true }).click();
  await page.getByRole("option", { name: "fixture.lookup", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect
    .poll(() => {
      const body = automationRuleCreateSchema.parse(recorder.lastInput("automation.createRule"));
      return { chatId: body.chatId, triggerBus: body.trigger.bus, actions: body.actions };
    })
    .toEqual({
      chatId: null,
      triggerBus: "domain",
      actions: [{ type: "run_tool", name: "fixture.lookup", argsTemplate: "{}", resultVar: "lookup_result", resultScope: "global" }],
    });
  await page.screenshot({ path: ctSnapPath("rule-editor-owner-global"), fullPage: true });
});
