import { automationRuleCreateSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const firstOwner = "fixture_editor_owner";
const secondOwner = "fixture_editor_other";
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const settings = { userId: firstOwner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null };

function createdRule(input: ReturnType<typeof automationRuleCreateSchema.parse>): TrpcWireOutput<"automation.listRules">[number] {
  const { creationRequestId: _requestId, ...body } = input;
  return {
    ...body,
    description: input.description ?? null,
    predicateCel: input.predicateCel ?? null,
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
}

test("a host opens a custom draft without creating a placeholder rule", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    "automation.listRules": [],
    "automation.listRulePresets": [],
    "automation.listRuleTools": [],
    "settings.getUserSettings": {
      userId: "rule-editor-viewer",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
      configUnreadable: null,
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await expect(page.getByText("Nothing is watching this chat yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await expect(page.getByRole("region", { name: "Rule editor", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add action", exact: true })).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the untouched or incomplete form has rendered after its mount/navigation barrier; its canonical validation never admitted a creation command. Ends if this assertion moves before that barrier.
  expect(recorder.inputs("automation.createRule")).toEqual([]);
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.getByRole("button", { name: "Custom rule", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Resume /u })).toHaveCount(0);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the untouched or incomplete form has rendered after its mount/navigation barrier; its canonical validation never admitted a creation command. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.createRule")).toBe(0);
});

test("creation completion preserves a newer invalid draft through close and reopen", async ({ mount, page }) => {
  const hold = trpcHold();
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => rows,
    "automation.listRulePresets": [],
    "settings.getUserSettings": settings,
    "automation.createRule": (input) => {
      rows.push(createdRule(automationRuleCreateSchema.parse(input)));
      return hold;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Rule name", exact: true });
  await name.fill("Confirmed A");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  await name.fill("");
  const committed = rows[0];
  if (committed === undefined) {
    throw new Error("The create request did not produce its response fixture.");
  }
  hold.release(committed);
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await expect(name).toHaveValue("");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: /^Resume /u }).click();
  await expect(name).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Variable name", exact: true })).toHaveValue("beats");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the form has completed its rendered mount or invalid-draft reopen without any new valid edit; no update is pending. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.updateRule")).toBe(0);
});

test("response-loss recovery reuses the birth key and sends a strict ordinary update for newer edits", async ({ mount, page }) => {
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => rows,
    "automation.listRulePresets": [],
    "settings.getUserSettings": settings,
    "automation.createRule": (input) => {
      const existing = rows[0];
      if (existing !== undefined) {
        return existing;
      }
      rows.push(createdRule(automationRuleCreateSchema.parse(input)));
      return trpcError({ message: "Response lost after write" });
    },
    "automation.updateRule": (input) => {
      const parsed = automationRuleUpdateSchema.parse(input);
      const existing = rows[0];
      if (existing === undefined) {
        throw new Error("PUT preceded creation acknowledgment");
      }
      const { ruleId: _id, ...body } = parsed;
      const updated: TrpcWireOutput<"automation.updateRule"> = {
        ...existing,
        ...body,
        description: body.description ?? null,
        predicateCel: body.predicateCel ?? null,
      };
      rows[0] = updated;
      return updated;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("First snapshot");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
  await expect(page.getByRole("alert").filter({ hasText: "Response lost after write" })).toBeVisible();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Latest snapshot");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.inputs("automation.createRule").map((input) => automationRuleCreateSchema.parse(input).creationRequestId)).toHaveLength(2);
  await expect
    .poll(() => new Set(recorder.inputs("automation.createRule").map((input) => automationRuleCreateSchema.parse(input).creationRequestId)).size)
    .toBe(1);
  await expect.poll(() => recorder.inputs("automation.updateRule").map((input) => automationRuleUpdateSchema.parse(input).name)).toEqual(["Latest snapshot"]);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.enabled).toBe(false);
});

test("unfinished rule prose restores only into its verified owner's namespace", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "automation.listRules": [], "automation.listRulePresets": [], "settings.getUserSettings": settings });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={firstOwner} secondOwner={secondOwner} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("First account private draft");
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await expect(page.getByText("Current account: Second", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom rule", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Resume /u })).toHaveCount(0);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("");
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Second account draft");
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await page.getByRole("button", { name: /^Resume /u }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("First account private draft");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the untouched or incomplete form has rendered after its mount/navigation barrier; its canonical validation never admitted a creation command. Ends if this assertion moves before that barrier.
  expect(recorder.count("automation.createRule")).toBe(0);
});
