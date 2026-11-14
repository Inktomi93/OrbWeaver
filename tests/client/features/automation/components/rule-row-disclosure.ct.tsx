// @subject packages/client/src/features/automation/components/rule-row.tsx
// A rule row is a disclosure named by the rule: a press on its enable switch flips the rule and leaves the row shut, and Enter on the
// row opens the actions behind it, with the rule's own sentence as the row's description. The surface walk's disclosure walker opens a
// rule row and shuts it again.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { DisclosureWalkHooks } from "@orb/testkit/browser/spec";
import { walkDisclosures } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ruleTestName } from "#client/features/automation/lib/automation-names.ts";
import { ruleEnabledSwitchName, ruleGloss } from "#client/features/automation/lib/rule-copy.ts";
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

test("the enable switch flips the rule without opening its row, and Enter on the row opens its actions", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [rule] = await caller.automation.listOwnerRules();
  if (rule === undefined) {
    throw new Error("The corpus must contain an owned library rule");
  }
  await caller.automation.setRuleEnabled({ ruleId: rule.id, enabled: false });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const row = page.getByRole("button", { name: rule.name, exact: true });
  const enabled = page.getByRole("switch", { name: ruleEnabledSwitchName(rule.name), exact: true });
  const testAction = page.getByRole("button", { name: ruleTestName(rule.name), exact: true });
  await expect(row).toHaveAccessibleDescription(new RegExp(`^${RegExp.escape(ruleGloss(rule))}`, "u"));

  await enabled.click();
  await expect(enabled).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await caller.automation.listOwnerRules()).find(({ id }) => id === rule.id)?.enabled).toBe(true);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(testAction).toHaveCount(0);

  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(testAction).toBeVisible();
  await expect(row).toBeFocused();
});

test("the surface walk opens a rule row's disclosure and shuts it again", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof RuleActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
  const rows = page.locator('[data-slot="list-row-body"][aria-expanded]');
  // Positive control: the rule rows render as disclosures.
  await expect(rows.first()).toBeVisible();
  const first = rows.first();
  const checkpoints: string[] = [];
  const openWhileWalked: (string | null)[] = [];
  const hooks: DisclosureWalkHooks = {
    limit: 1,
    depthLimit: 1,
    completed: "visited",
    id: (path, kind, index) => `${path}/${kind}-${String(index)}`,
    expect: () => undefined,
    action: async (_id, step) => {
      await step.action();
      await step.ready();
    },
    checkpoint: (id) => {
      checkpoints.push(id);
      return Promise.resolve();
    },
    record: () => undefined,
    ready: async (body) => {
      await expect(body).toBeVisible();
    },
    opened: async () => {
      openWhileWalked.push(await first.getAttribute("aria-expanded"));
    },
    summary: (path) => ({ disclosures: `${path}/disclosures`, nestedDetails: `${path}/nested-details` }),
  };
  await walkDisclosures(page.locator("body"), "rules", hooks);
  expect(checkpoints).toEqual(["rules/disclosure-0"]);
  expect(openWhileWalked).toEqual(["true"]);
  await expect(first).toHaveAttribute("aria-expanded", "false");
});
