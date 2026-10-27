import type { ConfigGroupId } from "@orb/client/state";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { ConfigHeadingShellStory } from "./_config-heading-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_config-heading-stories/ConfigHeadingShellStory";
const SUBJECTS = [
  { group: "appearance", label: "Appearance" },
  { group: "regex", label: "Regex scripts" },
] as const satisfies readonly { readonly group: ConfigGroupId; readonly label: string }[];
const REGIMES = [
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.isMobile, hasTouch: regime.hasTouch });
    for (const subject of SUBJECTS) {
      test(`${subject.label} keeps one painted pane identity and an accessible heading`, async ({ corpus, page, mount }, testInfo) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
        await routeTrpc(page, { ...createShellAmbientReads(corpus), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
        await seedShellState(page, { activeSection: "config" });
        await mount<typeof ConfigHeadingShellStory>(STORY, { group: subject.group });
        const content = page.locator('[data-slot="config-content"]');
        const heading = content.getByRole("heading", { name: subject.label, exact: true });
        await expect(content).toBeVisible();
        await expect(heading).toHaveCount(1);
        const topbar = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
        const paintedIdentity = regime.isMobile ? topbar : heading;
        await expect(paintedIdentity).toHaveText(subject.label);
        await expect(paintedIdentity).toBeInViewport({ ratio: 1 });
        const bounds = await heading.boundingBox();
        if (bounds === null) {
          throw new Error("The accessible pane heading has no rendered box");
        }
        await testInfo.attach("config-heading-box", { body: JSON.stringify(bounds), contentType: "application/json" });
        expect(bounds.width <= 1 && bounds.height <= 1).toBe(regime.isMobile);
        const expectTasks = subject.group === "appearance" ? expectAppearanceTasks : expectRegexTasks;
        await expectTasks(content, regime.isMobile);
        await page.screenshot({ path: testInfo.outputPath(`${regime.name}-${subject.group}.png`) });
      });
    }
  });
}

async function expectAppearanceTasks(content: Locator, phone: boolean): Promise<void> {
  const themes = content.getByRole("radiogroup", { name: "Theme", exact: true });
  await expect(themes).toBeVisible();
  await expect(themes.getByRole("radio").first()).toBeVisible();
  await expect(content.getByRole("button", { name: /^Customize this look/u })).toBeVisible();
  const lead = await content.evaluate((node) => {
    const first = node.querySelector("section");
    if (first === null) {
      throw new Error("The appearance group has no first task section");
    }
    return first.getBoundingClientRect().top - node.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(node).paddingBlockStart);
  });
  await test.info().attach("first-task-leading-space", { body: JSON.stringify({ lead }), contentType: "application/json" });
  expect(Math.abs(lead) <= 1).toBe(phone);
}

async function expectRegexTasks(content: Locator, _phone: boolean): Promise<void> {
  const libraryName = await content.getByRole("heading", { level: 2 }).textContent();
  if (libraryName === null) {
    throw new Error("The script library has no heading identity");
  }
  const scripts = content.getByRole("list", { name: libraryName, exact: true });
  await expect(scripts).toBeVisible();
  await expect(scripts.getByRole("listitem").first()).toBeVisible();
  await expect(content.getByRole("textbox", { name: "Filter regex scripts", exact: true })).toBeVisible();
  await expect(content.getByText(/Find\/replace that runs on input/u)).toBeVisible();
  await expect(content.getByRole("button", { name: "New script", exact: true })).toBeVisible();
}
