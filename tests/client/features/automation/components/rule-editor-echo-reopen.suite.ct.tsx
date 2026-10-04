import { automationRuleCreateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const owner = "fixture_editor_owner";
const other = "fixture_editor_other";

test("a confirmed newborn can reopen its newer invalid draft while list confirmation is held", async ({ mount, page }) => {
  const refetch = trpcHold();
  let stored: TrpcWireOutput<"automation.createRule"> | null = null;
  const recorder = await routeTrpc(page, {
    "automation.listRules": () => (stored === null ? [] : refetch),
    "automation.listRulePresets": [],
    "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
    "automation.createRule": (input) => {
      const { creationRequestId: _request, ...body } = automationRuleCreateSchema.parse(input);
      stored = {
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
      return stored;
    },
  });
  await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner={other} />);
  await page.getByRole("button", { name: "Custom rule", exact: true }).click();
  const name = page.getByRole("textbox", { name: "Rule name", exact: true });
  await name.fill("Confirmed rule");
  await page.getByRole("button", { name: "Add action", exact: true }).click();
  await page.getByRole("textbox", { name: "Variable name", exact: true }).fill("retained_key");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await refetch.requested;
  await name.fill("");
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: /^Resume /u }).click();
  await expect(name).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Variable name", exact: true })).toHaveValue("retained_key");
  await expect.poll(() => recorder.count("automation.createRule")).toBe(1);
  refetch.release(stored === null ? [] : [stored]);
});
