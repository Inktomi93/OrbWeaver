import { automationRuleCreateSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";
const reads = {
  "automation.listRules": [],
  "automation.listRulePresets": [],
  "automation.listRuleTools": [],
  "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
};

test("a pristine rule is neutral; an edited invalid field explains and associates its error", async ({ mount, page }) => {
  await routeTrpc(page, reads);
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await expect(page.locator('[data-slot="autosave-status"]')).toHaveText("Not saved yet");
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  const name = page.getByRole("textbox", { name: "Rule name", exact: true });
  await name.fill("Temporary");
  await name.fill("");
  await name.blur();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(/Rule name is required/u);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Review fields", exact: true }).click();
  await expect(name).toBeFocused();
});

test("a notice holds transport until its field-linked cooldown error is fixed", async ({ mount, page }) => {
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    ...reads,
    "automation.listRules": () => rows,
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      if (body.cooldownSeconds < 60) {
        return trpcError({ message: "a post_notification rule requires cooldownSeconds ≥ 60", code: "BAD_REQUEST" });
      }
      const row: TrpcWireOutput<"automation.createRule"> = {
        ...body,
        description: body.description ?? null,
        predicateCel: body.predicateCel ?? null,
        id: ruleId,
        enabled: false,
        position: 0,
        actionsCorrupt: false,
        autoDisabled: false,
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
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Notice");
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: "post a notice", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Notification template", exact: true }).fill("A notice");
  const cooldown = page.getByRole("textbox", { name: "Cooldown (seconds)", exact: true });
  await cooldown.fill("1");
  await cooldown.blur();
  await expect(cooldown).toHaveAttribute("aria-invalid", "true");
  await expect(cooldown).toHaveAccessibleDescription(/Notices need a cooldown of at least 60 seconds/u);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await cooldown.fill("60");
  await cooldown.blur();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.inputs("automation.createRule").map((input) => automationRuleCreateSchema.parse(input).cooldownSeconds)).toEqual([60]);
  await expect(cooldown).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/Set the rule cooldown above/u)).toHaveCount(0);
});

test("closed drafts are named and discarding one is reversible without affecting its sibling", async ({ mount, page }) => {
  await routeTrpc(page, reads);
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  for (const name of ["Draft A", "Draft B"]) {
    await page.getByRole("button", { name: "Custom rule", exact: true }).click();
    await page.getByRole("textbox", { name: "Rule name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Close editor", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Resume Draft A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume Draft B", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Discard Draft A", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume Draft A", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume Draft B", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Resume Draft A", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue("Draft A");
});

test("fresh tool capture and analysis outputs expose their actual on-off states", async ({ mount, page }) => {
  await routeTrpc(page, reads);
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: "run a tool", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await expect(page.getByText(/The stored name and argument template are unchanged/u)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Result scope", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Capture tool result", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Result scope", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop capturing result", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Result scope", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Action to add", exact: true }).click();
  await page.getByRole("option", { name: "study the story", exact: true }).click();
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  const outputs = page.getByRole("group", { name: "Outputs", exact: true });
  await expect(outputs.getByRole("switch")).toHaveCount(5);
  const score = outputs.getByRole("switch", { name: "Score variable", exact: true });
  await expect(score).not.toBeChecked();
  await score.click();
  await expect(score).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Score variable name", exact: true })).toBeVisible();
});

test("a structured condition refusal marks its field and cannot offer an unchanged retry", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    ...reads,
    "automation.createRule": () =>
      trpcError({ code: "BAD_REQUEST", reason: "automation_rule_bad_cel", message: "predicate does not parse: internal CEL token" }),
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Condition refusal");
  await page.getByRole("button", { name: "Add condition", exact: true }).click();
  const condition = page.getByRole("textbox", { name: "Condition (CEL)", exact: true });
  await condition.fill("event.");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
  await expect(condition).toHaveAttribute("aria-invalid", "true");
  await expect(condition).toHaveAccessibleDescription(/Check the CEL expression/u);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await expect(page.getByText(/internal CEL token/u)).toHaveCount(0);
  await expect(page.locator('[data-slot="autosave-status"]')).toContainText("Save failed");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  await condition.fill("true");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(2);
});

test("discard waits for an in-flight birth and Undo retains its ambiguous request identity", async ({ mount, page }) => {
  const hold = trpcHold();
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const scenario: { lost: boolean } = { lost: true };
  const recorder = await routeTrpc(page, {
    ...reads,
    "automation.listRules": () => rows,
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      if (rows.length === 0) {
        rows.push({
          ...body,
          description: body.description ?? null,
          predicateCel: body.predicateCel ?? null,
          id: ruleId,
          enabled: false,
          position: 0,
          actionsCorrupt: false,
          autoDisabled: false,
          rulePresetId: null,
          rulePresetKnobs: null,
          suggestOnRefusal: true,
          lastError: null,
          lastFiredAt: null,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      if (scenario.lost) {
        return hold;
      }
      const row = rows[0];
      if (row === undefined) {
        throw new Error("The committed birth is missing.");
      }
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Ambiguous birth");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
  await hold.requested;
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  const discard = page.getByRole("button", { name: "Discard Ambiguous birth", exact: true });
  await expect(discard).toBeDisabled();
  hold.release(trpcError({ message: "Response lost after commit" }));
  await expect.poll(() => recorder.count("automation.createRule")).toBe(2);
  await expect(discard).toBeEnabled();
  await discard.click();
  await expect(page.getByRole("button", { name: "Resume Ambiguous birth", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  scenario.lost = false;
  await page.getByRole("button", { name: "Resume Ambiguous birth", exact: true }).click();
  await page.getByRole("button", { name: "Resume saving", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect
    .poll(() => new Set(recorder.inputs("automation.createRule").map((input) => automationRuleCreateSchema.parse(input).creationRequestId)).size)
    .toBe(1);
  expect(rows).toHaveLength(1);
});

test("draft Undo cannot write into a later account", async ({ mount, page }) => {
  await routeTrpc(page, reads);
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  await page.getByRole("textbox", { name: "Rule name", exact: true }).fill("Private draft");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Discard Private draft", exact: true }).click();
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await expect(page.getByText("Current account: Second", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom rule", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("This draft cannot replace newer work or a different account's drafts.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume Private draft", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch account", exact: true }).click();
  await expect(page.getByText("Current account: First", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom rule", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Resume Private draft", exact: true })).toHaveCount(0);
});

test("discarding an acknowledged draft preserves its saved row and Undo resumes with PUT", async ({ mount, page }) => {
  const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
  const recorder = await routeTrpc(page, {
    ...reads,
    "automation.listRules": () => rows,
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
        autoDisabled: false,
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
    "automation.updateRule": (input) => {
      const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
      const previous = rows[0];
      if (previous === undefined) {
        throw new Error("Update requires the acknowledged row.");
      }
      const row: TrpcWireOutput<"automation.updateRule"> = {
        ...previous,
        ...body,
        description: body.description ?? null,
        predicateCel: body.predicateCel ?? null,
      };
      rows[0] = row;
      return row;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Rule name", exact: true });
  await name.fill("Saved rule");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await name.fill("");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Discard Untitled rule 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume Untitled rule 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Enable Saved rule", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Resume Untitled rule 1", exact: true }).click();
  await expect(name).toHaveValue("");
  await name.fill("Resumed rule");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  await expect
    .poll(() =>
      recorder.inputs("automation.updateRule").map((input) => {
        const body = automationRuleUpdateSchema.parse(input);
        return { ruleId: body.ruleId, name: body.name };
      }),
    )
    .toEqual([{ ruleId, name: "Resumed rule" }]);
});
