// The shell's topbar on the production registry: the narrow screen name a phone reads, the ⌘K chip's name, the phone
// row's geometry at the narrowest width, the Characters band's doors moving to the trail while the list is the screen,
// and an open room's identity: its participants, its name, its chips and the context pane's header on the same horizon.
import {
  CHAT_NAME_FIELD_NAME,
  censusSuffix,
  chatRoomTitle,
  contextToggleLabel,
  LIST_PANEL_NOUN,
  panelEdgeName,
  RENAME_CHAT_NAME,
  TRAIL_OVERFLOW_LABEL,
  testId,
} from "@orb/client/lib";
import { LIST_OFF_SCREEN_HINT } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { pixel, resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import {
  createShellAmbientReads,
  holdCorpusProcedure,
  ROOM_PROCEDURES,
  routeTrpc,
  SECTION_LABELS,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { commandShortcutLabel } from "#client/features/app-shell/lib/command-shortcut-label.ts";
import { CHARACTER_IMPORT_NAME, CHARACTER_LIBRARY_NAME, CHARACTER_NEW_NAME } from "#client/features/character/lib/character-names.ts";
import { CHAT_MEMBERS_ENTRY_PREFIX } from "#client/features/chat/lib/chat-surface-names.ts";
import { EXTENSIONS_NO_SELECTION_BODY, EXTENSIONS_SEARCH_NAME } from "#client/features/plugin/lib/extensions-copy.ts";
import { NEW_PRESET_NAME } from "#client/features/preset/lib/preset-names.ts";
import { renameChatButtonIdentity } from "#client/lib/chat-rename-names.ts";
import type { AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import type { AppShellTrailProjectionStory } from "./_trail-projection-stories.tsx";
import { JUMP_CHIP, namedGroupRoom, routeRoom, routeShell, SHELL_STORIES } from "./app-shell-ct.ts";
import { STORY_TRAIL_WIDGET } from "./trail-projection.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const SHOW_LIST_PANEL_NAME = panelEdgeName(LIST_PANEL_NOUN, false);
const ROOM_STORY = `${SHELL_STORIES}/AppShellRoomStory`;
const LIST = '.shell-panel[data-panel-side="list"]';
const NARROW_TITLE = '.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title';
const NARROWEST = { width: 320, height: 800 } as const;
// The row holds the lead control, the title floor and the doors inline at 390; at 320 the doors ride its menu.
const PHONE_WIDTHS = [390] as const;
const NARROW_PHONE_WIDTH = 320;
// The screen title's least share of a phone row beside the room's two chips: a regression floor for the name, not a
// geometry token (no token sizes the title; it takes what the chips and the back control leave).
const TITLE_SHARE_NARROWEST = 0.25;
const TITLE_SHARE_PHONE = 0.38;

function narrowTitleShare(width: number): number {
  return width * (width <= NARROWEST.width ? TITLE_SHARE_NARROWEST : TITLE_SHARE_PHONE);
}

async function expectSeatedGlyph(chip: Locator, floor: number, width: number): Promise<void> {
  const box = await chip.boundingBox();
  expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(floor);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  await expect(chip.locator(".shell-chat-chip-count")).toBeHidden();
}

async function expectMenuItem(page: Page, prefix: string): Promise<void> {
  await page.locator(".shell-topbar-trail").getByRole("button", { name: TRAIL_OVERFLOW_LABEL, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: new RegExp(`^${prefix}`, "u") })).toBeVisible();
  await page.keyboard.press("Escape");
}

/** A trail entry either sits in the row as a glyph at the touch floor inside the viewport, or the row moved it into the overflow menu, where its item is offered. */
async function expectSeatedGlyphOrMenuItem(page: Page, entry: TrailEntry, floor: number, width: number): Promise<void> {
  const chip = page.locator(`.shell-topbar-trail ${entry.chip}`);
  const seated = (await chip.count()) > 0 && (await chip.evaluate((node) => node.closest("[inert]") === null));
  await (seated ? expectSeatedGlyph(chip, floor, width) : expectMenuItem(page, entry.prefix));
}

interface TrailEntry {
  readonly chip: string;
  readonly prefix: string;
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
  return page.locator(LIST).getByRole("list", { name: CHARACTER_LIBRARY_NAME });
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
  return page.evaluate((sizeTouchTarget) => {
    const probe = document.createElement("div");
    probe.style.width = `var(${sizeTouchTarget})`;
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, TOKENS["size.touch-target"].cssVar);
}

/** The Extensions section with `pages` registered plugin pages, served through the production shell. */
async function routePluginPages(page: Page, corpus: CorpusPlayback, pages: number): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const viewer = await caller.sessions.me();
  const plugin = makePluginRow({ slug: "oracle-deck", name: "Oracle Deck" });
  const surfaces: TrpcWireOutput<"plugin.listSurfaces"> = Array.from({ length: pages }, (_unused, index) => ({
    pluginId: plugin.id,
    id: `deck_page_${String(index)}`,
    anchor: "page",
    title: `Deck ${String(index)}`,
    tier: "static",
  }));
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, viewer.userId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => surfaces,
  });
  await seedShellState(page, { activeSection: "extensions" });
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
    await expect(title).toHaveText(`${label}${censusSuffix(census)}`);
    const first = library(page).getByRole("button").first();
    const name = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await first.click();
    await held.requested;
    await expect(title).toHaveText(label);
    held.release();
    await expect(title).toHaveText(name);
  });

  test("the Plugin pages screen name carries the registered page count beside the section noun", async ({ corpus, mount, page }) => {
    await routePluginPages(page, corpus, 2);
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(NARROW_TITLE)).toHaveText(`${SECTION_LABELS.extensions}${censusSuffix(2)}`);
  });

  test("with no plugin page registered the screen name is the bare section noun", async ({ corpus, mount, page }) => {
    await routePluginPages(page, corpus, 0);
    await mount<typeof AppShellStory>(STORY, {});
    await expect(page.locator(NARROW_TITLE)).toHaveText(SECTION_LABELS.extensions);
  });

  test("a Plugin pages finder that matches nothing keeps the library total in the screen name", async ({ corpus, mount, page }) => {
    await routePluginPages(page, corpus, 3);
    await mount<typeof AppShellStory>(STORY, {});
    const title = page.locator(NARROW_TITLE);
    await expect(title).toHaveText(`${SECTION_LABELS.extensions}${censusSuffix(3)}`);
    await page.getByLabel(EXTENSIONS_SEARCH_NAME).fill("no page has this name");
    await expect(title).toHaveText(`${SECTION_LABELS.extensions}${censusSuffix("0 of 3")}`);
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
      expect(offset).toBeLessThan(await resolvedLength(page, `var(${TOKENS["dimension.chrome-row"].cssVar})`));
      await expect(page.locator(`${LIST} .shell-panel-header`)).toBeHidden();
      const trail = page.locator(".shell-topbar-trail");
      await expect(trail.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeVisible();
      await expect(trail.getByRole("button", { name: CHARACTER_IMPORT_NAME })).toBeVisible();
      expect((await page.locator('.shell-topbar-identity[data-identity="narrow"]').boundingBox())?.width ?? 0).toBeGreaterThan(0);
      await library(page).getByRole("button").first().click();
      await expect(trail.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toHaveCount(0);
    });
  }

  test("at 320 the Characters trail keeps New and folds Import into its menu, not past the row's edge, until a character opens", async ({
    corpus,
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_PHONE_WIDTH, height: 800 });
    await routeSections(page, corpus);
    await seedShellState(page, { activeSection: "characters" });
    await mount<typeof AppShellStory>(STORY, {});
    await expect(library(page).getByRole("button").first()).toBeVisible();
    const trail = page.locator(".shell-topbar-trail");
    await expect(trail.getByRole("button", { name: CHARACTER_NEW_NAME, exact: true })).toBeVisible();
    await expect(trail.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true })).toBeHidden();
    await trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL }).click();
    await expect(page.getByRole("menuitem", { name: CHARACTER_IMPORT_NAME, exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: CHARACTER_NEW_NAME, exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await library(page).getByRole("button").first().click();
    await expect(trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL })).toHaveCount(0);
  });
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
  await expect(chip).toHaveAccessibleName(`Jump, the command menu (${shortcut})`);
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
    // The trail row drops the doors the push retired a frame after the push, so the lead's room is read once it settles.
    await expect
      .poll(async () => {
        const settled = await page.locator(".shell-topbar-lead").boundingBox();
        const roomForName = (settled?.width ?? 0) - widest;
        return roomForName > widest && roomForName / NARROWEST.width > 0.3;
      })
      .toBe(true);
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
    await expect(title).toHaveText(new RegExp(`^${RegExp.escape(SECTION_LABELS.characters)}\\b`, "u"));
    const first = library(page).getByRole("button").first();
    const memberName = ((await first.locator('[data-slot="list-row-title"]').textContent()) ?? "").trim();
    await pushMember(page);
    await expect(title).toHaveText(memberName);
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });
});

