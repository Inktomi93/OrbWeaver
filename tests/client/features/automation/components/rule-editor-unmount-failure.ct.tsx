// A rule edit flushed by closing the editor fails after the editor has unmounted: the failure still reaches the user.

import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ALERTS_REGION_NAME, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { editActionName } from "@orb/ui/lib";
import { RULE_EDITOR_CLOSE_NAME, RULE_EDITOR_NAME, RULE_NAME_FIELD_NAME, RULE_SAVE_FAILED_TOAST } from "#client/features/automation/lib/automation-names.ts";
import type { RuleActionGroupsStory } from "./_rule-action-groups-stories.tsx";

const STORY = "tests/client/features/automation/components/_rule-action-groups-stories/RuleActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "automation.listOwnerRules",
  "automation.listRulePresets",
  "automation.listRuleTools",
  "automation.listFires",
  "automation.listRules",
  "worldInfo.listForChat",
] as const;
const EDITED_NAME = "Edited before closing";

test("a rule edit flushed by Close editor that then fails is still said, by the toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const captured = (await caller.automation.listOwnerRules())[0];
  if (captured === undefined) {
    throw new Error("The corpus must contain an owned library rule");
  }
  const rule = await caller.automation.updateRule({
    ...automationRuleEditableSchema.strip().parse(captured),
    ruleId: captured.id,
    timeZone: captured.timeZone ?? UTC_TIME_ZONE,
  });
  const hold = holdServed();
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["automation.updateRule"], (input) => (input.name === EDITED_NAME ? hold : undefined)),
  });
  await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await page
    .getByRole("button")
    .filter({ has: page.getByText(rule.name, { exact: true }) })
    .click();
  await page.getByRole("button", { name: editActionName(rule.name), exact: true }).click();
  const editor = page.getByRole("region", { name: RULE_EDITOR_NAME, exact: true });
  // One browser task: the edit and the close land before the form's debounce can run, so only the teardown flush writes.
  await editor.getByRole("textbox", { name: RULE_NAME_FIELD_NAME, exact: true }).evaluate(
    (input, { name, close }) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, name);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.getAttribute("aria-label") === close || candidate.textContent === close,
      );
      if (button === undefined) {
        throw new Error(`No ${close} button`);
      }
      button.click();
    },
    { name: EDITED_NAME, close: RULE_EDITOR_CLOSE_NAME },
  );
  await expect(editor).toBeHidden();
  await hold.requested;
  expect(calls.count("automation.updateRule")).toBe(1);
  const toast = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("alert", { name: RULE_SAVE_FAILED_TOAST, exact: true });
  await expect(toast).toHaveCount(0);
  hold.fail();
  await expect(toast).toHaveCount(1);
});
