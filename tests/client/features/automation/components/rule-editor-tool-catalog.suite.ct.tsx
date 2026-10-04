import { automationActionSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";
const tool = {
  name: "fixture.lookup",
  description: "Look up a record",
  parameters: { type: "object", properties: { count: { type: "integer", description: "Records to inspect" } }, required: ["count"] },
};

test("catalog failure, recovery and disappearance preserve the selected tool; Test checks rendered arguments without executing", async ({ mount, page }) => {
  const catalog: { fails: boolean; listed: boolean } = { fails: true, listed: true };
  let row: TrpcWireOutput<"automation.listRules">[number] = {
    id: ruleId,
    chatId,
    name: "Tool rule",
    description: null,
    enabled: false,
    position: 0,
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: null,
    actions: [
      automationActionSchema.parse({
        type: "run_tool",
        name: tool.name,
        argsTemplate: '{"count":{{getvar::count}}}',
        resultVar: "captured",
        resultScope: "chat",
      }),
    ],
    actionsCorrupt: false,
    autoDisabled: false,
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
  };
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => [row],
    "automation.listRulePresets": [],
    "automation.listRuleTools": () => {
      if (catalog.fails) {
        return trpcError({ message: "Catalog failed" });
      }
      return catalog.listed ? [tool] : [];
    },
    "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
    "automation.testRule": { predicate: true, arms: [{ type: "run_tool", renderedPreview: '{"count":"not an integer"}' }] },
    "automation.listFires": [],
    "automation.listChatActivity": [],
    "automation.updateRule": (input) => {
      const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
      row = { ...row, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null };
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Tool rule" }).first().click();
  await page.getByRole("button", { name: "Edit Tool rule", exact: true }).click();
  await expect(page.getByText("Couldn't load your tool catalog. Existing selections are kept.", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Result variable name", exact: true })).toHaveValue("captured");
  catalog.fails = false;
  await page.getByRole("button", { name: "Retry tools", exact: true }).click();
  await expect(page.getByText("count — required, integer. Records to inspect", { exact: true })).toBeVisible();
  await expect(page.getByText(/This template contains macros/u)).toBeVisible();
  await page.getByRole("button", { name: "Test Tool rule", exact: true }).click();
  await expect(page.getByRole("status", { name: "Test result for Tool rule", exact: true })).toContainText("→ at count");
  await expect(page.getByRole("status", { name: "Test result for Tool rule", exact: true })).toContainText("No tool was invoked or result captured.");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the completed dry-run status is rendered and no Run now action was requested; this negative checks the settled Test command. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.runRuleNow")).toBe(0);
  catalog.listed = false;
  await page.getByRole("button", { name: "Refresh tools", exact: true }).click();
  await expect(page.getByText("fixture.lookup (not listed for you)", { exact: true })).toBeVisible();
  await expect(page.getByText("You have no available automation tools. Activate a plugin with a tool you have permitted.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Retained tool selection");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual(row.actions);
});
