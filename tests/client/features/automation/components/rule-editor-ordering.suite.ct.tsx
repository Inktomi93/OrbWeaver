import { automationActionSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
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
  const source = list.locator(':scope > [data-slot="sortable-item"] [data-slot="sortable-handle"]').first();
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

type RuleRow = TrpcWireOutput<"automation.listRules">[number];

function orderedRow(actions: RuleRow["actions"]): RuleRow {
  return {
    id: ruleId,
    chatId,
    name: "Ordered rule",
    description: null,
    enabled: false,
    position: 0,
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: null,
    actions,
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
  };
}

test("action and quick-reply ordering preserve parallel identities with keyboard and pointer", async ({ mount, page }) => {
  const quick = automationActionSchema.parse(ruleActionExamples.surface_quick_reply);
  const variable = automationActionSchema.parse(ruleActionExamples.set_variable);
  let row = orderedRow([quick, variable]);
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

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("Missing editor control geometry");
  }
  return box;
}

interface HeaderLayout {
  readonly actionGripInHeader: boolean;
  readonly replyGripInHeader: boolean;
  readonly replyStartsAtHeader: boolean;
  readonly replyReachesHeaderEnd: boolean;
  readonly replyDividers: number;
}

function sameRow(a: Box, b: Box): boolean {
  return a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Where the grips, reply fields and reply dividers land in an opened two-reply rule. */
async function headerLayout(page: Page, paneWidth: number, mount: (story: ReactElement) => Promise<unknown>): Promise<HeaderLayout> {
  await routeTrpc(page, {
    "automation.listRules": [
      orderedRow([automationActionSchema.parse(ruleActionExamples.surface_quick_reply), automationActionSchema.parse(ruleActionExamples.set_variable)]),
    ],
    "automation.listRulePresets": [],
    "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} paneWidth={paneWidth} />);
  await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Ordered rule" }).first().click();
  await page.getByRole("button", { name: "Edit Ordered rule", exact: true }).click();
  const actionGrip = await boxOf(page.getByRole("button", { name: "Reorder Offer quick replies", exact: true }));
  const removeAction = await boxOf(page.getByRole("button", { name: "Remove action 1", exact: true }));
  const replyGrip = await boxOf(page.getByRole("button", { name: "Reorder Go", exact: true }));
  const removeReply = await boxOf(page.getByRole("button", { name: "Remove reply 2", exact: true }));
  const replyLabel = await boxOf(page.getByRole("textbox", { name: "Reply 2 label", exact: true }));
  return {
    actionGripInHeader: sameRow(actionGrip, removeAction),
    replyGripInHeader: sameRow(replyGrip, removeReply),
    // No gutter column: reply fields start where the action header starts and reach its far edge.
    replyStartsAtHeader: Math.abs(replyLabel.x - actionGrip.x) <= 1,
    replyReachesHeaderEnd: replyLabel.x + replyLabel.width >= removeAction.x + removeAction.width - 1,
    replyDividers: await page.getByRole("list", { name: "Quick replies", exact: true }).getByRole("separator").count(),
  };
}

const HEADER_GRIPS: HeaderLayout = {
  actionGripInHeader: true,
  replyGripInHeader: true,
  replyStartsAtHeader: true,
  replyReachesHeaderEnd: true,
  replyDividers: 1,
};

for (const paneWidth of [307, 384]) {
  test(`grips sit in the card and reply headers in a ${paneWidth}px pane`, async ({ mount, page }) => {
    expect(await headerLayout(page, paneWidth, mount)).toEqual(HEADER_GRIPS);
  });
}

test.describe("mobile", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("grips sit in the card and reply headers on a touch phone", async ({ mount, page }) => {
    expect(await headerLayout(page, 390, mount)).toEqual(HEADER_GRIPS);
  });
});
