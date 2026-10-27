import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { createTagSchema } from "@orb/contracts/tag";
import { resolvedLength, settledBox, touchTargetFindings } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { EditableTagChipStory } from "./_editable-tag-chip-stories.tsx";

const STORY = "tests/client/components/_editable-tag-chip-stories/EditableTagChipStory";
const NAMES = ["I", "OC"] as const;
const APPEARANCES = [
  { name: "default text", settings: appearanceSettingsSchema.parse({}) },
  { name: "maximum text", settings: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const appearance of APPEARANCES) {
  test.describe(`fine pointer, ${appearance.name}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    test("short edit chips retain natural inline density and keyboard close returns focus", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tags = await Promise.all(NAMES.map((name) => caller.tag.createTag({ input: createTagSchema.parse({ name }) })));
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage"]));
      await mount<typeof EditableTagChipStory>(STORY, { tags, appearance: appearance.settings });
      expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
      await page.getByRole("button", { name: "Before tags", exact: true }).focus();
      for (const name of NAMES) {
        const edit = page.getByRole("button", { name: `Edit tag ${name}`, exact: true });
        const box = await settledBox(edit);
        const coarseFloor = await resolvedLength(page, TOKENS["size.touch-target"].value, edit);
        await testInfo.attach(`fine-${name}`, { body: JSON.stringify(box), contentType: "application/json" });
        expect(box.width).toBeLessThan(coarseFloor);
        await page.keyboard.press("Tab");
        await expect(edit).toBeFocused();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: `Edit tag ${name}`, exact: true });
        await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
      }
    });
  });

  test.describe(`coarse portrait, ${appearance.name}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test("short edit chips deliver the native touch floor and retain keyboard and tap close focus", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tags = await Promise.all(NAMES.map((name) => caller.tag.createTag({ input: createTagSchema.parse({ name }) })));
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage"]));
      await mount<typeof EditableTagChipStory>(STORY, { tags, appearance: appearance.settings });
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await expect(page.getByRole("button", { name: "Edit tag OC", exact: true })).toBeVisible();
      const findings = await touchTargetFindings(page);
      await testInfo.attach("actual-hit-target-findings", { body: JSON.stringify(findings), contentType: "application/json" });
      expect(findings).toEqual([]);
      await page.getByRole("button", { name: "Before tags", exact: true }).focus();
      for (const name of NAMES) {
        const edit = page.getByRole("button", { name: `Edit tag ${name}`, exact: true });
        await page.keyboard.press("Tab");
        await expect(edit).toBeFocused();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: `Edit tag ${name}`, exact: true });
        await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
        await edit.tap();
        await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
        await dialog.getByRole("button", { name: "Close tag editor", exact: true }).tap();
        await expect(dialog).toBeHidden();
        await expect(edit).toBeFocused();
      }
    });
  });
}
