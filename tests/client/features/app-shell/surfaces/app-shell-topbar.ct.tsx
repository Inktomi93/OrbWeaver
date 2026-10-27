// The shell's topbar on the production registry: the narrow screen name a phone reads, the ⌘K chip's name, the phone
// row's geometry at the narrowest width, the Characters band's doors moving to the trail while the list is the screen,
// and an open room's identity: its participants, its name, its chips and the context pane's header on the same horizon.
import { censusTitle } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { pixel, resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { commandShortcutLabel } from "#client/features/app-shell/lib/command-shortcut-label.ts";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { AppShellTrailProjectionStory } from "./_trail-projection-stories.tsx";
import { JUMP_CHIP, namedGroupRoom, routeRoom, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";
import { STORY_TRAIL_WIDGET } from "./trail-projection.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const NARROW_TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const NARROWEST = { width: 320, height: 800 } as const;
const PHONE_WIDTHS = [320, 390] as const;
// The screen title's least share of a phone row beside the room's two chips: a regression floor for the name, not a
// geometry token (no token sizes the title; it takes what the chips and the back control leave).
const TITLE_SHARE_NARROWEST = 0.25;
const TITLE_SHARE_PHONE = 0.38;

function narrowTitleShare(width: number): number {
  return width * (width <= NARROWEST.width ? TITLE_SHARE_NARROWEST : TITLE_SHARE_PHONE);
}

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

function library(page: Page): Locator {
  return page.locator(LIST).getByRole("list", { name: "Character library" });
}

/** How far the list pane's body starts below the pane's own top edge: the band's row when it paints, else nothing. */
function bodyOffset(page: Page): Promise<number> {
  return page.locator(LIST).evaluate((pane) => {
    const body = pane.querySelector(":scope > .shell-panel-body");
    return (body?.getBoundingClientRect().top ?? Number.NaN) - pane.getBoundingClientRect().top;
  });
}

async function routeSections(page: Page, corpus: CorpusPlayback): Promise<void> {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
}

function touchTarget(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--size-touch-target)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("an open character's screen keeps the section's name while her read is in flight, never the library census", async ({ corpus, mount, page }) => {
    const caller = await root.internalCallerFor(root.ownerId);
    const census = await caller.character.count({ archived: false });
    const held = holdCorpusProcedure(caller, "character.get");
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES), ...held.routes });
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    const label = (await page.locator(".shell-rail").getByRole("button", { name: SECTION_LABELS.characters, exact: true }).getAttribute("aria-label")) ?? "";
    const title = page.locator(NARROW_TITLE);
    // The roster arm first, so the census is proven present before the open is asked to remove it.
    await expect(title).toHaveText(censusTitle(label, census) ?? label);
    const first = library(page).getByRole("button").first();
    const name = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await first.click();
    await held.requested;
    await expect(title).toHaveText(label);
    held.release();
    await expect(title).toHaveText(name);
  });

  for (const width of PHONE_WIDTHS) {
    test(`at ${String(width)} the Characters band is shed, so one chrome row sits above the pane, and its doors ride the trail until a character opens`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await routeSections(page, corpus);
      await seedShellState(page, { activeSection: "characters" });
      await mount<typeof AppShellStory>(STORY, {});
      await expect(library(page).getByRole("button").first()).toBeVisible();
      // The band is a chrome row of its own, so a painted band puts a whole row between the pane's top and its body.
      const offset = await bodyOffset(page);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(await resolvedLength(page, "var(--dimension-chrome-row)"));
      await expect(page.locator(`${LIST} .shell-panel-header`)).toBeHidden();
      const trail = page.locator(".shell-topbar-trail");
      await expect(trail.getByRole("button", { name: "New", exact: true })).toBeVisible();
      await expect(trail.getByRole("button", { name: "Import a character card" })).toBeVisible();
      expect((await page.locator('.shell-topbar-identity[data-identity="narrow"]').boundingBox())?.width ?? 0).toBeGreaterThan(0);
      await library(page).getByRole("button").first().click();
      await expect(trail.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
    });
  }
});

