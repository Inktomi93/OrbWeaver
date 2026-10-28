import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { THEME_FONT_ALLOWLIST } from "@orb/contracts/theme";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { actionGroupGeometry, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { createShellAmbientReads, holdServed, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CARD_NAME = "The northern observatory archivist with a long working name";
const SNAPSHOT_LABEL = "Before the observatory expedition";
const NO_SNAPSHOTS = "No snapshots yet. Take one to capture this character's current state.";
const FONT = THEME_FONT_ALLOWLIST[0];
const READ_PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary"] as const;
const REGIMES = [
  { name: "both docked desktop", viewport: { width: 1280, height: 720 }, coarse: false },
  { name: "coarse portrait sheet", viewport: { width: 390, height: 844 }, coarse: true },
  { name: "coarse short landscape", viewport: { width: 844, height: 390 }, coarse: true },
] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

async function prepare(
  root: Root,
  page: Page,
  corpus: CorpusPlayback,
): Promise<{
  readonly caller: Caller;
  readonly card: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly reads: ReturnType<typeof createShellAmbientReads> & TrpcRoutes<(typeof READ_PROCEDURES)[number]>;
}> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "context-recovery-archivist",
      name: CARD_NAME,
      description: "An unchanged description beside the character's own look.",
    }),
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  const reads = {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READ_PROCEDURES),
  };
  return { caller, card, reads };
}

async function selectCharacter(page: Page, name: string): Promise<void> {
  const notification = page.getByRole("region", { name: "Alerts", exact: true }).getByRole("button", { name: "Close notification", exact: true });
  if (await notification.isVisible()) {
    await notification.click();
    await notification.waitFor({ state: "hidden" });
  }
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  if ((await context.getAttribute("data-panel-mode")) === "overlay") {
    await context.getByRole("button", { name: "Close Characters details", exact: true }).click();
  }
  const back = page.getByRole("button", { name: "Back to Characters", exact: true });
  if (await back.isVisible()) {
    await back.click();
  }
  const library = page.getByRole("list", { name: "Character library", exact: true });
  const search = page.getByRole("textbox", { name: "Search characters", exact: true });
  const showList = page.getByRole("button", { name: /^Show (?:list panel|Characters(?: · .+)? list)$/u });
  if ((await page.locator('.shell-panel[data-panel-side="list"]').getAttribute("data-panel-mode")) === "collapsed") {
    await showList.click();
  }
  await expect(search).toBeVisible();
  await search.fill(name);
  await library.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("form", { name: "Edit character", exact: true }).getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
}

async function expectFailedSheetExit(page: Page, context: Locator): Promise<void> {
  await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  await context.getByRole("button", { name: "Close Characters details", exact: true }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByRole("alert", { name: "Couldn't save the character.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show details", exact: true }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "overlay");
}

async function expectRetryContained(context: Locator, retry: Locator): Promise<void> {
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  const box = await settledBox(retry);
  const geometry = await retry.evaluate((element, rect) => {
    let overflow = Math.max(0, -rect.x, -rect.y, rect.x + rect.width - innerWidth, rect.y + rect.height - innerHeight);
    let tabViewports = 0;
    for (let host = element.parentElement; host !== null; host = host.parentElement) {
      const style = getComputedStyle(host);
      const clipX = /^(?:auto|scroll|hidden|clip)$/u.test(style.overflowX);
      const clipY = /^(?:auto|scroll|hidden|clip)$/u.test(style.overflowY);
      if (host.getAttribute("data-slot") === "tabs-panel" && clipY) {
        tabViewports += 1;
      }
      const bounds = host.getBoundingClientRect();
      const left = bounds.left + host.clientLeft;
      const top = bounds.top + host.clientTop;
      const inlineOverflow = clipX ? [left - rect.x, rect.x + rect.width - left - host.clientWidth] : [];
      const blockOverflow = clipY ? [top - rect.y, rect.y + rect.height - top - host.clientHeight] : [];
      overflow = Math.max(overflow, ...inlineOverflow, ...blockOverflow);
    }
    return { overflow, tabViewports };
  }, box);
  expect(geometry.tabViewports).toBeGreaterThan(0);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect((await actionGroupGeometry(context, [retry])).inlineOverflow).toBeLessThanOrEqual(1);
}

async function openCharacterContext(page: Page, tabName: "History" | "Look"): Promise<void> {
  await selectCharacter(page, CARD_NAME);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  const tab = context.getByRole("tab", { name: tabName, exact: true });
  await tab.focus();
  await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test("History's loaded control displays a snapshot from the actual caller", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  await caller.character.snapshot({ characterId: card.id, label: SNAPSHOT_LABEL });
  await routeTrpc(page, { ...reads, ...serveCorpusProcedures(caller, ["character.listSnapshots"]) });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, "History");
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
  await expect(context.getByText(NO_SNAPSHOTS, { exact: true })).toHaveCount(0);
});

