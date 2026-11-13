import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { THEME_FONT_ALLOWLIST } from "@orb/contracts/theme";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { actionGroupGeometry, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import type { TrpcRoutes } from "@orb/testkit/ct";
import {
  ALERTS_REGION_NAME,
  createShellAmbientReads,
  holdServed,
  routeAuthConfig,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_SEARCH_NAME, FONT_FIELD_NAME } from "#client/components/shared-control-names.ts";
import {
  CHARACTER_ACTIONS_MENU_NAME,
  CHARACTER_EDITOR_NAME,
  CHARACTER_HERO_NAME_FIELD_NAME,
  CHARACTER_HISTORY_TAB_LABEL,
  CHARACTER_INHERIT_LABEL,
  CHARACTER_LIBRARY_NAME,
  CHARACTER_LINK_BOOK_NAME,
  CHARACTER_LINKS_TAB_LABEL,
  CHARACTER_LOOK_TAB_LABEL,
  CHARACTER_NEVER_SPOKE_TEXT,
  CHARACTER_NO_BOOKS_LINKED_TEXT,
  CHARACTER_NO_PERSONAS_CONNECTED_TEXT,
  CHARACTER_NO_SNAPSHOTS_TEXT,
  CHARACTER_OVERVIEW_TAB_LABEL,
  CHARACTER_RESET_LOOK_CONFIRM_NAME,
  CHARACTER_RESET_LOOK_NAME,
  CHARACTER_SAVE_FAILURE,
} from "#client/features/character/lib/character-names.ts";
import { AUTOSAVE_SAVE_FAILED_TEXT, AUTOSAVE_SAVED_TEXT } from "#client/forms/editor/autosave-status-names.ts";
import { sectionBackName } from "#client/lib/context-pane-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { TOAST_CLOSE_NAME } from "#ui/primitives/toast/toast-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CARD_NAME = "The northern observatory archivist with a long working name";
const SNAPSHOT_LABEL = "Before the observatory expedition";
const NO_SNAPSHOTS = CHARACTER_NO_SNAPSHOTS_TEXT;
const FONT = THEME_FONT_ALLOWLIST[0];
const CHARACTERS = SECTION_LABELS.characters;
// The context sheet closes by its section-named dismiss or by the details toggle, by pane mode.
const CLOSE_DETAILS = new RegExp(`^(?:Close ${RegExp.escape(CHARACTERS)} details|${RegExp.escape(contextToggleLabel(false))})$`, "u");
const SHOW_LIST = new RegExp(`^Show (?:list panel|${RegExp.escape(CHARACTERS)}(?: · .+)? list)$`, "u");
const READ_PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary"] as const;
const REGIMES = [
  { name: "both docked desktop", viewport: { width: 1280, height: 720 }, coarse: false, landscape: false },
  { name: "coarse portrait sheet", viewport: { width: 390, height: 844 }, coarse: true, landscape: false },
  { name: "coarse short landscape", viewport: { width: 844, height: 390 }, coarse: true, landscape: true },
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
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  const reads = {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READ_PROCEDURES),
  };
  return { caller, card, reads };
}

async function selectCharacter(page: Page, name: string): Promise<void> {
  const notification = page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("button", { name: TOAST_CLOSE_NAME, exact: true });
  if (await notification.isVisible()) {
    await notification.click();
    await notification.waitFor({ state: "hidden" });
  }
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  if ((await context.getAttribute("data-panel-mode")) === "overlay") {
    await page.getByRole("button", { name: CLOSE_DETAILS }).click();
  }
  const back = page.getByRole("button", { name: sectionBackName(CHARACTERS), exact: true });
  if (await back.isVisible()) {
    await back.click();
  }
  const library = page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true });
  const search = page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true });
  const showList = page.getByRole("button", { name: SHOW_LIST });
  if ((await page.locator('.shell-panel[data-panel-side="list"]').getAttribute("data-panel-mode")) === "collapsed") {
    await showList.click();
  }
  await expect(search).toBeVisible();
  await search.fill(name);
  await library.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true }).getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true }),
  ).toHaveValue(name);
}

async function expectFailedSheetExit(page: Page, context: Locator): Promise<void> {
  await expect(context).toHaveAttribute("data-panel-mode", "overlay");
  await page.getByRole("button", { name: CLOSE_DETAILS }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByRole("alert", { name: CHARACTER_SAVE_FAILURE, exact: true })).toBeVisible();
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "overlay");
}