test("on a desktop the Characters band keeps its own doors and the trail carries none", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof AppShellStory>(STORY, {});
  const band = page.locator(`${LIST} .shell-panel-header`);
  await expect(band).toBeVisible();
  // The band's New is a word or a glyph by its own container width; either way it stays on the band.
  await expect(band.getByRole("button", { name: /^New(?: character)?$/u })).toBeVisible();
  await expect(page.locator(".shell-topbar-trail").getByRole("button", { name: /^New(?: character)?$/u })).toHaveCount(0);
});

test("the ⌘K chip paints no text, and its name and description carry Jump and this platform's shortcut", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mount<typeof AppShellStory>(STORY, {});
  const chip = page.locator(".shell-topbar-trail").getByRole("button", { name: JUMP_CHIP });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("");
  await expect(chip.locator("svg")).toHaveCount(1);
  const shortcut = commandShortcutLabel(await page.evaluate(() => navigator.userAgent));
  await expect(chip).toHaveAccessibleName(`Jump — the command menu (${shortcut})`);
  await expect(chip).toHaveAccessibleDescription(`Jump to… ${shortcut}`);
});

test.describe("the phone topbar at 320, coarse pointer", () => {
  test.use({ hasTouch: true, viewport: NARROWEST });

  test.beforeEach(async ({ corpus, page }) => {
    await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
    await seedShellState(page, { activeSection: "characters" });
  });

  /** Push the first character: CONTENT is the screen and the lead control is the one way back. */
  async function pushMember(page: Page): Promise<Locator> {
    await library(page).getByRole("button").first().click();
    const back = page.getByRole("button", { name: "Back to Characters", exact: true });
    await expect(back).toBeVisible();
    return back;
  }

  test("every point a thumb lands on the back button lands the back button, and it returns to the roster", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const back = await pushMember(page);
    const samples = (): Promise<string> =>
      back.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [0.1, 0.25, 0.5, 0.75, 0.9]
          .map(
            (f) =>
              document
                .elementFromPoint(box.left + box.width * f, box.top + box.height * f)
                ?.closest("button")
                ?.getAttribute("aria-label") ?? "none",
          )
          .join(" | ");
      });
    // Polled to settled: while a view transition runs, hit testing answers the snapshot, not the button.
    await expect.poll(samples).toBe(Array.from({ length: 5 }, () => "Back to Characters").join(" | "));
    await back.click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
  });

  test("the lead keeps a real box, the title outranks any control, and every control sits inside the row", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await pushMember(page);
    const lead = await page.locator(".shell-topbar-lead").boundingBox();
    const title = page.locator(NARROW_TITLE);
    await expect(title).toBeVisible();
    const trail = await page.locator(".shell-topbar-trail").boundingBox();
    expect(lead?.width ?? 0).toBeGreaterThan(await touchTarget(page));
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
    expect((lead?.x ?? 0) + (lead?.width ?? 0)).toBeLessThanOrEqual((trail?.x ?? 0) + 1);
    const controls = await page.locator(".shell-topbar button").evaluateAll((elements) =>
      elements
        .filter((element) => element.checkVisibility())
        .map((element) => ({
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          width: element.getBoundingClientRect().width,
        })),
    );
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.filter((control) => control.left < 0 || control.right > NARROWEST.width)).toEqual([]);
    const widest = Math.max(...controls.map((control) => control.width));
    const roomForName = (lead?.width ?? 0) - widest;
    expect(roomForName).toBeGreaterThan(widest);
    expect(roomForName / NARROWEST.width).toBeGreaterThan(0.3);
  });

  test("the desktop-shaped ⌘K chip sheds on a phone and the palette keeps a row in the You sheet", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(".shell-rail")).toBeVisible();
    await expect(page.getByRole("button", { name: JUMP_CHIP })).toHaveCount(0);
    await page.locator(".shell-rail").getByRole("button", { name: "You", exact: true }).click();
    await expect(page.locator('[data-slot="drawer-popup"]').getByRole("button", { name: "Jump to…", exact: true })).toBeVisible();
  });

  test("the roster frame names the section and the pushed frame names the member", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator(NARROW_TITLE);
    await expect(title).toHaveText(/^Characters\b/u);
    const first = library(page).getByRole("button").first();
    const memberName = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await pushMember(page);
    await expect(title).toHaveText(memberName);
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });
});

