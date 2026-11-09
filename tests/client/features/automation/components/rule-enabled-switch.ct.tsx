// @subject packages/client/src/features/automation/components/rule-row.tsx
// Each rule row's enable switch keeps one stable name for the rule; `aria-checked` alone carries the state.
import { automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ruleEnabledSwitchName } from "#client/features/automation/lib/rule-copy.ts";
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
  "automation.setRuleEnabled",
] as const;

test("two rules in opposite states are found by their stable names, and a flip moves only aria-checked", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [first] = await caller.automation.listOwnerRules();
  if (first === undefined) {
    throw new Error("The corpus must contain an owned library rule");
  }
  const timeZone = first.timeZone ?? UTC_TIME_ZONE;
  const second = await caller.automation.createRule({
    ...automationRuleEditableSchema.strip().parse(first),
    name: `${first.name} copy`,
    chatId: null,
    creationRequestId: root.idSource.typeId(ID_PREFIX.automationRuleCreation),
    timeZone,
  });
  await caller.automation.setRuleEnabled({ ruleId: first.id, enabled: true });
  await caller.automation.setRuleEnabled({ ruleId: second.id, enabled: false });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const onSwitch = page.getByRole("switch", { name: ruleEnabledSwitchName(first.name), exact: true });
  const offSwitch = page.getByRole("switch", { name: ruleEnabledSwitchName(second.name), exact: true });
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
  await expect(offSwitch).toHaveAttribute("aria-checked", "false");
  await offSwitch.click();
  await expect(offSwitch).toHaveAttribute("aria-checked", "true");
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
});
