import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { CollectionCompositionStory } from "./_collection-composition-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const SUBJECTS = ["regex", "worldInfo", "rosterPreset"] as const;
type Subject = (typeof SUBJECTS)[number];
const STORY = "tests/client/features/config/surfaces/_collection-composition-stories/CollectionCompositionStory";
const LONG_NAME = "A Copper Observatory and Northern Expedition Reference Archive";
const REGIMES = [
  { name: "narrow desktop enlarged", viewport: { width: 1280, height: 900 }, width: 300, touch: false, enlarged: true, inline: false },
  { name: "coarse portrait enlarged", viewport: { width: 390, height: 844 }, width: 390, touch: true, enlarged: true, inline: false },
  { name: "coarse landscape enlarged", viewport: { width: 844, height: 390 }, width: 844, touch: true, enlarged: true, inline: false },
  { name: "wide desktop", viewport: { width: 1440, height: 900 }, width: 960, touch: false, enlarged: false, inline: true },
] as const;

async function prepare(
  caller: Caller,
  page: Page,
  subject: Subject,
  enlarged: boolean,
): Promise<{ readonly appearance: ReturnType<typeof appearanceSettingsSchema.parse>; readonly calls: Awaited<ReturnType<typeof routeTrpc>> }> {
  const appearance = appearanceSettingsSchema.parse(enlarged ? { fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale } : {});
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  if (subject === "regex") {
    await caller.regex.createScript({
      input: createRegexScriptSchema.parse({ name: LONG_NAME, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
    });
  } else if (subject === "worldInfo") {
    await caller.worldInfo.createBook({ input: { name: LONG_NAME } });
  } else {
    const template = (await caller.rosterPreset.list()).find((candidate) => candidate.rules.length > 0);
    if (template === undefined) {
      throw new Error("The corpus has no rule-carrying roster to derive the long-name layout witness from");
    }
    const character = template.members[0];
    if (character === undefined) {
      throw new Error("The corpus roster has no character for the layout witness");
    }
    await caller.rosterPreset.create({
      input: createRosterPresetSchema.parse({
        name: LONG_NAME,
        members: [{ kind: "character", characterId: character.characterId, position: 0 }],
        rules: template.rules,
      }),
    });
  }
  const calls = await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      "worldInfo.listBooksWithUsage",
      "worldInfo.getBook",
      "worldInfo.listEntries",
      "rosterPreset.count",
      "rosterPreset.get",
      "automation.listRulePresets",
      "regex.listGlobal",
      "regex.createScript",
    ]),
  );
  return { appearance, calls };
}

async function expectBoundedContent(content: Locator, width: number): Promise<void> {
  const host = content.page().locator('[data-slot="collection-composition-host"]');
  const geometry = await actionGroupGeometry(host, [content]);
  await test.info().attach("bounded-collection-host", { body: JSON.stringify(geometry), contentType: "application/json" });
  expect(geometry.host.width).toBeCloseTo(width, 0);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
}

async function expectUsefulFilter(page: Page, content: Locator): Promise<Locator> {
  const row = content.locator('[data-slot="collection-control-row"]');
  const filter = row.getByRole("textbox");
  await expect(filter).toBeVisible();
  const preferred = await resolvedLength(page, "var(--width-field-floor)", row);
  const [bounds, available] = await Promise.all([filter.boundingBox(), row.boundingBox()]);
  if (bounds === null || available === null) {
    throw new Error("The collection filter and its row have no rendered boxes");
  }
  const minimum = Math.min(preferred, available.width);
  await test.info().attach("filter-width", {
    body: JSON.stringify({ preferred, available: available.width, minimum, actual: bounds.width }),
    contentType: "application/json",
  });
  expect(bounds.width).toBeGreaterThanOrEqual(minimum);
  const rowRegion = await actionGroupGeometry(content, [row]);
  expect(rowRegion.inlineOverflow).toBeLessThanOrEqual(1);
  const geometry = await actionGroupGeometry(row, [filter, ...(await row.getByRole("button").all())]);
  await test.info().attach("control-row-boxes", { body: JSON.stringify({ rowRegion, geometry }), contentType: "application/json" });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  return filter;
}