/** The box that holds a tab's body and scrolls it: the tab's own panel, or in a short landscape pane the pane body, which scrolls the whole sheet as one box. */
const TAB_VIEWPORT = '[data-slot="tabs-panel"]';
const SHEET_VIEWPORT = ".shell-panel-body";

async function expectRetryContained(context: Locator, retry: Locator, landscape: boolean): Promise<void> {
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  const box = await settledBox(retry);
  const geometry = await retry.evaluate(
    (element, { rect, viewport }) => {
      let overflow = Math.max(0, -rect.x, -rect.y, rect.x + rect.width - innerWidth, rect.y + rect.height - innerHeight);
      let tabViewports = 0;
      for (let host = element.parentElement; host !== null; host = host.parentElement) {
        const style = getComputedStyle(host);
        const clipX = /^(?:auto|scroll|hidden|clip)$/u.test(style.overflowX);
        const clipY = /^(?:auto|scroll|hidden|clip)$/u.test(style.overflowY);
        if (host.matches(viewport) && clipY) {
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
    },
    { rect: box, viewport: landscape ? SHEET_VIEWPORT : TAB_VIEWPORT },
  );
  expect(geometry.tabViewports).toBeGreaterThan(0);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect((await actionGroupGeometry(context, [retry])).inlineOverflow).toBeLessThanOrEqual(1);
}

async function openCharacterContext(
  page: Page,
  tabName: typeof CHARACTER_HISTORY_TAB_LABEL | typeof CHARACTER_LINKS_TAB_LABEL | typeof CHARACTER_LOOK_TAB_LABEL | typeof CHARACTER_OVERVIEW_TAB_LABEL,
): Promise<void> {
  await selectCharacter(page, CARD_NAME);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
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
  await openCharacterContext(page, CHARACTER_HISTORY_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: DIALOG_VERBS.restore, exact: true })).toBeVisible();
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
  await openCharacterContext(page, CHARACTER_HISTORY_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await selectCharacter(page, other.name);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  }
  await expect(context.getByText(otherLabel, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
  await selectCharacter(page, CARD_NAME);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  }
  const retry = context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
  await expect(retry).toBeVisible();
  refuse = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
  await expect(context.getByText(otherLabel, { exact: true })).toHaveCount(0);
  expect((await caller.character.listSnapshots({ characterId: other.id })).map((row) => row.label)).toEqual([otherLabel]);
});

