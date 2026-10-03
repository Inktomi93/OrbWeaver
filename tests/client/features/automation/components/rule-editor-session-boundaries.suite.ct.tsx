import { automationRuleCreateSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const firstChat = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const secondChat = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";
const settings = { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null };
const initial: TrpcWireOutput<"automation.listRules">[number] = {
  id: ruleId,
  chatId: firstChat,
  name: "Existing rule",
  description: null,
  enabled: false,
  position: 0,
  trigger: { bus: "chat", type: "messageCommitted" },
  predicateCel: null,
  actions: [{ type: "set_variable", scope: "chat", key: "original", op: "inc", value: "1" }],
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

test("warm chat switch unmounts the old editor but its in-flight teardown keeps the original target", async ({ mount, page }) => {
  const hold = trpcHold();
  let created: TrpcWireOutput<"automation.createRule"> | null = null;
  const recorder = await routeTrpc(page, {
    "automation.listRules": (input) => (input.chatId === firstChat && created !== null ? [created] : []),
    "automation.listRulePresets": [],
    "settings.getUserSettings": settings,
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      created = { ...initial, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null };
      return hold;
    },
    "automation.updateRule": (input) => {
      const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
      created = { ...initial, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null };
      return created;
    },
  });
  await mount(<RuleEditorRulesStory chatId={firstChat} secondChatId={secondChat} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("First chat A");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("first_chat_only");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("First chat B");
  await expect(page.getByText("Second chat loaded", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch chat", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("");
  if (created === null) {
    throw new Error("Creation was not received");
  }
  hold.release(created);
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule"))).toMatchObject({ ruleId, name: "First chat B" });
  await expect.poll(() => automationRuleCreateSchema.parse(recorder.lastInput("automation.createRule")).chatId).toBe(firstChat);
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("");
});

test("a clean editor adopts an authoritative refetch after its own save instead of replaying old actions", async ({ mount, page }) => {
  let row = initial;
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => [row],
    "automation.listRulePresets": [],
    "settings.getUserSettings": settings,
    "automation.updateRule": (input) => {
      const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
      row = { ...row, ...body, description: body.description ?? null, predicateCel: body.predicateCel ?? null };
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={firstChat} firstOwner={owner} secondOwner={other} />);
  await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Existing rule" }).first().click();
  await page.getByRole("button", { name: "Edit Existing rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Local saved name");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  row = { ...row, actions: [{ type: "set_variable", scope: "chat", key: "remote_change", op: "set", value: "C" }], updatedAt: 2 };
  await page.getByRole("button", { name: "Refresh rules", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Variable name", exact: true })).toHaveValue("remote_change");
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Later name only");
  await expect.poll(() => recorder.count("automation.updateRule")).toBe(2);
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).actions).toEqual(row.actions);
});

test("an acknowledged target returning not found retains its draft without creating a replacement", async ({ mount, page }) => {
  let deleted = false;
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => (deleted ? [] : [initial]),
    "automation.listRulePresets": [],
    "settings.getUserSettings": settings,
    "automation.updateRule": () => {
      deleted = true;
      return trpcError({ code: "NOT_FOUND", message: "Rule was deleted" });
    },
  });
  await mount(<RuleEditorRulesStory chatId={firstChat} firstOwner={owner} secondOwner={other} />);
  await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Existing rule" }).first().click();
  await page.getByRole("button", { name: "Edit Existing rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Retained after deletion");
  await expect(page.getByRole("alert").filter({ hasText: "saving cannot recreate a deleted rule" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveCount(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the failed acknowledged-ID update has settled into the missing-row alert; no creation command is pending. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.createRule")).toBe(0);
  await expect
    .poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")))
    .toMatchObject({ ruleId, name: "Retained after deletion" });
});