const WIDE_IDENTITY = '.shell-topbar-identity[data-identity="wide"]';
const WIDE_TITLE = '.shell-topbar-identity[data-identity="wide"] .shell-topbar-title';
const MEMBERS_PREFIX = CHAT_MEMBERS_ENTRY_PREFIX;
const MEMORY_PREFIX = "Memory: ";
const MEMBERS_CHIP = `[aria-label^="${MEMBERS_PREFIX}"]`;
const MEMORY_CHIP = `[aria-label^="${MEMORY_PREFIX}"]`;
const TRAIL_ENTRIES = [
  { chip: MEMBERS_CHIP, prefix: MEMBERS_PREFIX },
  { chip: MEMORY_CHIP, prefix: MEMORY_PREFIX },
] as const;
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const BOTH_DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
const ROOM_MOUNTING = '[data-slot="chat-room-mounting"]';
const LIST_PANE = '[data-panel-side="list"]';
const LIST_SEARCH = `${LIST_PANE} input`;
const ROOM_BODY = '[data-slot="chat-room-surface"] textarea';
const ACTED_DURING_MOUNT = "data-acted-during-mount";
const LONG_NAME = "The Extraordinarily Long Saga of the Ninth Epoch Beneath the Violet Braziers";

type RoomCaller = Awaited<ReturnType<Root["internalCallerFor"]>>;

