import { automationActionSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { ruleActionExamples } from "../../../../support/factories/automation-rule-actions.ts";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";

async function pointerMoveFirstToLast(page: Page, list: Locator): Promise<void> {
  const source = list.locator(':scope > [data-slot="sortable-item"] > [data-slot="sortable-handle"]').first();
  const target = list.locator(':scope > [data-slot="sortable-item"]').last();
  await source.scrollIntoViewIfNeeded();
  const start = await source.boundingBox();
  if (start === null) {
    throw new Error("Missing sortable source geometry");
  }
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height * 1.5, { steps: 4 });
  await expect(list.locator(':scope > [data-slot="sortable-item"]').first()).toHaveAttribute("data-dragging", "");
  await target.scrollIntoViewIfNeeded();
  const finish = await target.boundingBox();
  if (finish === null) {
    throw new Error("Missing sortable destination geometry");
  }
  await page.mouse.move(finish.x + finish.width / 2, finish.y + finish.height * 0.9, { steps: 10 });
  await page.mouse.up();
}

test("action and quick-reply ordering preserve parallel identities with keyboard and pointer", async ({ mount, page }) => {
  const quick = automationActionSchema.parse(ruleActionExamples.surface_quick_reply);
  const variable = automationActionSchema.parse(ruleActionExamples.set_variable);
  let row: TrpcWireOutput<"automation.listRules">[number] = {
    id: ruleId,
    chatId,
    name: "Ordered rule",
    description: null,
    enabled: false,
    position: 0,
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: null,
    actions: [quick, variable],
    actionsCorrupt: false,
    rulePresetId: null,
    rulePresetKnobs: null,
    matchAutomationEvents: false,
    suggestOnRefusal: true,
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
    "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
    "automation.updateRule": (input) => {
      const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
      row = { ...row, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null };
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Ordered rule" }).first().click();
  await page.getByRole("button", { name: "Edit Ordered rule", exact: true }).click();
  const actions = page.getByRole("list", { name: "Rule actions", exact: true });
  await page.getByRole("button", { name: "Reorder Offer quick replies", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([variable, quick]);
  await pointerMoveFirstToLast(page, actions);
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(2);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([quick, variable]);
  const choices = page.getByRole("list", { name: "Quick replies", exact: true });
  await page.getByRole("button", { name: "Reorder Wait", exact: true }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.getByRole("textbox", { name: "Reply 1 label", exact: true })).toHaveValue("Go");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(3);
  await pointerMoveFirstToLast(page, choices);
  await expect(page.getByRole("textbox", { name: "Reply 1 label", exact: true })).toHaveValue("Wait");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(4);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([quick, variable]);
  await page.getByRole("button", { name: "Remove reply 2", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Reply 2 label", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Reply 1 label", exact: true })).toHaveValue("Wait");
  if (quick.type !== "surface_quick_reply") {
    throw new Error("The quick-reply fixture must contain choices.");
  }
  const remainingQuick = { ...quick, choices: quick.choices.slice(0, 1) };
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([remainingQuick, variable]);
  await page.getByRole("button", { name: "Remove action 2", exact: true }).click();
  await expect(actions.getByRole("listitem").filter({ has: page.getByRole("textbox", { name: "Variable name", exact: true }) })).toHaveCount(0);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual([remainingQuick]);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});