test("Links does not claim nothing is linked while its real reads are held", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, reads } = await prepare(root, page, corpus);
  const pending = holdServed();
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["worldInfo.listForCharacter", "worldInfo.listBooks", "persona.listConnectedToCharacter", "persona.list"], () => pending),
  });
  try {
    await mount<typeof ShellAmbientStory>(STORY, {});
    await openCharacterContext(page, CHARACTER_LINKS_TAB_LABEL);
    await pending.requested;
    const context = page.locator('.shell-panel[data-panel-side="context"]');
    await expect(context.getByRole("tab", { name: CHARACTER_LINKS_TAB_LABEL, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(context.getByText(CHARACTER_NO_BOOKS_LINKED_TEXT, { exact: true })).toHaveCount(0);
    await expect(context.getByText(CHARACTER_NO_PERSONAS_CONNECTED_TEXT, { exact: true })).toHaveCount(0);
    pending.release();
    await expect(context.getByText(CHARACTER_NO_BOOKS_LINKED_TEXT, { exact: true })).toBeVisible();
    await expect(context.getByText(CHARACTER_NO_PERSONAS_CONNECTED_TEXT, { exact: true })).toBeVisible();
  } finally {
    pending.release();
  }
});

test("Links: the add picker leaves by Done and by Escape, and hands focus back to its trigger", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, reads } = await prepare(root, page, corpus);
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["worldInfo.listForCharacter", "worldInfo.listBooks", "persona.listConnectedToCharacter", "persona.list"]),
  });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, CHARACTER_LINKS_TAB_LABEL);
  const trigger = page.locator('.shell-panel[data-panel-side="context"]').getByRole("button", { name: CHARACTER_LINK_BOOK_NAME, exact: true });
  const picker = page.getByRole("dialog");
  for (const leave of ["done", "escape"] as const) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(picker).toBeVisible();
    if (leave === "done") {
      await picker.getByRole("button", { name: DIALOG_VERBS.done, exact: true }).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(picker).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("Overview does not claim you never spoke while its newest-thread read is held", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, reads } = await prepare(root, page, corpus);
  const pending = holdServed();
  await routeTrpc(page, { ...reads, ...serveCorpusProcedures(caller, ["chat.listChats"], (input) => (input?.limit === 1 ? pending : undefined)) });
  try {
    await mount<typeof ShellAmbientStory>(STORY, {});
    await openCharacterContext(page, CHARACTER_OVERVIEW_TAB_LABEL);
    await pending.requested;
    const context = page.locator('.shell-panel[data-panel-side="context"]');
    await expect(context.getByText(CHARACTER_NEVER_SPOKE_TEXT, { exact: true })).toHaveCount(0);
    await expect(context.locator('[data-slot="character-context-band-tokens"]')).toBeVisible();
    await expect(context.locator('[data-slot="character-context-band-chats"]')).toHaveCount(0);
    pending.release();
    await expect(context.getByText(CHARACTER_NEVER_SPOKE_TEXT, { exact: true })).toBeVisible();
    await expect(context.locator('[data-slot="character-context-band-chats"]')).toHaveText("0 chats");
  } finally {
    pending.release();
  }
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
  await openCharacterContext(page, CHARACTER_LOOK_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  const font = context.getByRole("combobox", { name: FONT_FIELD_NAME, exact: true });
  const status = context.locator('[data-slot="autosave-status"]');
  await font.click();
  await page.getByRole("option", { name: FONT, exact: true }).click();
  await expect(status).toContainText(AUTOSAVE_SAVE_FAILED_TEXT);
  await selectCharacter(page, other.name);
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  }
  await expect(font).toHaveText(otherFont);
  await expect(status).toHaveText(AUTOSAVE_SAVED_TEXT);
  await font.click();
  await page.getByRole("option", { name: FONT, exact: true }).click();
  await expect.poll(async () => (await caller.character.get({ characterId: other.id })).themeOverride).toEqual({ font: FONT });
  await expect(status).toHaveText(AUTOSAVE_SAVED_TEXT);
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
        await openCharacterContext(page, CHARACTER_HISTORY_TAB_LABEL);
        await pending.requested;
        const context = page.locator('.shell-panel[data-panel-side="context"]');
        await expect(context.getByRole("tab", { name: CHARACTER_HISTORY_TAB_LABEL, exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(context.getByRole("region", { name: CHARACTER_HISTORY_TAB_LABEL, exact: true }).locator('[aria-busy="true"]')).toBeVisible();
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
      await openCharacterContext(page, CHARACTER_HISTORY_TAB_LABEL);
      await failed.promise;
      const context = page.locator('.shell-panel[data-panel-side="context"]');
      const retry = context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
      await expect(retry).toBeVisible();
      await expectRetryContained(context, retry, regime.landscape);
      await testInfo.attach("history-read-failure", { body: await page.screenshot(), contentType: "image/png" });
      await expect(context.getByText(NO_SNAPSHOTS, { exact: true })).toHaveCount(0);
      refuse = false;
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(context.getByText(SNAPSHOT_LABEL, { exact: true })).toBeVisible();
      await expect(context.getByRole("button", { name: DIALOG_VERBS.restore, exact: true })).toBeVisible();
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
        await openCharacterContext(page, CHARACTER_LOOK_TAB_LABEL);
        const context = page.locator('.shell-panel[data-panel-side="context"]');
        const font = context.getByRole("combobox", { name: FONT_FIELD_NAME, exact: true });
        const status = context.locator('[data-slot="autosave-status"]');
        await expect(font).toHaveText(CHARACTER_INHERIT_LABEL);
        await font.click();
        await page.getByRole("option", { name: FONT, exact: true }).click();
        await pending.requested;
        await expect(status).toHaveText("Saving…");
        await expect(font).toHaveText(FONT);
        expect((await caller.character.get({ characterId: card.id })).themeOverride).toBeNull();
        await testInfo.attach("look-pending-save", { body: await page.screenshot(), contentType: "image/png" });
        pending.fail();
        await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByText(CHARACTER_SAVE_FAILURE, { exact: true })).toBeVisible();
        await expect(font).toHaveText(FONT);
        await testInfo.attach("look-failed-save-before-retry", { body: await page.screenshot(), contentType: "image/png" });
        await expect(status).toContainText(AUTOSAVE_SAVE_FAILED_TEXT);
        if (regime.coarse) {
          await expectFailedSheetExit(page, context);
        }
        await expect(font).toHaveText(FONT);
        await expect(status).toContainText(AUTOSAVE_SAVE_FAILED_TEXT);
        const retry = status.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
        await expectRetryContained(context, retry, regime.landscape);
        await testInfo.attach("look-local-recovery", { body: await page.screenshot(), contentType: "image/png" });
        intercept = false;
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(status).toHaveText(AUTOSAVE_SAVED_TEXT);
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

async function createSecondCharacter(caller: Caller): Promise<string> {
  const other = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "context-second-cartographer", name: "The second cartographer", description: "A second card." }),
  });
  return other.name;
}

