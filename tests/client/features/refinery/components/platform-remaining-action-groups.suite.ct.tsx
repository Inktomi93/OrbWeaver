import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import {
  REFINERY_EDIT_SCOPE_NAME,
  REFINERY_VERSION_DIFF_HEADING,
  refineryCompareToggleName,
  refineryRestoreVersionName,
  refineryVersionRowLabel,
} from "#client/features/refinery/lib/refinery-names.ts";
import type { RefineryRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/refinery/components/_remaining-action-groups-stories/RefineryRemainingActionsStory";
const nameMaximum = createCharacterSchema.shape.name.maxLength;
if (nameMaximum === null) {
  throw new Error("The maximum-length card-name case requires a bounded character name");
}
const CARD_NAME = "R".repeat(nameMaximum);
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

type Root = Awaited<ReturnType<typeof createServerHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

async function seedSession(
  root: Root,
  page: Page,
): Promise<{
  readonly session: Awaited<ReturnType<Caller["refinery"]["startSession"]>>;
  readonly card: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly caller: Caller;
}> {
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "remaining-actions", name: CARD_NAME, description: "The pinned description." }),
  });
  const session = await caller.refinery.startSession({ characterId: card.id });
  await caller.refinery.updateSession({ sessionId: session.id, patch: { selection: { fields: ["description"] } } });
  await caller.refinery.submitManualRewrite({ sessionId: session.id, fields: [{ field: "description", text: "The manual rewrite." }] });
  await caller.character.snapshot({ characterId: card.id, label: "Manual layout reference" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "refinery.getSession",
      "refinery.listRuns",
      "refinery.preflight",
      "character.get",
      "character.listSnapshots",
      "character.getSnapshot",
    ]),
  );
  return { session, caller, card };
}

async function expectContained(group: Locator, controls: readonly Locator[]): Promise<void> {
  const geometry = await actionGroupGeometry(group, controls);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  const host = group.page().getByRole("group", { name: "Refinery remaining-action host", exact: true });
  expect((await actionGroupGeometry(host, controls)).inlineOverflow).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(group.page(), `var(${TOKENS["size.control-sm"].cssVar})`, group);
  for (const box of geometry.controls) {
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("run actions contain both apply-selection labels and retain keyboard focus", async ({ mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const { session } = await seedSession(root, page);
      await mount<typeof RefineryRemainingActionsStory>(STORY, { sessionId: session.id, plane: "runs", width: regime.width, appearance: regime.appearance });
      const view = page.getByRole("button", { name: /^View /u });
      const useForApply = page.getByRole("button", { name: /^Use for apply: /u });
      await expectContained(view.locator(".."), [view, useForApply]);
      await view.focus();
      await page.keyboard.press("Tab");
      await expect(useForApply).toBeFocused();
      await page.keyboard.press("Enter");
      const latest = page.getByRole("button", { name: /^Use latest instead: /u });
      await expect(latest).toBeFocused();
      await expectContained(view.locator(".."), [view, latest]);
      await page.keyboard.press("Enter");
      await expect(useForApply).toBeFocused();
    });

    test("version actions contain Compare and Hide compare without activating Restore", async ({ mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const { session, caller, card } = await seedSession(root, page);
      await mount<typeof RefineryRemainingActionsStory>(STORY, {
        sessionId: session.id,
        plane: "versions",
        width: regime.width,
        appearance: regime.appearance,
      });
      const compare = page.getByRole("button", { name: refineryCompareToggleName(false, "Manual layout reference"), exact: true });
      const restore = page.getByRole("button", { name: refineryRestoreVersionName("Manual layout reference"), exact: true });
      await expectContained(compare.locator(".."), [compare, restore]);
      await compare.focus();
      await page.keyboard.press("Enter");
      const hide = page.getByRole("button", { name: refineryCompareToggleName(true, "Manual layout reference"), exact: true });
      await expect(hide).toBeFocused();
      await expect(page.getByText(REFINERY_VERSION_DIFF_HEADING, { exact: true })).toBeVisible();
      await expectContained(hide.locator(".."), [hide, restore]);
      await page.keyboard.press("Tab");
      await expect(restore).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(compare).toBeFocused();
      expect((await caller.character.get({ characterId: card.id })).description).toBe("The pinned description.");
    });

    test("masthead card and scope actions remain contained beside a maximum-length card name", async ({ mount, page }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false });
      const { session, caller } = await seedSession(root, page);
      await mount<typeof RefineryRemainingActionsStory>(STORY, { sessionId: session.id, plane: "content", width: regime.width, appearance: regime.appearance });
      const open = page.getByRole("button", { name: `Open card ${CARD_NAME} in the Characters section`, exact: true });
      const scope = page.getByRole("button", { name: REFINERY_EDIT_SCOPE_NAME, exact: true });
      await expectContained(open.locator(".."), [open, scope]);
      await open.focus();
      await page.keyboard.press("Tab");
      await expect(scope).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Scope", exact: true });
      await expect(dialog.getByRole("checkbox", { name: "Description", exact: true })).toBeChecked();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(scope).toBeFocused();
      expect((await caller.refinery.getSession({ sessionId: session.id })).selection.fields).toEqual(["description"]);
    });
  });
}