test("History resets a failed read when selecting another character and retries the original log", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  const other = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "context-recovery-cartographer",
      name: "The observatory cartographer",
      description: "The second character owns a separate snapshot log.",
    }),
  });
  const otherLabel = "The cartographer's own snapshot";
  await caller.character.snapshot({ characterId: card.id, label: SNAPSHOT_LABEL });
  await caller.character.snapshot({ characterId: other.id, label: otherLabel });
  let refuse = true;
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["character.listSnapshots"], ({ characterId }) =>
      refuse && characterId === card.id ? trpcError({ code: "BAD_REQUEST", message: "The archivist's snapshot read is unavailable." }) : undefined,
    ),
  });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, "History");
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await selectCharacter(page, other.name);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  await expect(context.getByText(otherLabel, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  await selectCharacter(page, CARD_NAME);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  const retry = context.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  refuse = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
  await expect(context.getByText(otherLabel, { exact: true })).toHaveCount(0);
  expect((await caller.character.listSnapshots({ characterId: other.id })).map((row) => row.label)).toEqual([otherLabel]);
});

test("Look isolates a failed character's draft on selection without leaking it into another character", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  const other = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "context-look-cartographer",
      name: "The look recovery cartographer",
      description: "The second character owns a separate look.",
    }),
  });
  const otherFont = THEME_FONT_ALLOWLIST[1];
  await caller.character.update({ characterId: other.id, input: { themeOverride: { font: otherFont } } });
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["character.update"], ({ characterId }) =>
      characterId === card.id ? trpcError({ code: "BAD_REQUEST", message: "The archivist's look cannot be saved." }) : undefined,
    ),
  });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, "Look");
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  const font = context.getByRole("combobox", { name: "Font", exact: true });
  const status = context.locator('[data-slot="autosave-status"]');
  await font.click();
  await page.getByRole("option", { name: FONT, exact: true }).click();
  await expect(status).toContainText("Save failed");
  await selectCharacter(page, other.name);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  await expect(font).toHaveText(otherFont);
  await expect(status).toHaveText("Saved");
  await font.click();
  await page.getByRole("option", { name: FONT, exact: true }).click();
  await expect.poll(async () => (await caller.character.get({ characterId: other.id })).themeOverride).toEqual({ font: FONT });
  await expect(status).toHaveText("Saved");
  expect((await caller.character.get({ characterId: other.id })).themeOverride).toEqual({ font: FONT });
  expect((await caller.character.get({ characterId: card.id })).themeOverride).toBeNull();
});

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    test("History does not claim an empty log while its real snapshot read is held", async ({ page, corpus, mount }, testInfo) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const { caller, card, reads } = await prepare(root, page, corpus);
      await caller.character.snapshot({ characterId: card.id, label: SNAPSHOT_LABEL });
      const pending = holdServed();
      await routeTrpc(page, { ...reads, ...serveCorpusProcedures(caller, ["character.listSnapshots"], () => pending) });
      try {
        await mount<typeof ShellAmbientStory>(STORY, {});
        await openCharacterContext(page, "History");
        await pending.requested;
        const context = page.locator('.shell-panel[data-panel-side="context"]');
        await expect(context.getByRole("tab", { name: "History", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(context.getByRole("region", { name: "History", exact: true }).locator('[aria-busy="true"]')).toBeVisible();
        await testInfo.attach("history-held-read", { body: await page.screenshot(), contentType: "image/png" });
        await expect(context.getByText(NO_SNAPSHOTS, { exact: true })).toHaveCount(0);
        pending.release();
        await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
      } finally {
        pending.release();
      }
    });

    test("History exposes a reachable Retry after read failure and restores the real log by keyboard", async ({ page, corpus, mount }, testInfo) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const { caller, card, reads } = await prepare(root, page, corpus);
      await caller.character.snapshot({ characterId: card.id, label: SNAPSHOT_LABEL });
      let refuse = true;
      const failed = Promise.withResolvers<void>();
      await routeTrpc(page, {
        ...reads,
        ...serveCorpusProcedures(caller, ["character.listSnapshots"], () => {
          if (refuse) {
            failed.resolve();
          }
          return refuse ? trpcError({ code: "BAD_REQUEST", message: "The snapshot read is unavailable in this controlled case." }) : undefined;
        }),
      });
      await mount<typeof ShellAmbientStory>(STORY, {});
      await openCharacterContext(page, "History");
      await failed.promise;
      const context = page.locator('.shell-panel[data-panel-side="context"]');
      const retry = context.getByRole("button", { name: "Retry", exact: true });
      await expect(retry).toBeVisible();
      await expectRetryContained(context, retry);
      await testInfo.attach("history-read-failure", { body: await page.screenshot(), contentType: "image/png" });
      await expect(context.getByText(NO_SNAPSHOTS, { exact: true })).toHaveCount(0);
      refuse = false;
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
      await expect(context.getByRole("button", { name: "Restore", exact: true })).toBeVisible();
      expect((await caller.character.listSnapshots({ characterId: card.id })).map((snapshot) => snapshot.label)).toEqual([SNAPSHOT_LABEL]);
    });

    test("Look retains its draft and exposes a local failed-save Retry that persists only the look", async ({ page, corpus, mount }, testInfo) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const { caller, card, reads } = await prepare(root, page, corpus);
      const before = await caller.character.get({ characterId: card.id });
      const pending = holdServed();
      let intercept = true;
      const calls = await routeTrpc(page, {
        ...reads,
        ...serveCorpusProcedures(caller, ["character.update"], () => (intercept ? pending : undefined)),
      });
      try {
        await mount<typeof ShellAmbientStory>(STORY, {});
        await openCharacterContext(page, "Look");
        const context = page.locator('.shell-panel[data-panel-side="context"]');
        const font = context.getByRole("combobox", { name: "Font", exact: true });
        const status = context.locator('[data-slot="autosave-status"]');
        await expect(font).toHaveText("Inherit");
        await font.click();
        await page.getByRole("option", { name: FONT, exact: true }).click();
        await pending.requested;
        await expect(status).toHaveText("Saving…");
        await expect(font).toHaveText(FONT);
        expect((await caller.character.get({ characterId: card.id })).themeOverride).toBeNull();
        await testInfo.attach("look-pending-save", { body: await page.screenshot(), contentType: "image/png" });
        pending.fail();
        await expect(page.getByRole("region", { name: "Alerts", exact: true }).getByText("Couldn't save the character.", { exact: true })).toBeVisible();
        await expect(font).toHaveText(FONT);
        await testInfo.attach("look-failed-save-before-retry", { body: await page.screenshot(), contentType: "image/png" });
        await expect(status).toContainText("Save failed");
        if (regime.coarse) {
          await expectFailedSheetExit(page, context);
        }
        await expect(font).toHaveText(FONT);
        await expect(status).toContainText("Save failed");
        const retry = status.getByRole("button", { name: "Retry", exact: true });
        await expectRetryContained(context, retry);
        await testInfo.attach("look-local-recovery", { body: await page.screenshot(), contentType: "image/png" });
        intercept = false;
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(status).toHaveText("Saved");
        const after = await caller.character.get({ characterId: card.id });
        expect(after.themeOverride).toEqual({ font: FONT });
        expect({ name: after.name, description: after.description, greetings: after.greetings }).toEqual({
          name: before.name,
          description: before.description,
          greetings: before.greetings,
        });
        expect(calls.inputs("character.update")).toEqual([
          { characterId: card.id, input: { themeOverride: { font: FONT } } },
          { characterId: card.id, input: { themeOverride: { font: FONT } } },
        ]);
      } finally {
        pending.release();
      }
    });
  });
}