function ownerCaller(): Promise<RoomCaller> {
  return root.internalCallerFor(root.ownerId);
}

async function openNamedRoom(
  page: Page,
  corpus: CorpusPlayback,
  caller: RoomCaller,
): Promise<{ readonly id: ChatId; readonly title: string; readonly cast: string; readonly screenTitle: string }> {
  const room = namedGroupRoom((await caller.chat.listChats({ limit: 100 })).items);
  await routeRoom(page, corpus, caller);
  return { id: room.id, title: room.title ?? "", cast: room.participantNames.join(", "), screenTitle: chatRoomTitle(room.title, room.participantNames) };
}

/** The title floor resolved in the title group's own font, where `ch` takes its size. */
function titleFloor(page: Page): Promise<number> {
  return page
    .locator(".shell-topbar-title-group")
    .first()
    .evaluate((group, dimensionShellTitleFloor) => {
      const probe = document.createElement("span");
      probe.style.width = `var(${dimensionShellTitleFloor})`;
      probe.style.flex = "none";
      group.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    }, TOKENS["dimension.shell-title-floor"].cssVar);
}

function visibleTitles(page: Page): Promise<number> {
  return page.evaluate(() => [...document.querySelectorAll(".shell-topbar-title")].filter((element) => element.checkVisibility()).length);
}

function clientWidth(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.clientWidth);
}

