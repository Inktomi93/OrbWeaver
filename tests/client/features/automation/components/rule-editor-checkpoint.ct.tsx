import { automationRuleEditableSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { expect, test } from "@playwright/experimental-ct-react";
import { ruleEditorValues } from "../../../../../packages/client/src/features/automation/lib/rule-editor-model.ts";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { RuleEditorRulesStory } from "../_editor-stories.tsx";

const ids = createSeededIds();
const chatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const requestId = typeIdSchema(ID_PREFIX.automationRuleCreation).parse(ids.next(ID_PREFIX.automationRuleCreation));
const owner = "fixture_checkpoint_owner";
const body = automationRuleEditableSchema.parse({
  name: "Confirmed A",
  description: null,
  predicateCel: null,
  trigger: { bus: "chat", type: "messageCommitted" },
  actions: [{ type: "set_variable", scope: "chat", key: "retained", op: "set", value: "1" }],
});
const confirmed = ruleEditorValues(body, requestId);
const draft = { ...confirmed, name: "Checkpoint B" };
const baseline = stableStringify(body);
const checkpoint = { modelVersion: 1, baseline, predecessor: null, draftJson: JSON.stringify(draft) };
const cases = [
  { label: "missing mirror recovers checkpoint", checkpoint, mirror: undefined, expected: "Checkpoint B" },
  {
    label: "newer same-lineage mirror wins",
    checkpoint,
    mirror: { values: { ...draft, name: "Newer B" }, schemaVersion: 1, baselineHash: baseline },
    expected: "Newer B",
  },
  {
    label: "different mirror lineage cannot be blessed by old checkpoint",
    checkpoint,
    mirror: { values: { ...draft, name: "Unrelated C" }, schemaVersion: 1, baselineHash: stableStringify({ ...body, name: "External C" }) },
    expected: "Confirmed A",
  },
  { label: "invalid checkpoint JSON retains target but not values", checkpoint: { ...checkpoint, draftJson: "{" }, mirror: undefined, expected: "Confirmed A" },
  { label: "stale checkpoint model retains target but not values", checkpoint: { ...checkpoint, modelVersion: 0 }, mirror: undefined, expected: "Confirmed A" },
];

for (const scenario of cases) {
  test(`durable rehydrate: ${scenario.label}`, async ({ mount, page }) => {
    let row: TrpcWireOutput<"automation.listRules">[number] = {
      ...body,
      description: null,
      predicateCel: null,
      id: ruleId,
      chatId,
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
    const recorder = await routeTrpc(page, {
      "automation.listRules": () => [row],
      "automation.listRulePresets": [],
      "settings.getUserSettings": { userId: owner, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null },
      "automation.updateRule": (input) => {
        const { ruleId: _id, ...updated } = automationRuleUpdateSchema.parse(input);
        row = { ...row, ...updated, description: updated.description ?? null, predicateCel: updated.predicateCel ?? null };
        return row;
      },
    });
    await page.addInitScript(
      (entries) => {
        for (const [key, value] of Object.entries(entries)) {
          localStorage.setItem(key, value);
        }
      },
      {
        [`orb:u/${owner}/rule-creations`]: JSON.stringify({
          version: 1,
          state: { sessions: [{ requestId, chatId, ruleId, checkpoint: scenario.checkpoint }] },
        }),
        [`orb-draft:u/${owner}/automation-rule-editor`]: JSON.stringify({
          version: 1,
          state: { drafts: scenario.mirror === undefined ? {} : { [requestId]: scenario.mirror } },
        }),
      },
    );
    await page.reload();
    await mount(<RuleEditorRulesStory chatId={chatId} firstOwner={owner} secondOwner="fixture_checkpoint_other" />);
    await page.locator('[data-slot="collapsible-trigger"]').filter({ hasText: "Confirmed A" }).first().click();
    await page.getByRole("button", { name: "Edit Confirmed A", exact: true }).click();
    const name = page.getByRole("textbox", { name: "Rule name", exact: true });
    await expect(name).toHaveValue(scenario.expected);
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the acknowledged rule is rendered from the reload fixture; completed mount or Saved PUT has no creation command pending. Ends if this assertion moves before that barrier.
    expect(recorder.count("automation.createRule")).toBe(0);
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the form has completed its rendered mount or invalid-draft reopen without any new valid edit; no update is pending. Ends if this assertion moves before that barrier.
    expect(recorder.count("automation.updateRule")).toBe(0);
    if (scenario.expected !== "Confirmed A") {
      await page.getByRole("button", { name: "Resume saving", exact: true }).click();
    } else {
      await name.fill("Explicit later edit");
    }
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect.poll(() => recorder.count("automation.updateRule")).toBe(1);
    await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule")).ruleId).toBe(ruleId);
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the acknowledged rule is rendered from the reload fixture; completed mount or Saved PUT has no creation command pending. Ends if this assertion moves before that barrier.
    expect(recorder.count("automation.createRule")).toBe(0);
  });
}
