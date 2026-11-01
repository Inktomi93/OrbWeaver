// A rule edit flushed by closing the editor fails after the editor has unmounted: the failure still reaches the user.
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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
  const calls = await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["automation.updateRule"], (input) => (input.name === EDITED_NAME ? trpcError() : undefined)),
  });
  await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await page
    .getByRole("button")
    .filter({ has: page.getByText(rule.name, { exact: true }) })
    .click();
  await page.getByRole("button", { name: `Edit ${rule.name}`, exact: true }).click();
  const editor = page.getByRole("region", { name: "Rule editor", exact: true });
  await editor.getByRole("textbox", { name: "Rule name", exact: true }).fill(EDITED_NAME);
  await editor.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => calls.count("automation.updateRule")).toBe(1);
  await expect(
    page.getByRole("region", { name: "Alerts", exact: true }).getByRole("alert", { name: "Couldn't save that rule. Your draft is kept.", exact: true }),
  ).toHaveCount(1);
});