async function expectPrimaryRoomHeading(page: Page, title: string): Promise<void> {
  const main = page.getByRole("main", { name: "Chats content", exact: true });
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  const surface = main.locator('[data-slot="chat-room-surface"]');
  await expect(surface).toHaveAccessibleName(title);
  await expect(surface.getByRole("heading", { level: 1, name: title, exact: true })).toHaveCount(1);
}

/** The docked list over a settled room, and the title of a second room to switch to. */
async function settledRoomBesideList(page: Page, corpus: CorpusPlayback, mountRoom: (chatId: ChatId) => Promise<unknown>): Promise<Locator> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
  const caller = await ownerCaller();
  const room = await openNamedRoom(page, corpus, caller);
  await mountRoom(room.id);
  await expectPrimaryRoomHeading(page, room.title);
  const rows = (await caller.chat.listChats({ limit: 100 })).items.map((row) => chatRoomTitle(row.title, row.participantNames));
  const other = rows.find((title) => title !== room.screenTitle);
  if (other === undefined) {
    throw new Error("The corpus needs a second room");
  }
  return page.locator(LIST_PANE).getByText(other, { exact: true }).first();
}

/** Acts on `selector` at the first mutation that shows the entered room's body still mounting. */
async function actDuringNextRoomMount(page: Page, selector: string, act: "click" | "focus"): Promise<void> {
  await page.evaluate(
    ({ target, action, mounting, witness }) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector(mounting) !== null) {
          observer.disconnect();
          document.documentElement.setAttribute(witness, "true");
          document.querySelector<HTMLElement>(target)?.[action]();
        }
      });
      observer.observe(document, { subtree: true, childList: true });
    },
    { target: selector, action: act, mounting: ROOM_MOUNTING, witness: ACTED_DURING_MOUNT },
  );
}

async function expectRoomMounted(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(ACTED_DURING_MOUNT, "true");
  await expect(page.locator(ROOM_MOUNTING)).toHaveCount(0);
}

test.describe("arrival focus on a room switch", () => {
  test("a plain switch from the list lands focus in the entered room", async ({ corpus, mount, page }) => {
    const other = await settledRoomBesideList(page, corpus, (chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }));
    await other.click();
    await expect(page.locator(ROOM_MOUNTING)).toHaveCount(0);
    const surface = page.locator('[data-slot="chat-room-surface"]');
    await expect.poll(() => surface.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  });

  test("the list search focused while the room body mounts keeps its focus and its typing", async ({ corpus, mount, page }) => {
    const other = await settledRoomBesideList(page, corpus, (chatId) => mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId }));
    const search = page.locator(LIST_SEARCH);
    await actDuringNextRoomMount(page, LIST_SEARCH, "focus");
    await other.click();
    await expectRoomMounted(page);
    await expect(page.locator(ROOM_BODY)).toBeVisible();
    await expect(search).toBeFocused();
    await page.keyboard.type("harbour");
    await expect(search).toHaveValue("harbour");
  });
});