async function expectInsightComposition(content: Locator, keepInline: boolean): Promise<void> {
  const insights = content.locator('[data-slot="config-library-insights"]');
  const doorName = new RegExp(`^Open ${LONG_NAME}:`, "u");
  const door = insights.getByRole("button", { name: doorName }).first();
  await expect(door).toBeVisible();
  const row = insights
    .locator(":scope > *")
    .filter({ has: content.page().getByRole("button", { name: doorName }) })
    .first();
  const value = row.getByText(/^\d+ of \d+$/u);
  await expect(value).toBeVisible();
  const lines = await value.evaluate((node) => {
    const text = document.createRange();
    text.selectNodeContents(node);
    return text.getClientRects().length;
  });
  const geometry = await actionGroupGeometry(content, [door, value]);
  await test.info().attach("insight-boxes", { body: JSON.stringify({ geometry, valueLines: lines }), contentType: "application/json" });
  expect(lines).toBe(1);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  expect(await door.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const [doorBox, valueBox] = geometry.controls;
  if (doorBox === undefined || valueBox === undefined) {
    throw new Error("The insight statement and action have no measured boxes");
  }
  const expectArrangement = keepInline ? expectInline : expectSeparateBoxes;
  expectArrangement(doorBox, valueBox);
  await content.page().screenshot({ path: test.info().outputPath("collection-insight.png") });
  await door.click();
}

type Box = Awaited<ReturnType<Locator["boundingBox"]>>;
function expectInline(door: NonNullable<Box>, value: NonNullable<Box>): void {
  expect(Math.abs(door.y + door.height / 2 - value.y - value.height / 2)).toBeLessThanOrEqual(1);
}
function expectSeparateBoxes(door: NonNullable<Box>, value: NonNullable<Box>): void {
  const inlineOverlap = Math.min(door.x + door.width, value.x + value.width) - Math.max(door.x, value.x);
  const blockOverlap = Math.min(door.y + door.height, value.y + value.height) - Math.max(door.y, value.y);
  expect(inlineOverlap <= 1 || blockOverlap <= 1).toBe(true);
}

async function expectMemberHeader(content: Locator): Promise<void> {
  const header = content.locator('[data-slot="config-drill-header"]');
  const title = header.getByRole("heading", { name: LONG_NAME, exact: true });
  await expect(title).toHaveCount(1);
  const buttons = await header.getByRole("button").all();
  await test.info().attach("opened-member-header", {
    body: JSON.stringify({
      header: await header.boundingBox(),
      title: await title.boundingBox(),
      buttons: await Promise.all(buttons.map((button) => button.boundingBox())),
    }),
    contentType: "application/json",
  });
  await expect(title).toBeVisible();
  await expect(header.getByRole("button", { name: /^Back to /u })).toBeVisible();
  for (const button of buttons) {
    expect(await button.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  }
  const geometry = await actionGroupGeometry(content, [title, ...buttons]);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  const preferred = await resolvedLength(content.page(), "var(--width-title-floor)", header);
  const titleBox = geometry.controls[0];
  if (titleBox === undefined) {
    throw new Error("The open member has no measured identity");
  }
  expect(titleBox.width).toBeGreaterThanOrEqual(Math.min(preferred, geometry.host.width));
  const floor = await resolvedLength(content.page(), "var(--size-control-sm)", header);
  for (const box of geometry.controls.slice(1)) {
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
  geometry.controls.forEach((box, index) => {
    for (const sibling of geometry.controls.slice(index + 1)) {
      expectSeparateBoxes(box, sibling);
    }
  });
}

async function expectInlineCreationGeometry(content: Locator, form: Locator, controls: readonly [Locator, Locator, Locator]): Promise<void> {
  const geometry = await actionGroupGeometry(form, controls);
  const containment = await actionGroupGeometry(content, [form, ...controls]);
  const fieldFloor = await resolvedLength(form.page(), "var(--width-field-floor)", form);
  const targetFloor = await resolvedLength(form.page(), "var(--size-control-sm)", form);
  await test.info().attach("open-inline-creation-geometry", {
    body: JSON.stringify({ geometry, containment, fieldFloor, targetFloor }),
    contentType: "application/json",
  });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  expect(containment.inlineOverflow).toBeLessThanOrEqual(1);
  expect(geometry.controls[0]?.width).toBeGreaterThanOrEqual(Math.min(fieldFloor, geometry.host.width));
  for (const box of geometry.controls) {
    expect(box.height).toBeGreaterThanOrEqual(targetFloor);
  }
  geometry.controls.forEach((box, index) => {
    for (const sibling of geometry.controls.slice(index + 1)) {
      expectSeparateBoxes(box, sibling);
    }
  });
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch, isMobile: regime.touch });

    test("open inline collection creation keeps a usable name field and explicit Create/Cancel actions", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const { appearance, calls } = await prepare(caller, page, "regex", regime.enlarged);
      const before = await caller.regex.listScripts();
      const maximum = createRegexScriptSchema.shape.name.maxLength;
      if (maximum === null) {
        throw new Error("The inline collection name must have its production schema boundary");
      }
      const name = `${"Inline creation qualification ".repeat(maximum).slice(0, maximum - 1)}x`;
      await mount<typeof CollectionCompositionStory>(STORY, { group: "regex", width: regime.width, height: regime.viewport.height, appearance });
      const content = page.locator('[data-slot="config-content"]');
      await expectBoundedContent(content, regime.width);
      const opener = content.getByRole("button", { name: "New script", exact: true });
      await opener.focus();
      await page.keyboard.press("Enter");
      const form = content.getByRole("form", { name: "New script", exact: true });
      const field = form.getByRole("textbox", { name: "Script name", exact: true });
      const create = form.locator('button[type="submit"]');
      const cancel = form.getByRole("button", { name: "Cancel", exact: true });
      await expect(field).toBeFocused();
      await expect(create).toHaveText("Create");
      await expect(create).toBeDisabled();
      await field.fill(name);
      await expect(field).toHaveValue(name);
      await expect(create).toBeEnabled();
      await page.keyboard.press("Tab");
      await expect(create).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(cancel).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(form).toBeHidden();
      expect(calls.count("regex.createScript")).toBe(0);
      expect(await caller.regex.listScripts()).toEqual(before);
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(field).toBeFocused();
      await expect(field).toHaveValue("");
      await field.fill(name);
      await expect(create).toBeEnabled();
      await page.keyboard.press("Tab");
      await expect(create).toBeFocused();
      await expectInlineCreationGeometry(content, form, [field, create, cancel]);
      await page.keyboard.press("Enter");
      await expect(form).toBeHidden();
      expect(calls.count("regex.createScript")).toBe(1);
      expect(calls.lastInput("regex.createScript")?.input.name).toBe(name);
      const previousIds = new Set(before.map((script) => script.id));
      const after = await caller.regex.listScripts();
      expect(after.filter((script) => !previousIds.has(script.id))).toMatchObject([{ name }]);
      expect(after.filter((script) => previousIds.has(script.id))).toEqual(before);
    });

    test("shared collection controls keep a usable filter and real bulk, create and import doors", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const { appearance } = await prepare(caller, page, "regex", regime.enlarged);
      await mount<typeof CollectionCompositionStory>(STORY, { group: "regex", width: regime.width, height: regime.viewport.height, appearance });
      const content = page.locator('[data-slot="config-content"]');
      await expectBoundedContent(content, regime.width);
      const title = content.locator('[data-slot="list-row-title"]').filter({ hasText: LONG_NAME });
      await expect(title).toBeVisible();
      const filter = await expectUsefulFilter(page, content);
      await filter.fill("Observatory");
      await expect(title).toBeVisible();
      await filter.clear();
      const bulk = content.getByRole("button", { name: "Select scripts", exact: true });
      await bulk.click();
      await expect(bulk).toHaveAttribute("aria-pressed", "true");
      await expect(content.getByRole("checkbox").first()).toBeVisible();
      await bulk.click();
      const before = await caller.regex.countScripts();
      await content.getByRole("button", { name: "New script", exact: true }).click();
      await expect(content.getByRole("textbox", { name: "Script name", exact: true })).toBeFocused();
      await content.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await caller.regex.countScripts()).toBe(before);
      await content.getByRole("button", { name: "More library actions", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Import a regex script", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.screenshot({ path: test.info().outputPath("collection-controls.png") });
    });

    test("shared insight statements and long-name actions stay legible and open the real member", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const { appearance } = await prepare(caller, page, "regex", regime.enlarged);
      await mount<typeof CollectionCompositionStory>(STORY, { group: "regex", width: regime.width, height: regime.viewport.height, appearance });
      const content = page.locator('[data-slot="config-content"]');
      await expectBoundedContent(content, regime.width);
      await expectInsightComposition(content, regime.inline);
      await expectMemberHeader(content);
      await expect(content.getByRole("heading", { name: LONG_NAME, exact: true })).toHaveCount(1);
    });
  });
}

for (const regime of REGIMES.slice(0, 2)) {
  test.describe(`${regime.name} shared-host adoption`, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.touch, isMobile: regime.touch });
    for (const subject of SUBJECTS.slice(1)) {
      test(`${subject} adopts useful filtering and whole insight statements without losing its member door`, async ({ mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        const { appearance } = await prepare(caller, page, subject, regime.enlarged);
        await mount<typeof CollectionCompositionStory>(STORY, { group: subject, width: regime.width, height: regime.viewport.height, appearance });
        const content = page.locator('[data-slot="config-content"]');
        await expectBoundedContent(content, regime.width);
        await expectUsefulFilter(page, content);
        await expectInsightComposition(content, false);
        await expectMemberHeader(content);
        await expect(content.getByRole("heading", { name: LONG_NAME, exact: true })).toHaveCount(1);
      });
    }
  });
}
