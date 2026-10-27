import { createRegexScriptSchema } from "@orb/contracts/regex";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { FilterRecoveryShellStory } from "./_filter-recovery-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_filter-recovery-stories/FilterRecoveryShellStory";
const MEMBER = "Observatory recovery witness";
const MISSING = "No matching copper expedition";
const COLLECTIONS = [
  { group: "regex", label: "Regex scripts", filter: "Filter regex scripts", create: "New script" },
  { group: "worldInfo", label: "World Info", filter: "Filter world info", create: "New book" },
] as const;
const PROCEDURES = [...SECTION_PROCEDURES, "worldInfo.listBooksWithUsage", "regex.listGlobal", "regex.createScript", "automation.listRulePresets"] as const;

for (const regime of [
  { name: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch, isMobile: regime.touch });
    const press = (control: Locator): Promise<void> => (regime.touch ? control.tap() : control.click());

    for (const collection of COLLECTIONS) {
      test(`${collection.label} clears a no-match filter in the shared host without creating a member`, async ({ page, mount, corpus }) => {
        await using root = await createCorpusHarness(undefined, { startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        if (collection.group === "regex") {
          await caller.regex.createScript({
            input: createRegexScriptSchema.parse({ name: MEMBER, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
          });
        } else {
          await caller.worldInfo.createBook({ input: { name: MEMBER } });
        }
        const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
        await seedShellState(page, { activeSection: "config", panelOverrides: { config: { list: "collapsed", context: "collapsed" } } });
        await mount<typeof FilterRecoveryShellStory>(STORY, { group: collection.group });
        const content = page.locator('[data-slot="config-content"]');
        const filter = content.getByRole("textbox", { name: collection.filter, exact: true });
        const member = content.getByRole("button", { name: MEMBER, exact: true });
        await expect(member).toBeVisible();
        await filter.fill("Observatory");
        await expect(member).toBeVisible();
        await filter.fill(MISSING);
        await expect(member).toHaveCount(0);
        const clear = content.getByRole("button", { name: "Clear filter", exact: true });
        await expect(clear).toBeVisible();
        await press(clear);
        await expect(filter).toHaveValue("");
        await expect(filter).toBeFocused();
        await expect(member).toBeVisible();
        await expect(content.getByRole("button", { name: collection.create, exact: true })).toBeVisible();
        expect(calls.count("regex.createScript")).toBe(0);
        await page.screenshot({ path: test.info().outputPath(`${collection.group}-filter-recovery.png`) });
      });
    }

    test("a genuinely empty script collection keeps its real create door rather than clear-query recovery", async ({ page, mount, corpus }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      for (const script of await caller.regex.listScripts()) {
        await caller.regex.removeScript({ scriptId: script.id });
      }
      expect(await caller.regex.listScripts()).toEqual([]);
      const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
      await seedShellState(page, { activeSection: "config", panelOverrides: { config: { list: "collapsed", context: "collapsed" } } });
      await mount<typeof FilterRecoveryShellStory>(STORY, { group: "regex" });
      const content = page.locator('[data-slot="config-content"]');
      await expect(content.getByText("No regex scripts yet", { exact: true })).toBeVisible();
      await press(content.getByRole("button", { name: "New script", exact: true }));
      const form = content.getByRole("form", { name: "New script", exact: true });
      const name = form.getByRole("textbox", { name: "Script name", exact: true });
      await expect(name).toBeFocused();
      await expect(form.locator('button[type="submit"]')).toBeDisabled();
      await press(form.getByRole("button", { name: "Cancel", exact: true }));
      await expect(form).toHaveCount(0);
      await expect(content.getByRole("button", { name: "Clear filter", exact: true })).toHaveCount(0);
      expect(calls.count("regex.createScript")).toBe(0);
    });

    test("Refinery no-match recovery clears search and restores the existing owner sessions", async ({ page, mount, corpus }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const character = await caller.character.create({
        input: { handle: "filter-recovery-witness", name: MEMBER, description: "A keeper of copper observatory records." },
      });
      const session = await caller.refinery.startSession({ characterId: character.id, name: MEMBER });
      const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
      await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "docked", context: "collapsed" } } });
      await mount<typeof FilterRecoveryShellStory>(STORY, {});
      const list = page.locator('aside[data-panel-side="list"]');
      const search = list.getByRole("textbox", { name: "Search sessions by character or name", exact: true });
      await expect(list.getByRole("button", { name: character.name, exact: true })).toBeVisible();
      await search.fill(MISSING);
      await expect(list.getByText("No sessions match that search.", { exact: true })).toBeVisible();
      const clear = list.getByRole("button", { name: "Clear search", exact: true });
      await expect(clear).toBeVisible();
      await press(clear);
      await expect(search).toHaveValue("");
      await expect(list.getByRole("button", { name: character.name, exact: true })).toBeVisible();
      expect(await list.evaluate((node) => node.contains(document.activeElement) && document.activeElement !== document.body)).toBe(true);
      expect(calls.count("refinery.startSession")).toBe(0);
      expect((await caller.refinery.getSession({ sessionId: session.id })).name).toBe(MEMBER);
      await page.screenshot({ path: test.info().outputPath("refinery-search-recovery.png") });
    });

    test("a genuinely empty Refinery keeps the existing desktop picker or phone start door", async ({ page, mount, corpus }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      for (const session of await caller.refinery.listSessions()) {
        await caller.refinery.deleteSession({ sessionId: session.id });
      }
      expect(await caller.refinery.listSessions()).toEqual([]);
      const calls = await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
      await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "docked", context: "collapsed" } } });
      await mount<typeof FilterRecoveryShellStory>(STORY, {});
      const list = page.locator('aside[data-panel-side="list"]');
      await expect(list.getByText("No refinery sessions yet", { exact: true })).toBeVisible();
      await press(list.getByRole("button", { name: "Pick a character", exact: true }));
      const picker = page.getByRole("combobox", { name: "Start a refinery session", exact: true });
      await expect(picker).toHaveCount(1);
      await expect(picker).toBeFocused();
      await expect(list.getByRole("button", { name: "Clear search", exact: true })).toHaveCount(0);
      expect(calls.count("refinery.startSession")).toBe(0);
      expect(await caller.refinery.listSessions()).toEqual([]);
    });
  });
}