const WIDE_TITLE = '.shell-topbar-identity[data-identity="wide"] .shell-topbar-title';
const MEMBERS_CHIP = '[aria-label^="Members — "]';
const MEMORY_CHIP = '[aria-label^="Memory — "]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const BOTH_DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
const LONG_NAME = "The Extraordinarily Long Saga of the Ninth Epoch Beneath the Violet Braziers";

type RoomCaller = Awaited<ReturnType<Root["internalCallerFor"]>>;

function ownerCaller(): Promise<RoomCaller> {
  return root.internalCallerFor(root.ownerId);
}

async function openNamedRoom(
  page: Page,
  corpus: CorpusPlayback,
  caller: RoomCaller,
): Promise<{ readonly id: ChatId; readonly title: string; readonly cast: string }> {
  const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
  await routeRoom(page, corpus, caller);
  return { id: room.id, title: room.title ?? "", cast: room.participantNames.join(", ") };
}

/** The title floor resolved in the title group's own font, where `ch` takes its size. */
function titleFloor(page: Page): Promise<number> {
  return page
    .locator(".shell-topbar-title-group")
    .first()
    .evaluate((group) => {
      const probe = document.createElement("span");
      probe.style.width = "var(--dimension-shell-title-floor)";
      probe.style.flex = "none";
      group.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    });
}

function visibleTitles(page: Page): Promise<number> {
  return page.evaluate(() => [...document.querySelectorAll(".shell-topbar-title")].filter((element) => element.checkVisibility()).length);
}

function clientWidth(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.clientWidth);
}