test.describe("an open named group room", () => {
  test.describe("room heading at 1440", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the room keeps its primary heading while the painted rename control is editing and after cancellation", async ({ corpus, mount, page }) => {
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      await expectPrimaryRoomHeading(page, room.title);
      const rename = page.getByRole("button", { name: renameChatButtonIdentity(room.cast, room.title) });
      await rename.click();
      await expect(page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true })).toBeFocused();
      await expectPrimaryRoomHeading(page, room.title);
      await page.keyboard.press("Escape");
      await expect(rename).toBeFocused();
      await expectPrimaryRoomHeading(page, room.title);
    });
  });

  test("a rename opened while the room body is still mounting keeps its field and the words typed into it", async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
    const room = await openNamedRoom(page, corpus, await ownerCaller());
    // A pointer cannot land inside one commit gap on demand, so the click runs at the mutation that paints the title.
    await page.addInitScript(
      ({ button, mounting, witness }) => {
        const observer = new MutationObserver(() => {
          const control = document.querySelector<HTMLElement>(button);
          if (control !== null) {
            observer.disconnect();
            document.documentElement.setAttribute(witness, String(document.querySelector(mounting) !== null));
            control.click();
          }
        });
        observer.observe(document, { subtree: true, childList: true });
      },
      { button: `button[aria-label^="${RENAME_CHAT_NAME}"]`, mounting: ROOM_MOUNTING, witness: ACTED_DURING_MOUNT },
    );
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
    await expect(page.locator("html")).toHaveAttribute(ACTED_DURING_MOUNT, "true");
    await expect(page.locator(ROOM_MOUNTING)).toHaveCount(0);
    const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.type("The harbour job");
    await expect(field).toHaveValue("The harbour job");
  });

  for (const [name, rootPx] of [
    ["100%", 16],
    ["125%", 20],
  ] as const) {
    test(`the rename field of the shortest unnamed room keeps its own floor inside the frozen title group at ${name}`, async ({ corpus, mount, page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      const caller = await ownerCaller();
      const unnamed = (await caller.chat.listChats({ limit: 100 })).items.filter((row) => (row.title ?? "") === "");
      const room = unnamed.toSorted((a, b) => a.participantNames.join(", ").length - b.participantNames.join(", ").length)[0];
      if (room === undefined) {
        throw new Error("The corpus has no unnamed room");
      }
      await routeShell(page, corpus, caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]);
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      await page.evaluate((px) => {
        document.documentElement.style.fontSize = `${px}px`;
      }, rootPx);
      await page.getByRole("button", { name: RENAME_CHAT_NAME }).click();
      const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
      await expect(field).toBeFocused();
      await page.keyboard.type("The harbour job");
      await expect.poll(() => field.evaluate((element) => element.clientWidth >= Number.parseFloat(getComputedStyle(element).minWidth) - 1)).toBe(true);
      const group = page.locator(".shell-topbar-title-group").filter({ has: field });
      await expect
        .poll(async () => {
          const [within, box] = await Promise.all([group.boundingBox(), field.boundingBox()]);
          return within !== null && box !== null && box.x >= within.x - 1 && box.x + box.width <= within.x + within.width + 1;
        })
        .toBe(true);
    });
  }

  test.describe("room heading at 390", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("the room keeps its primary heading when the narrow identity replaces the rich header", async ({ corpus, mount, page }) => {
      await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      await expectPrimaryRoomHeading(page, room.title);
      await expect(page.locator(NARROW_TITLE)).toHaveText(room.screenTitle);
      await expect(page.locator(WIDE_TITLE)).toBeHidden();
    });
  });

  test("the creation date is in the rename button's name and stays there after keyboard cancellation", async ({ corpus, mount, page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
    const room = await openNamedRoom(page, corpus, await ownerCaller());
    await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
    const rename = page.getByRole("button", { name: renameChatButtonIdentity(room.cast, room.title) });
    const date = rename.locator(".shell-topbar-date");
    await expect(date).toBeVisible();
    await expect(date).toHaveText(/^· .+/u);
    const stamp = ((await date.textContent()) ?? "").replace(/^· /u, "");
    await expect(rename).toHaveAccessibleName(new RegExp(`, ${stamp}$`, "u"));
    await date.click();
    const input = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(rename).toBeFocused();
    await expect(rename).toHaveAccessibleName(new RegExp(`, ${stamp}$`, "u"));
  });

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
      .toContain(RENAME_CHAT_NAME);
    await page.mouse.click(centre.x, centre.y);
    const input = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME });
    await expect(input).toBeVisible();
    await expect.poll(() => clientWidth(input)).toBeGreaterThanOrEqual(await titleFloor(page));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: contextToggleLabel(false), exact: true }).click();
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
      await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
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
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
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
      // The pane's skeleton row stands beside the resolved one until the chat's tabs arrive; the tablist is the settled state.
      await expect(pane.getByRole("tablist")).toHaveCount(1);
      await expect(header).toBeVisible();
      await expect(band).toBeVisible();
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
    test(`at ${String(width)} the members and memory entries sit in the trail as glyphs at the touch floor, or in its overflow menu, after a title that keeps its share of the row`, async ({
      corpus,
      mount,
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await seedShellState(page, { activeSection: "chats" });
      const room = await openNamedRoom(page, corpus, await ownerCaller());
      await mount<typeof AppShellRoomStory>(ROOM_STORY, { chatId: room.id });
      const trail = page.locator(".shell-topbar-trail");
      const title = page.locator(NARROW_TITLE);
      await expect(title).toHaveText(`${room.title} · ${room.cast}`);
      const floor = await touchTarget(page);
      const titleBox = await title.boundingBox();
      expect(titleBox?.width ?? 0).toBeGreaterThanOrEqual(narrowTitleShare(width));
      // Each entry is a glyph chip in the trail inside the row, or it has moved into the "More top bar actions" menu.
      for (const entry of TRAIL_ENTRIES) {
        await expectSeatedGlyphOrMenuItem(page, entry, floor, width);
      }
      await expect(trail.getByRole("button", { name: TRAIL_OVERFLOW_LABEL, exact: true }).or(trail.locator(MEMBERS_CHIP))).toBeVisible();
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
          title.evaluate(
            (element, { textTitle, textBody }) => {
              const style = getComputedStyle(element);
              const probe = document.createElement("span");
              // A chat's screen title is the cast, so it takes the title step rather than the display step.
              probe.style.fontSize = `var(${textTitle})`;
              element.append(probe);
              const step = getComputedStyle(probe).fontSize;
              probe.style.fontSize = `var(${textBody})`;
              const body = getComputedStyle(probe).fontSize;
              probe.remove();
              return {
                titleStep: style.fontSize === step,
                largerThanBody: Number.parseFloat(style.fontSize) > Number.parseFloat(body),
                overflow: style.textOverflow,
                contained: element.getBoundingClientRect().right <= document.documentElement.clientWidth,
              };
            },
            { textTitle: TOKENS["text.title"].cssVar, textBody: TOKENS["text.body"].cssVar },
          ),
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

test.describe("a library section with its list pane hidden or docked at 1280", () => {
  test.beforeEach(async ({ corpus, page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await routeSections(page, corpus);
  });

  test("Chats with no room open names itself in the topbar while its list is hidden, and leaves the name to the list band while it is docked", async ({
    mount,
    page,
  }) => {
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const identity = page.locator(WIDE_IDENTITY);
    await expect(identity).toHaveText(SECTION_LABELS.chats);
    await page.getByRole("button", { name: SHOW_LIST_PANEL_NAME, exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(identity).toHaveText("");
  });

  test("Plugin pages with nothing picked names no side, and names the way back to the list only while the list is hidden", async ({ corpus, mount, page }) => {
    await routePluginPages(page, corpus, 2);
    await seedShellState(page, { activeSection: "extensions", panelOverrides: { extensions: { list: "collapsed", context: "collapsed" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const description = page.getByTestId(testId("extensionsContent")).locator('[data-slot="empty-state-description"]');
    await expect(description).toHaveText(`${EXTENSIONS_NO_SELECTION_BODY}${LIST_OFF_SCREEN_HINT}`);
    await page.getByRole("button", { name: SHOW_LIST_PANEL_NAME, exact: true }).click();
    await expect(page.locator(LIST)).toHaveAttribute("data-panel-mode", "docked");
    await expect(description).toHaveText(EXTENSIONS_NO_SELECTION_BODY);
  });

  test("the Presets landing teaches at the shared empty-state step and ends on the New preset door", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "presets", panelOverrides: { presets: { list: "docked", context: "collapsed" } } });
    await mount<typeof AppShellStory>(STORY, {});
    const content = page.getByRole("main", { name: "Presets content", exact: true });
    await expect(content.getByRole("button", { name: NEW_PRESET_NAME, exact: true })).toBeVisible();
    const titleSize = await content.locator('[data-slot="empty-state-title"]').evaluate((title) => Number.parseFloat(getComputedStyle(title).fontSize));
    expect(titleSize).toBeLessThan(await resolvedLength(page, `var(${TOKENS["text.display"].cssVar})`));
  });
});
