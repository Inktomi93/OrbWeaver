import { AUTOMATION_RULE_NAME_MAX_CHARS, automationRuleEditableSchema } from "@orb/contracts/automation";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RuleActionGroupsStory } from "./_rule-action-groups-stories.tsx";

const STORY = "tests/client/features/automation/components/_rule-action-groups-stories/RuleActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "automation.listOwnerRules",
  "automation.listRulePresets",
  "automation.listRuleTools",
  "automation.testRule",
  "automation.listFires",
  "automation.updateRule",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("an owned rule retains Edit, free Test and menu identity without dispatching a live action", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const captured = (await caller.automation.listOwnerRules())[0];
      if (captured === undefined) {
        throw new Error("The corpus must contain an owned library rule");
      }
      const name = "Library review ".repeat(AUTOMATION_RULE_NAME_MAX_CHARS).slice(0, AUTOMATION_RULE_NAME_MAX_CHARS);
      const rule = await caller.automation.updateRule({
        ...automationRuleEditableSchema.strip().parse(captured),
        name,
        ruleId: captured.id,
        timeZone: captured.timeZone ?? UTC_TIME_ZONE,
      });
      const beforeFires = await caller.automation.listFires({ ruleId: rule.id });
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof RuleActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
      const nameText = page.getByText(name, { exact: true });
      await expect(nameText).toBeVisible();
      await expect.poll(() => nameText.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const nameBox = await nameText.boundingBox();
      const enableBox = await page.getByRole("switch", { name: `Enable ${name}`, exact: true }).boundingBox();
      if (nameBox === null || enableBox === null) {
        throw new Error("The closed rule must retain its visible identity and enable switch");
      }
      expect(nameBox.x + nameBox.width <= enableBox.x || nameBox.y + nameBox.height <= enableBox.y).toBe(true);
      const disclosure = page.getByRole("button").filter({ has: page.getByText(name, { exact: true }) });
      await disclosure.focus();
      await page.keyboard.press("Enter");
      const edit = page.getByRole("button", { name: `Edit ${name}`, exact: true });
      const dryRun = page.getByRole("button", { name: `Test ${name}`, exact: true });
      const more = page.getByRole("button", { name: `More actions for ${name}`, exact: true });
      await edit.focus();
      await page.keyboard.press("Tab");
      await expect(dryRun).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(more).toBeFocused();
      const geometry = await actionGroupGeometry(dryRun.locator(".."), [edit, dryRun, more]);
      await info.attach("rule-actions-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      expect(
        (await actionGroupGeometry(page.getByRole("group", { name: "Rule action host", exact: true }), [edit, dryRun, more])).inlineOverflow,
      ).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-sm)", dryRun.locator(".."));
      for (const box of geometry.controls) {
        expect(box.height).toBeGreaterThanOrEqual(floor);
      }
      await edit.focus();
      await page.keyboard.press("Enter");
      const editor = page.getByRole("region", { name: "Rule editor", exact: true });
      await expect(editor.getByRole("textbox", { name: "Rule name", exact: true })).toHaveValue(name);
      await editor.getByRole("button", { name: "Close editor", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(editor).toBeHidden();
      await expect(edit).toBeFocused();
      expect(calls.count("automation.updateRule")).toBe(0);
      await dryRun.focus();
      await page.keyboard.press("Enter");
      const result = page.getByRole("status", { name: `Test result for ${name}`, exact: true });
      await expect(result).toContainText(/Condition would (?:NOT )?match\./u);
      expect(calls.count("automation.testRule")).toBe(1);
      const previousIds = new Set(beforeFires.map((fire) => fire.id));
      const added = (await caller.automation.listFires({ ruleId: rule.id })).filter((fire) => !previousIds.has(fire.id));
      expect(added.map((fire) => fire.outcome)).toEqual(["test_run"]);
      await more.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("menuitem", { name: "Run now", exact: true })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
      expect(calls.count("automation.runRuleNow")).toBe(0);
      expect(calls.count("automation.deleteRule")).toBe(0);
      expect((await caller.automation.listOwnerRules()).find((entry) => entry.id === rule.id)).toEqual(rule);
    });
  });
}