test.describe("an open named group room", () => {
  test("at 1280 both docked the topbar names the cast, keeps the room name at its floor beside it, and the title renames; collapsed it still names them", async ({
    corpus,
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedShellState(page, BOTH_DOCKED);
    const room = await openNamedRoom(page, corpus, await ownerCaller());
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
    const title = page.locator(WIDE_TITLE);
    await expect(title).toHaveText(room.cast);
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    const trail = page.locator(".shell-topbar-trail");
    await expect(trail.getByRole("button", { name: /^Notifications/u })).toBeVisible();
    await expect(trail.getByRole("button", { name: "Report a bug", exact: true })).toBeVisible();
    await expect(trail.getByRole("button", { name: "Plugin commands", exact: true })).toBeVisible();
    await expect(page.locator(MEMBERS_CHIP)).toBeVisible();
    await expect(page.locator(MEMORY_CHIP)).toBeVisible();
    await expect(page.locator(`${MEMBERS_CHIP} .shell-chat-chip-count`)).toBeHidden();
    const subtitle = page.locator(".shell-topbar-subtitle");
    await expect(subtitle).toHaveText(room.title);
    await expect
      .poll(() => subtitle.evaluate((element) => element.clientWidth > 0 && element.clientWidth >= Number.parseFloat(getComputedStyle(element).minWidth) - 1))
      .toBe(true);
    const group = await page.locator('.shell-topbar-identity[data-identity="wide"] .shell-topbar-title-group').boundingBox();
    const members = await page.locator(MEMBERS_CHIP).boundingBox();
    expect((group?.x ?? 0) + (group?.width ?? 0)).toBeLessThanOrEqual((members?.x ?? 0) + 1);

    const box = await title.boundingBox();
    const centre = { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
    await expect
      .poll(() => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label") ?? "", centre))
      .toMatch(/^Rename chat — /u);
    await page.mouse.click(centre.x, centre.y);
    const input = page.getByRole("textbox", { name: "Chat name" });
    await expect(input).toBeVisible();
    await expect.poll(() => clientWidth(input)).toBeGreaterThanOrEqual(await titleFloor(page));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Hide details", exact: true }).click();
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.locator(".shell-topbar-title:visible")).toHaveText(room.cast);
    await expect(page.locator(MEMBERS_CHIP)).toBeVisible();
    await expect(page.locator(MEMORY_CHIP)).toBeVisible();
  });

  test("a long cast and a long room name squeezed together each keep a floor and a half", async ({ corpus, mount, page }) => {
    await using renamed = await createCorpusHarness();
    const caller = await renamed.internalCallerFor(renamed.ownerId);
    const named = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
    await caller.chat.updateTitle({ chatId: named.id, title: LONG_NAME });
    for (const portrait of named.participantPortraits) {
      const character = await caller.character.get({ characterId: portrait.characterId });
      await caller.character.update({ characterId: portrait.characterId, input: { name: `${character.name} the Magnificent of Vael` } });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await seedShellState(page, BOTH_DOCKED);
    await routeRoom(page, corpus, caller);
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: named.id });
    const title = page.locator(WIDE_TITLE);
    const subtitle = page.locator(".shell-topbar-subtitle");
    await expect(subtitle).toHaveText(LONG_NAME);
    await expect(title).toContainText("the Magnificent of Vael");
    // Both halves are truncated, so the row really is sharing a budget too small for either.
    await expect.poll(() => title.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expect.poll(() => subtitle.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const floor = await titleFloor(page);
    await expect.poll(() => clientWidth(title)).toBeGreaterThanOrEqual(floor * 1.5 - 1);
    await expect.poll(() => clientWidth(subtitle)).toBeGreaterThanOrEqual(floor * 1.5 - 1);
  });

  for (const arm of [
    { width: 1280, height: 800, identity: "wide" },
    { width: 430, height: 740, identity: "narrow" },
  ] as const) {
    test(`at ${String(arm.width)} the room's ${arm.identity} title stays with the context pane open, whose band names nothing`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width: arm.width, height: arm.height });
      await seedShellState(page, { activeSection: "chats" });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      await expect(page.locator(`.shell-topbar-identity[data-identity="${arm.identity}"]`)).toHaveCount(1);
      const grid = page.locator(".shell-grid");
      await expect(grid).toHaveAttribute("data-context-mode", "collapsed");
      await expect.poll(() => visibleTitles(page)).toBe(1);
      await page.getByRole("button", { name: "Show details", exact: true }).click();
      await expect(grid).not.toHaveAttribute("data-context-mode", "collapsed");
      await expect(page.locator('[data-slot="context-bracket-header"]')).toBeVisible();
      await expect(page.locator('[data-slot="context-bracket-band"] :is(h1, h2, h3)')).toHaveCount(0);
      await expect.poll(() => visibleTitles(page)).toBe(1);
    });
  }

  test("at 430 an open member's context band names her, so the phone title steps aside until the pane closes", async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width: 430, height: 740 });
    await routeSections(page, corpus);
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await library(page).getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Back to Characters", exact: true })).toBeVisible();
    await expect.poll(() => visibleTitles(page)).toBe(1);
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await expect(page.locator('[data-slot="context-bracket-band"] h2')).toBeVisible();
    await expect.poll(() => visibleTitles(page)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-context-mode", "collapsed");
    await expect.poll(() => visibleTitles(page)).toBe(1);
  });

  for (const width of [1280, 1920]) {
    test(`at ${String(width)} the context pane's header row ends on the topbar's divider, holds the one tablist, and paints the list band's surface`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedShellState(page, BOTH_DOCKED);
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      const pane = page.locator(CONTEXT);
      const header = pane.locator('[data-slot="context-bracket-header"]');
      const band = page.locator(`${LIST} .shell-panel-header`);
      await expect(header).toBeVisible();
      await expect(band).toBeVisible();
      await expect(pane.getByRole("tablist")).toHaveCount(1);
      await expect(header.getByRole("tablist")).toHaveCount(1);
      const bottom = async (locator: Locator): Promise<number> => {
        const found = await locator.boundingBox();
        return (found?.y ?? Number.NaN) + (found?.height ?? Number.NaN);
      };
      const topbar = await bottom(page.locator(".shell-topbar"));
      await expect.poll(async () => Math.abs((await bottom(header)) - topbar)).toBeLessThanOrEqual(1);
      await expect.poll(async () => Math.abs((await bottom(band)) - topbar)).toBeLessThanOrEqual(1);
      const inside = async (locator: Locator): Promise<{ r: number; g: number; b: number }> => {
        const found = await locator.boundingBox();
        return pixel(page, Math.floor((found?.x ?? 0) + (found?.width ?? 0) - 4), Math.floor((found?.y ?? 0) + 4));
      };
      const [headerFill, bandFill] = await Promise.all([inside(header), inside(band)]);
      expect(Math.max(...(["r", "g", "b"] as const).map((channel) => Math.abs(headerFill[channel] - bandFill[channel])))).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("an open named group room on a phone, coarse pointer", () => {
  test.use({ hasTouch: true });

  for (const width of [320, 390, 430]) {
    test(`at ${String(width)} the members and memory chips stay on the row as glyphs at the touch floor, after a title that keeps its share of the row`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await seedShellState(page, { activeSection: "chats" });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      const members = page.locator(MEMBERS_CHIP);
      const memory = page.locator(MEMORY_CHIP);
      const title = page.locator(NARROW_TITLE);
      await expect(title).toHaveText(`${room.title} · ${room.cast}`);
      await expect(members).toBeVisible();
      await expect(memory).toBeVisible();
      await expect(members.locator(".shell-chat-chip-count")).toBeHidden();
      const floor = await touchTarget(page);
      const [membersBox, memoryBox, titleBox] = await Promise.all([members.boundingBox(), memory.boundingBox(), title.boundingBox()]);
      expect(titleBox?.width ?? 0).toBeGreaterThanOrEqual(narrowTitleShare(width));
      expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual((membersBox?.x ?? 0) + 1);
      expect((membersBox?.x ?? 0) + (membersBox?.width ?? 0)).toBeLessThanOrEqual((memoryBox?.x ?? 0) + 1);
      expect((memoryBox?.x ?? 0) + (memoryBox?.width ?? 0)).toBeLessThanOrEqual(width);
      for (const chip of [membersBox, memoryBox]) {
        expect(Math.min(chip?.width ?? 0, chip?.height ?? 0)).toBeGreaterThanOrEqual(floor);
      }
    });
  }

  for (const width of [320, 360, 430]) {
    test(`at ${String(width)} the room's name takes the title step over body text, ellipsed inside the row, and every control keeps the touch floor`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 });
      await seedShellState(page, { activeSection: "chats" });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      const title = page.locator(NARROW_TITLE);
      await expect(title).toBeVisible();
      await expect
        .poll(() =>
          title.evaluate((element) => {
            const style = getComputedStyle(element);
            const probe = document.createElement("span");
            // A chat's screen title is the cast, so it takes the title step rather than the display step.
            probe.style.fontSize = "var(--text-title)";
            element.append(probe);
            const step = getComputedStyle(probe).fontSize;
            probe.style.fontSize = "var(--text-body)";
            const body = getComputedStyle(probe).fontSize;
            probe.remove();
            return {
              titleStep: style.fontSize === step,
              largerThanBody: Number.parseFloat(style.fontSize) > Number.parseFloat(body),
              overflow: style.textOverflow,
              contained: element.getBoundingClientRect().right <= document.documentElement.clientWidth,
            };
          }),
        )
        .toEqual({ titleStep: true, largerThanBody: true, overflow: "ellipsis", contained: true });
      await expect(page.locator(".shell-topbar-title:visible")).toHaveCount(1);
      const floor = await touchTarget(page);
      const controls = await page.locator(".shell-topbar button:visible").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, right: rect.right };
        }),
      );
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.filter((control) => control.width < floor || control.height < floor || control.right > width)).toEqual([]);
      await page.getByRole("button", { name: "Back to Chats", exact: true }).click();
      await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    });
  }
});

test.describe("the trail is a lens over the chrome registry", () => {
  const TrailStory = "tests/client/features/app-shell/surfaces/_trail-projection-stories/AppShellTrailProjectionStory";

  test.beforeEach(async ({ corpus, page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await routeSections(page, corpus);
  });

  test("with no command trigger in the registry the trail paints no ⌘K chip", async ({ mount, page }) => {
    await mount<typeof AppShellTrailProjectionStory>(TrailStory, { includeCommand: false, widgetFirst: true });
    const trail = page.locator(".shell-topbar-trail");
    await expect(trail.getByRole("button", { name: STORY_TRAIL_WIDGET, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: JUMP_CHIP })).toHaveCount(0);
  });

  test("with the trigger present the chip takes the place the registry's order gives it", async ({ mount, page }) => {
    await mount<typeof AppShellTrailProjectionStory>(TrailStory, { includeCommand: true, widgetFirst: true });
    const trail = page.locator(".shell-topbar-trail");
    await expect(trail.getByRole("button", { name: JUMP_CHIP })).toBeVisible();
    await expect
      .poll(() => trail.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? "")))
      .toStrictEqual([STORY_TRAIL_WIDGET, expect.stringMatching(JUMP_CHIP)]);
  });
});