test("each version's Compare and Restore name its version and its row shows the ordinal, so versions sharing a label are told apart oldest first", async ({
  mount,
  page,
}) => {
  await using root = await createServerHarness({ startJobs: false });
  const { session, caller, card } = await seedSession(root, page);
  // The walk orders by creation time, so each snapshot is made a second after the last.
  for (const label of ["Manual layout reference", "Before the rename"]) {
    root.clock.advance(1000);
    await caller.character.snapshot({ characterId: card.id, label });
  }
  await mount<typeof RefineryRemainingActionsStory>(STORY, {
    sessionId: session.id,
    plane: "versions",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });
  const restores = page.getByRole("button", { name: /^Restore /u });
  await expect(restores).toHaveCount(3);
  // The walk lists newest first; the ordinal counts from the oldest, so a later snapshot never renames an earlier one.
  const expected = [
    refineryRestoreVersionName("Before the rename"),
    refineryRestoreVersionName("Manual layout reference", "#2"),
    refineryRestoreVersionName("Manual layout reference", "#1"),
  ];
  for (const [index, name] of expected.entries()) {
    await expect(restores.nth(index)).toHaveAccessibleName(name);
  }
  const compares = page.getByRole("button", { name: /^Compare /u });
  await expect(compares).toHaveCount(3);
  const comparing = [
    refineryCompareToggleName(false, "Before the rename"),
    refineryCompareToggleName(false, "Manual layout reference", "#2"),
    refineryCompareToggleName(false, "Manual layout reference", "#1"),
  ];
  for (const [index, name] of comparing.entries()) {
    await expect(compares.nth(index)).toHaveAccessibleName(name);
  }
  // Sighted readers get the same ordinal the names carry; a row with a label of its own prints none.
  await expect(page.getByText(refineryVersionRowLabel("Manual layout reference", "#2"), { exact: true })).toBeVisible();
  await expect(page.getByText(refineryVersionRowLabel("Manual layout reference", "#1"), { exact: true })).toBeVisible();
  await expect(page.getByText("Before the rename", { exact: true })).toBeVisible();
});

test("two runs of one stage in one round carry distinct names, oldest first", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const { session, caller } = await seedSession(root, page);
  await caller.refinery.submitManualRewrite({ sessionId: session.id, fields: [{ field: "description", text: "A second rewrite in the same round." }] });
  await mount<typeof RefineryRemainingActionsStory>(STORY, {
    sessionId: session.id,
    plane: "runs",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });
  const names = (pattern: RegExp): Promise<(string | null)[]> =>
    page.getByRole("button", { name: pattern }).evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
  await expect(page.getByRole("button", { name: /^View /u })).toHaveCount(2);
  const views = await names(/^View /u);
  const applies = await names(/^Use for apply: /u);
  expect(new Set(views).size).toBe(2);
  expect(new Set(applies).size).toBe(2);
  // The ledger lists newest first; the qualifier counts from the oldest, so a later run never renames an earlier one.
  expect(views).toEqual([expect.stringMatching(/ #2$/u), expect.stringMatching(/ #1$/u)]);
});
