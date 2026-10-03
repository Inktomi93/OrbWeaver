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

for (const newerInvalidEdit of [false, true]) {
  test(`recovered A with failed B update retains B across reopen (${newerInvalidEdit ? "newer invalid edit" : "settled retry"})`, async ({ mount, page }) => {
    const rows: TrpcWireOutput<"automation.listRules">[number][] = [];
    const scenario: { failUpdate: boolean } = { failUpdate: true };
    const heldRetry = trpcHold();
    const recorder = await routeTrpc(page, {
      "automation.listRules": () => rows,
      "automation.listRulePresets": [],
      "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
      "automation.createRule": (input) => {
        const existing = rows[0];
        if (existing !== undefined) {
          return existing;
        }
        const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
        rows.push({
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
        });
        return trpcError({ message: "Create response lost" });
      },
      "automation.updateRule": (input) => {
        if (scenario.failUpdate) {
          return trpcError({ message: "Recovered update refused" });
        }
        const existing = rows[0];
        if (existing === undefined) {
          throw new Error("No recovered row");
        }
        const { ruleId: _id, ...body } = automationRuleUpdateSchema.parse(input);
        const updated: TrpcWireOutput<"automation.updateRule"> = {
          ...existing,
          ...body,
          description: body.description ?? null,
          predicateCel: body.predicateCel ?? null,
        };
        rows[0] = updated;
        return newerInvalidEdit ? heldRetry : updated;
      },
    });
    await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
    await page.getByRole("button", { name: "Custom rule", exact: true }).click();
    const name = page.getByRole("textbox", { name: "Rule name", exact: true });
    await name.fill("Committed A");
    await page.getByRole("button", { name: "Add action", exact: true }).click();
    await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("beats");
    await expect(page.getByRole("alert").filter({ hasText: "Create response lost" })).toBeVisible();
    await name.fill("Intended B");
    await expect(page.getByRole("alert").filter({ hasText: "Recovered update refused" })).toBeVisible();
    await expect(name).toHaveValue("Intended B");
    await page.getByRole("button", { name: "Close editor", exact: true }).click();
    await expect.poll(() => recorder.count("automation.updateRule")).toBe(2);
    await page.getByRole("button", { name: /^Resume /u }).click();
    await expect(name).toHaveValue("Intended B");
    await expect(page.getByText("Restored draft — not saved", { exact: true })).toBeVisible();
    scenario.failUpdate = false;
    await page.getByRole("button", { name: "Resume saving", exact: true }).click();
    if (newerInvalidEdit) {
      await heldRetry.requested;
      await name.fill("");
      heldRetry.release(rows[0]);
    }
    await expect(page.getByText(newerInvalidEdit ? "Not saved" : "Saved", { exact: true })).toBeVisible();
    await expect(name).toHaveValue(newerInvalidEdit ? "" : "Intended B");
    if (newerInvalidEdit) {
      await page.getByRole("button", { name: "Close editor", exact: true }).click();
      await page.getByRole("button", { name: /^Resume /u }).click();
    }
    await expect(name).toHaveValue(newerInvalidEdit ? "" : "Intended B");
    await expect.poll(() => recorder.count("automation.createRule")).toBe(2);
    await expect.poll(() => recorder.inputs("automation.updateRule").map((input) => automationRuleUpdateSchema.parse(input).ruleId)).not.toContain(undefined);
    expect(rows[0]?.name).toBe("Intended B");
  });
}