async function showContextTab(page: Page, tab: string): Promise<void> {
  if ((await page.locator('.shell-panel[data-panel-side="context"]').getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  }
  await page.locator('.shell-panel[data-panel-side="context"]').getByRole("tab", { name: tab, exact: true }).click();
}

test("Links: a failed read for one character does not stick on the next", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  const other = await createSecondCharacter(caller);
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["persona.list", "persona.listConnectedToCharacter", "worldInfo.listBooks"]),
    ...serveCorpusProcedures(caller, ["worldInfo.listForCharacter"], ({ characterId }) =>
      characterId === card.id ? trpcError({ code: "BAD_REQUEST", message: "refused" }) : undefined,
    ),
  });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, CHARACTER_LINKS_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await selectCharacter(page, other);
  await showContextTab(page, CHARACTER_LINKS_TAB_LABEL);
  await expect(context.getByText(CHARACTER_NO_BOOKS_LINKED_TEXT, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
});

test("Overview: a failed read for one character does not stick on the next", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  const other = await createSecondCharacter(caller);
  await routeTrpc(page, {
    ...reads,
    ...serveCorpusProcedures(caller, ["chat.listChats"], (input) =>
      input?.limit === 1 && input.characterId === card.id ? trpcError({ code: "BAD_REQUEST", message: "refused" }) : undefined,
    ),
  });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, CHARACTER_OVERVIEW_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toBeVisible();
  await expect(context.locator('[data-slot="character-context-band-tokens"]')).toBeVisible();
  await expect(context.locator('[data-slot="character-context-band-chats"]')).toHaveCount(0);
  await selectCharacter(page, other);
  await showContextTab(page, CHARACTER_OVERVIEW_TAB_LABEL);
  await expect(context.locator('[data-slot="character-context-band-chats"]')).toHaveText("0 chats");
  await expect(context.getByText(CHARACTER_NEVER_SPOKE_TEXT, { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
});

test("Look's Reset all to Inherit asks first: Cancel writes nothing, Reset writes once", async ({ page, corpus, mount }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const { caller, card, reads } = await prepare(root, page, corpus);
  await page.setViewportSize({ width: 1280, height: 720 });
  await caller.character.update({ characterId: card.id, input: { themeOverride: { font: FONT } } });
  const calls = await routeTrpc(page, { ...reads, ...serveCorpusProcedures(caller, ["character.update"]) });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await openCharacterContext(page, CHARACTER_LOOK_TAB_LABEL);
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  const font = context.getByRole("combobox", { name: FONT_FIELD_NAME, exact: true });
  await expect(font).toHaveText(FONT);

  await context.getByRole("button", { name: CHARACTER_RESET_LOOK_NAME, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(calls.inputs("character.update")).toEqual([]);
  await expect(font).toHaveText(FONT);

  await context.getByRole("button", { name: CHARACTER_RESET_LOOK_NAME, exact: true }).click();
  await confirm.getByRole("button", { name: CHARACTER_RESET_LOOK_CONFIRM_NAME, exact: true }).click();
  await expect(font).toHaveText(CHARACTER_INHERIT_LABEL);
  await expect.poll(() => calls.inputs("character.update").length).toBe(1);
  expect((await caller.character.get({ characterId: card.id })).themeOverride).toBeNull();
});

test.describe("the phone character sheet's header", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("its two menu doors, the tab chooser and the character actions, wear different marks", async ({ page, corpus, mount }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const { reads } = await prepare(root, page, corpus);
    await routeTrpc(page, reads);
    await mount<typeof ShellAmbientStory>(STORY, {});
    await openCharacterContext(page, CHARACTER_OVERVIEW_TAB_LABEL);
    const header = page.locator('.shell-panel[data-panel-side="context"] [data-slot="context-bracket-header"]');
    const mark = (name: string): Promise<string[]> =>
      header
        .getByRole("button", { name, exact: true })
        .locator("svg")
        .evaluateAll((svgs) => svgs.map((svg) => Array.from(svg.classList).find((token) => token.startsWith("lucide-")) ?? ""));
    const tabs = await mark("All Character tabs");
    const actions = await mark(CHARACTER_ACTIONS_MENU_NAME);

    expect(tabs.length).toBeGreaterThan(0);
    expect(actions.length).toBeGreaterThan(0);
    expect(tabs).not.toStrictEqual(actions);
  });
});
