// CT: the Chats-section LIST surface end-to-end (UIP-301/302/303 + J5). Drives the PRODUCTION path —
// `chat.listChats` (routeTrpc, the KEYSET page `chatListResponder` serves) → `useChatListCollection`'s
// non-suspending `useInfiniteQuery` → the `@orb/ui/list-row` rows inside `<VirtualList>`. Asserts: rows
// render (title + participant names); selecting a row fires `onSelect` with the chat id; the empty-state New
// button fires `onNewChat` (the header New moved to the LIST chrome band — chat-list-header.tsx); the search
// field narrows via the SERVER query; the active row paints `aria-current`; the per-row kebab opens the
// actions menu; an empty list shows its own state; and a deep scroll never evicts the head page.
//
// Also pins F7 (visual-blech audit): a real participant PORTRAIT, the initials fallback when a seat has
// none, and the star/archived state markers. The portraits ride the ROW now (#192,
// `ChatSummary.participantPortraits`) — there is no whole-library `character.list` map to resolve them
// against, which is why the fixtures below carry seats rather than a character catalogue.
//
// NOTE (mirrors the other surface CTs): `trpc.chat.listChats` is stubbed at the NETWORK (routeTrpc) — the
// tRPC proxy builds the path structurally, so the CT runs regardless of the transport verb landing.
//
// `CHAT_ROOM_ROUTES` is AMBIENT to every mount here since #1180: a row WARMS the room it opens
// (`useWarmRoomOnIntent` — `chat.getChat` leaves on a fine pointer RESTING on the row, on any pointer
// pressing it, or on keyboard focus), so any test that hovers, clicks or tabs a row requests the roster
// key. Fed at its honest empty default rather than left to `routeTrpc`'s null, so the warm-up runs for
// real. `chat.getChat` ONLY — the owner refused warming `chat.listMessages` too (the measured trade is in
// `use-prefetch-room.ts`); the map's `listMessages` row rides along because the two are one feed.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { expectInstrumentTierLive } from "../../../../support/ct/tier-liveness.ts";
import { ChatListBandAndSurfaceStory, ChatListHeaderStory, ChatListSurfaceStory } from "../_ct-stories.tsx";
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary, makeSeatPortrait } from "../fixtures.ts";

const RAW_MONTH_COPY = /2020-06/u;
const ARIA_SEAT = makeSeatPortrait("char_aria", "Aria Nightshade", "hash_aria");
const ADVENTURE = makeChatSummary({
  id: "chat_adventure",
  title: "A grand adventure",
  participantNames: ["Aria Nightshade"],
  participantCharacterIds: ["char_aria"],
  participantPortraits: [ARIA_SEAT],
});
const UNTITLED = makeChatSummary({
  id: "chat_untitled",
  title: null,
  participantNames: [],
});
// The two scent fields: the server-resolved snippet (long enough that it MUST clip) + the game marker.
const GAME = makeChatSummary({
  id: "chat_game",
  title: "The Ashfell run",
  participantNames: ["Aria Nightshade"],
  lastMessagePreview: "The door gives way and the market noise floods in from the street beyond, louder than anything you have…",
  isGame: true,
});
// #863(f) — the PAUSED game row: the game exists, it is switched off, and the list is the only place a
// host can see that a room has a game sleeping in it (the off-door lives behind a host-only tab in a pane
// that ships closed).
const PAUSED_GAME = makeChatSummary({ id: "chat_game_paused", title: "The dormant delve", isGame: false, gamePaused: true });
// F7 state rows: the summary already carries starred/archived — the row must SHOW them.
const STARRED = makeChatSummary({ id: "chat_starred", title: "A pinned thread", starred: true });
const ARCHIVED = makeChatSummary({ id: "chat_archived", title: "A shelved thread", archived: true });

function datedChatListResponder(all: readonly ReturnType<typeof makeChatSummary>[]): (input: unknown) => unknown {
  return (input: unknown): unknown => {
    const beforeRecencyAt = (input as { beforeRecencyAt?: number } | undefined)?.beforeRecencyAt;
    const scoped = beforeRecencyAt === undefined ? all : all.filter((chat) => (chat.lastMessageAt ?? chat.updatedAt) < beforeRecencyAt);
    return chatListResponder(scoped)(input);
  };
}

function resolvedPx(component: Page, token: string): Promise<number> {
  return component.evaluate((name: string) => {
    const probe = document.createElement("div");
    probe.style.height = `var(${name})`;
    document.body.append(probe);
    const value = Number.parseFloat(getComputedStyle(probe).height);
    probe.remove();
    return value;
  }, token);
}

// A 3-seat room — D3: it must lead with an AvatarStack, not borrow one member's portrait.
const GROUP = makeChatSummary({
  id: "chat_group",
  title: "The Crimson Court",
  participantNames: ["Aria Nightshade", "Sera", "Niko"],
  participantCharacterIds: ["char_aria", "char_sera", "char_niko"],
  participantPortraits: [ARIA_SEAT, makeSeatPortrait("char_sera", "Sera"), makeSeatPortrait("char_niko", "Niko")],
});

// The character library the OVERFLOW PICKER lists (`FaceStrip`'s "filter by another character" tile). It no
// longer feeds any portrait: since #192 a row's faces are on the row.
const CHARACTERS = {
  items: [
    { id: "char_aria", name: "Aria Nightshade", avatarHash: "hash_aria" },
    { id: "char_faceless", name: "Faceless", avatarHash: null },
    { id: "char_sera", name: "Sera", avatarHash: null },
    { id: "char_niko", name: "Niko", avatarHash: null },
  ],
};
const AVATAR_IMAGE = '[data-slot="avatar-image"]';
const AVATAR_STACK = '[data-slot="avatar-stack-root"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const SUBTITLE = '[data-slot="list-row-subtitle"]';
const MARKERS = '[data-slot="list-row-markers"]';
const CONTENT = '[data-slot="list-row-content"]';
/** A real LIST pane width — the row's width budget is only observable at one. */
const PANE_WIDTH = 290;
/** What the row's LEADING zone legitimately costs the text column: the 32px portrait + the row's gap + its
 *  inline padding + the selection bar. Everything else belongs to the title/subtitle at rest. */
const LEADING_BUDGET_PX = 60;
const ARIA_BLOB_RE = /\/api\/blob\/hash_aria$/u;
/** The archived row's receded skin — the visual reinforcement of the "Archived" text datum. */
const RECEDED_RE = /opacity-60/u;
const RECENT_ROW_RE = /^Recent /u;
/** A PRESSED star toggle's accessible name (§12 — the un-set verb names the on state). */
const ANY_PRESSED_STAR = /^Unstar /u;
// Base UI's Avatar mounts `avatar-image` only once the image reaches "loaded" status, so the blob route is
// fulfilled with a real 1×1 PNG (the message-row.ct.tsx precedent).
const ONE_BY_ONE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// EXACT row names — the row button's accessible name is now the TITLE ALONE (finding #1: subtitle rides
// aria-describedby, not the name). A loose /regex/ would ALSO match the per-row kebab, whose label is now
// "Chat actions for <title>" (finding #4), so pin the row by its exact name.
const ADVENTURE_ROW = "A grand adventure";
const UNTITLED_ROW = "Untitled chat";

// ACTION names carry the row's own recency stamp after the title (side-eye P3a — N rows titled "Azarael"
// in the character projection produced N identical menu names). The stamp is clock-relative, so the CTs pin
// the SHAPE (a prefix) and the DISTINCTNESS, never the literal elapsed text.
const ADVENTURE_MENU = /^Chat actions for "A grand adventure" · /u;
const ADVENTURE_STAR = /^Star "A grand adventure" · /u;
const PINNED_UNSTAR = /^Unstar "A pinned thread" · /u;

test("renders each chat row (title + participant names), with a fallback title/subtitle", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("A grand adventure")).toBeVisible();
  // Scoped to the ROWS: since #192 the faces strip above them resolves off the same chat page, so it prints
  // her caption too — the assertion is about the row's identity line, not about who else says her name.
  await expect(component.locator(LIST_ROW_ROOT).getByText("Aria Nightshade")).toBeVisible();
  // The null-title / empty-roster row falls back to honest placeholders.
  await expect(page.getByText("Untitled chat")).toBeVisible();
  await expect(page.getByText("No characters")).toBeVisible();
});

test("selecting a row fires onSelect with that chat's id", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await component.getByText("A grand adventure").click();

  await expect(page.getByTestId("selected")).toHaveText("chat_adventure");
});

test("the empty-state New button fires onNewChat (the J2 picker trigger)", async ({ mount, page }) => {
  // The header New moved to the LIST chrome band (`chat-list-header.tsx`, north-star §4 N2) — outside this
  // surface. The surface's own `onNewChat` wiring now lives on the empty-state News, exercised here.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(page.getByTestId("new-count")).toHaveText("0");
  await component.getByRole("button", { name: "New chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("the search field narrows the rows — the predicate rides the SERVER query, not a client pass", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByRole("textbox", { name: "Search chats" }).fill("aria");
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(page.getByText("Untitled chat")).toBeHidden();
  // The term REACHED THE SERVER (2026-08-09): a client `.filter()` over the loaded page would narrow the same
  // rows here and be blind to every chat past the keyset, so "the right rows are showing" is not the assertion
  // that distinguishes the two — the wire input is.
  await expect.poll(() => trpc.inputs("chat.listChats").some((i) => (i as { search?: string } | undefined)?.search === "aria")).toBe(true);
});

test("jumping to a month resets loaded pages and lands its newest old row without a deep wheel walk", async ({ mount, page }) => {
  const recent = Array.from({ length: 70 }, (_unused, at) => {
    const recencyAt = Date.UTC(2026, 6, 1) - at;
    return makeChatSummary({ id: `chat_recent_${String(at)}`, title: `Recent ${String(at).padStart(3, "0")}`, lastMessageAt: recencyAt, updatedAt: recencyAt });
  });
  const old = Array.from({ length: 10 }, (_unused, at) => {
    const recencyAt = Date.UTC(2020, 5, 20) - at;
    return makeChatSummary({
      id: `chat_old_${String(at)}`,
      title: at === 0 ? "June 2020 anchor" : `Old ${String(at).padStart(3, "0")}`,
      lastMessageAt: recencyAt,
      updatedAt: recencyAt,
    });
  });
  const trpc = await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": datedChatListResponder([...recent, ...old]),
    "character.list": { items: [], nextCursor: null },
  });
  const component = await mount(<ChatListSurfaceStory />);

  const list = component.getByRole("list", { name: "Chats list" });
  await list.hover();
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, EVICTION_SCROLL_STEP_PX);
      return trpc.inputs("chat.listChats").filter((input) => (input as { cursor?: unknown } | undefined)?.cursor !== undefined).length;
    }, evictionPoll())
    .toBeGreaterThan(0);

  const month = component.getByLabel("Show chats up to");
  await month.fill("2020-06");

  await expect(component.getByText("June 2020 anchor")).toBeVisible();
  await expect(component.getByText(RECENT_ROW_RE)).toHaveCount(0);
  await expect
    .poll(() => trpc.inputs("chat.listChats").some((input) => (input as { beforeRecencyAt?: number } | undefined)?.beforeRecencyAt === Date.UTC(2020, 6, 1)))
    .toBe(true);

  const clear = component.getByRole("button", { name: "Clear the month" });
  await expect
    .poll(
      async () => {
        await page.keyboard.press("Tab");
        return clear.evaluate((element) => element.ownerDocument.activeElement === element);
      },
      { intervals: [20, 20, 20, 20], timeout: 2000 },
    )
    .toBe(true);
  await clear.press("Enter");
  await expect(month).toHaveValue("");
  await expect(component.getByText("Recent 000")).toBeVisible();
});

test.describe("date jump coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the native month field and clear action meet the resolved tap floor", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<ChatListSurfaceStory width={320} />);

    const month = component.getByLabel("Show chats up to");
    await month.fill("2020-06");
    const clear = component.getByRole("button", { name: "Clear the month" });
    const floor = await resolvedPx(page, "--spacing-touch-target");
    const [searchBox, monthBox, clearBox] = await Promise.all([
      component.getByRole("textbox", { name: "Search chats" }).boundingBox(),
      month.boundingBox(),
      clear.boundingBox(),
    ]);

    expect(monthBox?.height ?? 0).toBeGreaterThanOrEqual(floor);
    expect(clearBox?.height ?? 0).toBeGreaterThanOrEqual(floor);
    expect(monthBox?.x ?? -1).toBeGreaterThanOrEqual(searchBox?.x ?? 0);
    expect((clearBox?.x ?? 0) + (clearBox?.width ?? 0)).toBeLessThanOrEqual((searchBox?.x ?? 0) + (searchBox?.width ?? 0));
  });

  test("compact month scope change gives every virtual row one positioned box and ownership of its own centre", async ({ mount, page }) => {
    const old = Array.from({ length: 30 }, (_unused, at) => {
      const recencyAt = Date.UTC(2020, 5, 30) - at;
      return makeChatSummary({
        id: `chat_compact_${String(at)}`,
        title: `Compact old ${String(at).padStart(2, "0")}`,
        lastMessageAt: recencyAt,
        updatedAt: recencyAt,
      });
    });
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder(old), "character.list": { items: [], nextCursor: null } });
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<ChatListSurfaceStory width={430} />);
    await component.evaluate((root) => {
      root.classList.add("shell-grid");
      root.setAttribute("data-density", "compact");
    });
    const scroll = component.locator('[data-slot="virtual-list-scroll"]');
    await scroll.evaluate((node) => node.setAttribute("data-remount-probe", "preserved"));

    await component.getByLabel("Show chats up to").fill("2020-06");
    await expect(component.getByText("Compact old 00")).toBeVisible();
    await expect(scroll).toHaveAttribute("data-remount-probe", "preserved");

    const expectOwnedGeometry = async (): Promise<void> => {
      const geometry = await component.locator('[data-slot="virtual-list-row"]').evaluateAll((rows) => {
        const scrollBox = rows[0]?.closest('[data-slot="virtual-list-scroll"]')?.getBoundingClientRect();
        const viewportBox = rows[0]?.closest('[data-slot="virtual-list-viewport"]')?.getBoundingClientRect();
        return rows.map((row) => {
          const box = row.getBoundingClientRect();
          const body = row.querySelector<HTMLElement>('[data-slot="list-row-body"]');
          const centreY = box.y + box.height / 2;
          return {
            index: Number(row.getAttribute("data-index")),
            top: row.getAttribute("style"),
            y: box.y,
            scrollBoxExists: scrollBox !== undefined,
            viewportHasHeight: (viewportBox?.height ?? 0) > 0,
            centreIsVisible: scrollBox !== undefined && centreY >= scrollBox.top && centreY <= scrollBox.bottom,
            ownsCentre: document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-slot="list-row-body"]') === body,
          };
        });
      });
      expect(geometry.length).toBeGreaterThan(1);
      expect(geometry.every((row) => row.scrollBoxExists && row.viewportHasHeight)).toBe(true);
      expect(geometry.filter((row) => row.top?.includes("top:") !== true)).toEqual([]);
      expect(new Set(geometry.map((row) => row.y)).size).toBe(geometry.length);
      const visibleGeometry = geometry.filter((row) => row.centreIsVisible);
      expect(visibleGeometry.length).toBeGreaterThan(1);
      expect(visibleGeometry.filter((row) => !row.ownsCentre)).toEqual([]);
      expect(geometry.find((row) => row.index === 0)?.ownsCentre).toBe(true);
    };
    await expect(expectOwnedGeometry).toPass();
    await expect(scroll).toHaveJSProperty("scrollTop", 0);

    const firstRow = component.locator('[data-slot="virtual-list-row"][data-index="0"]');
    await expect.poll(async () => firstRow.boundingBox()).not.toBeNull();
    const firstBox = await firstRow.boundingBox();
    await page.mouse.click((firstBox?.x ?? 0) + (firstBox?.width ?? 0) / 2, (firstBox?.y ?? 0) + (firstBox?.height ?? 0) / 2);
    await expect(component.getByTestId("selected")).toHaveText("chat_compact_0");
  });
});

test.describe("#372 coarse chat-list header target", () => {
  test.use({ hasTouch: true });

  for (const width of [430, 390, 320] as const) {
    test(`@${String(width)}: transcript import is a contained 44px coarse target`, async ({ mount, page }) => {
      await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<ChatListHeaderStory width={width} />);
      const header = component.locator(".shell-panel-header");
      const button = component.getByRole("button", { name: "Import a chat transcript" });
      const [headerBox, buttonBox] = await Promise.all([header.boundingBox(), button.boundingBox()]);

      expect(headerBox).not.toBeNull();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(buttonBox?.x ?? -1).toBeGreaterThanOrEqual(headerBox?.x ?? 0);
      expect((buttonBox?.x ?? 0) + (buttonBox?.width ?? 0)).toBeLessThanOrEqual((headerBox?.x ?? 0) + (headerBox?.width ?? 0));
    });
  }
});

test("#372 keeps the accessible import control compact at a fine pointer", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
  const component = await mount(<ChatListHeaderStory width={320} />);
  const button = component.getByRole("button", { name: "Import a chat transcript" });
  await expect.poll(async () => button.boundingBox()).not.toBeNull();
  const readBoxAtAssertion = async (): Promise<typeof box> => await button.boundingBox();
  const box = await button.boundingBox();
  await expect.poll(async () => (await readBoxAtAssertion())?.width).toBe(32);
  await expect.poll(async () => (await readBoxAtAssertion())?.height).toBe(32);
});

for (const trigger of ["hover", "focus"] as const) {
  test(`#377 ${trigger}: transcript import exposes tooltip copy byte-equal to its accessible name`, async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });
    const component = await mount(<ChatListHeaderStory width={430} />);
    const button = component.getByRole("button", { name: "Import a chat transcript" });

    if (trigger === "hover") {
      await button.hover();
    } else {
      await button.focus();
    }

    await expect(page.getByRole("tooltip")).toHaveText("Import a chat transcript");
    await expect(button).toHaveAccessibleName("Import a chat transcript");
  });
}

test("the icon-only month clear exposes pointer copy byte-equal to its accessible name", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await component.getByLabel("Show chats up to").fill("2020-06");

  const clear = component.getByRole("button", { name: "Clear the month" });
  await expect(clear).toHaveAttribute("aria-label", "Clear the month");
  await expect(clear).toHaveAttribute("title", "Clear the month");
});

for (const width of [1280, 720, 430, 390, 320] as const) {
  test(`@${String(width)}: the month clear aligns to the input control rather than the label-and-field block`, async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={width} />);
    const month = component.getByLabel("Show chats up to");
    await month.fill("2020-06");
    const clear = component.getByRole("button", { name: "Clear the month" });
    const [monthBox, clearBox] = await Promise.all([month.boundingBox(), clear.boundingBox()]);

    expect(monthBox).not.toBeNull();
    expect(clearBox).not.toBeNull();
    expect(Math.abs((monthBox?.y ?? 0) + (monthBox?.height ?? 0) / 2 - ((clearBox?.y ?? 0) + (clearBox?.height ?? 0) / 2))).toBeLessThanOrEqual(1);
  });
}

test("month-scoped empty copy names the localized human month and year", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([]), "character.list": { items: [], nextCursor: null } });
  const component = await mount(<ChatListSurfaceStory />);
  await component.getByLabel("Show chats up to").fill("2020-06");

  await expect(component.getByText("No chats found by June 2020.")).toBeVisible();
  await expect(component.getByText(RAW_MONTH_COPY)).toHaveCount(0);
});

// #1348 — THE LABEL RUNS THE DIRECTION THE PREDICATE RUNS. The pane's bound is `monthExclusiveUpperBound`,
// an EXCLUSIVE UPPER ceiling, and that mechanism is the recorded #490 ruling (it is what makes the keyset
// page cheap and it does not move). What ran backwards was the SENTENCE over it: the old label said *from*,
// which is heard as on-or-AFTER, so a reader hunting "my chat from August" picked a month BEFORE their
// library, got an
// empty list and concluded the chats were gone (measured on live main 2026-09-04: `2020-01` → 0 of 6,
// `2030-01` → 6 of 6). The empty copy already said "by". Both arms are pinned through the ACCESSIBLE NAME,
// because the rows were never wrong — the name over them was.
test("#1348 the month bound's label states the direction its predicate runs — both arms", async ({ mount, page }) => {
  // Every fixture chat sits at FROZEN_AT (June 2025), so `2026-01` is a ceiling ABOVE the whole library and
  // `2020-01` one BELOW it.
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": datedChatListResponder([ADVENTURE, UNTITLED]),
    "character.list": { items: [], nextCursor: null },
  });
  const component = await mount(<ChatListSurfaceStory />);
  const month = component.getByLabel("Show chats up to");

  // A ceiling ABOVE the library keeps every chat — "up to January 2026" includes June 2025.
  await month.fill("2026-01");
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // A ceiling BELOW it keeps none, and the empty sentence says the SAME direction the label does.
  await month.fill("2020-01");
  await expect(component.getByText("No chats found by January 2020.")).toBeVisible();
});

// #1350 → #1718 arm A — THE PHONE FOLDS THE SECONDARY FILTERS, BEHIND ONE TRIGGER. #1350 measured 299 of
// 740px of filter chrome at 430×740 and folded the month bound behind a disclosure of its own; #1361 item 3
// did the same for the faces strip. Two `--spacing-control-sm` triggers is 88px at a coarse pointer to carry
// two facts, so the owner ruled ONE row (#1718 arm A).
//
// #1350'S PRINCIPLE IS UNCHANGED AND STILL PINNED HERE: "a fold that hides state is worse than the chrome it
// saved" — the field is NOT rendered while folded, and the TRIGGER names every bound in force. What moved is
// that one name carries BOTH facts, so the exact pin is RE-SPELLED to the new grammar rather than deleted or
// loosened: `Show chats up to June 2020` → `Filters: chats up to June 2020` (`phoneFiltersLabel`,
// `features/chat/lib/chat-list-scope.ts`, which owns the four-state table). It stays `exact`.
test("#1350/#1718 @mobile: the secondary filters fold behind ONE trigger, and the trigger carries the bound in force", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": datedChatListResponder([ADVENTURE]),
    "character.list": { items: [], nextCursor: null },
  });
  const component = await mount(<ChatListSurfaceStory mobile={true} />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // FOLDED: no month field on the screen, and the search field — the primary — still is.
  await expect(component.getByRole("textbox", { name: "Search chats" })).toBeVisible();
  await expect(component.getByLabel("Show chats up to")).toBeHidden();

  // ONE trigger, at its neutral name, and the two it replaced are gone rather than hiding somewhere.
  await expect(component.getByRole("button", { name: "Show chats up to", exact: true })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Filter by character", exact: true })).toHaveCount(0);
  const trigger = component.getByRole("button", { name: "Filters", exact: true });
  await trigger.click();

  // Opening it reveals the SAME control, named the same way it is named on a desktop.
  const month = component.getByLabel("Show chats up to");
  await expect(month).toBeVisible();
  await month.fill("2020-06");

  // …and the bound rides the TRIGGER, so folding it away never hides what is narrowing the list.
  await expect(component.getByRole("button", { name: "Filters: chats up to June 2020", exact: true })).toBeVisible();
});

// THE GRAMMAR, RENDERED (#1718 arm A → #1735, side-eye 2026-09-05). The table is unit-pinned at
// `phoneFiltersLabel`; this is the arm that proves the ROW spends it. THE RULING SURVIVES, ITS INPUT
// CHANGED A SECOND TIME: #1735 found the trigger restating the character axis while the `ChatListFilterChip`
// beside it ALREADY said `Filtered: <name> ✕` — one fact, two sentences. The trigger now states ONLY the
// axis with no other visible carrier (the month bound); the chip keeps sole ownership of the character
// name and its only ✕ (#490's one-reset contract).
test("#1718/#1735 @mobile: the trigger states the month bound only — the chip alone carries the character name and its ✕", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory mobile={true} />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // NONE.
  await expect(component.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await component.getByRole("button", { name: "Filters", exact: true }).click();

  // CHARACTER only — set from inside the panel. The trigger stays at its neutral name (the chip carries
  // the fact); the chip is the ONLY place "Aria Nightshade" and its ✕ appear.
  await component.getByRole("button", { name: "Show chats with Aria Nightshade" }).click();
  await expect(component.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.locator('[data-slot="badge"]').getByText("Aria Nightshade", { exact: true })).toBeVisible();

  // BOTH — the month clause reaches the trigger; the character clause does not, because the chip already
  // carries it (never a second sentence for one on-screen fact). `exact` is the whole assertion: a trigger
  // that also spelled "with Aria Nightshade" fails this match even though the chip's own "Clear the Aria
  // Nightshade filter" button legitimately carries the same name.
  await component.getByLabel("Show chats up to").fill("2020-06");
  await expect(component.getByRole("button", { name: "Filters: chats up to June 2020", exact: true })).toBeVisible();

  // …and clearing the character leaves the month clause alone, and removes the chip's own ✕ with it.
  await component.getByRole("button", { name: "Clear the Aria Nightshade filter" }).click();
  await expect(component.getByRole("button", { name: "Filters: chats up to June 2020", exact: true })).toBeVisible();
  await expect(component.getByText("Filtered:")).toBeHidden();
});

// The DESKTOP twin: the pane is a 300px column with vertical room to spare, so BOTH controls render outright
// and no Filters row exists at all. This is the arm that goes red if the fold leaks past its applicability.
test("#1350/#1718 @desktop: both secondary filters render outright, with no Filters disclosure", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByLabel("Show chats up to")).toBeVisible();
  await expect(component.getByRole("list", { name: "Filter by character" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Filters", exact: true })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Show chats up to", exact: true })).toHaveCount(0);
});

test("a SEARCH that matches nothing says NO MATCHES — never the library-empty copy", async ({ mount, page }) => {
  // THE REGRESSION THIS FENCES (found on a live drive, 2026-08-09, not by any test here): once the predicate
  // is the server's, a search that matches nothing returns a genuinely EMPTY PAGE — indistinguishable from an
  // empty library to a bare `isEmpty` check. The surface showed "No chats yet — pick a character to start your
  // first conversation" over a library full of chats. The sibling arm below only caught it by accident,
  // because it also has a character filter set and lands in a different branch.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-thread");

  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveText("No matches");
  await expect(component.getByText('No chat matches "zzz-no-such-thread".')).toBeVisible();
  // The way OUT is clearing the search, not starting a chat — the library is not empty.
  await expect(component.getByRole("button", { name: "Clear search" })).toBeVisible();
});

// #541a — EVERY ACTIVE NARROWING AXIS OWES A WAY OUT.
//
// This pane narrows on three axes (character · search · month) and its zero-result arms each offered exactly
// ONE exit, named after whichever axis the arm was called after. With a search AND a month in force the empty
// state said "Clear search" alone: clearing it left the reader in a still-empty list, one narrowing they were
// never told about still applied, and the pane had already spent its single action. The copy already knew —
// it said "No chat by June 2020 matches …" — so the actions were behind their own sentence.
test("a search AND a month empty offers BOTH exits, and each one really widens the scope", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "character.list": CHARACTERS, "chat.listChats": datedChatListResponder([ADVENTURE]) });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByLabel("Show chats up to").fill("2020-06");
  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-thread");

  // SETTLED barrier: the debounced search has landed as its own empty page, so the arm below is the steady
  // state rather than a frame between two queries.
  await expect(component.getByText('No chat by June 2020 matches "zzz-no-such-thread".')).toBeVisible();
  const clearSearch = component.getByRole("button", { name: "Clear search", exact: true });
  const clearMonth = component.getByRole("button", { name: "Clear month", exact: true });
  await expect(clearSearch).toBeVisible();
  await expect(clearMonth).toBeVisible();

  // The MONTH exit widens by exactly one axis: the month bound drops, the search's own claim stands, and the
  // empty state re-states the narrowing that is actually still on.
  await clearMonth.click();
  await expect(component.getByLabel("Show chats up to")).toHaveValue("");
  await expect(component.getByText('No chat matches "zzz-no-such-thread".')).toBeVisible();

  // …and the remaining exit is the last one, which restores the list.
  await component.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(component.getByText("A grand adventure")).toBeVisible();
});

test("a month-only empty offers the CHARACTER exit too when a character scope is also on", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "character.list": CHARACTERS, "chat.listChats": datedChatListResponder([ADVENTURE]) });
  const component = await mount(<ChatListSurfaceStory />);
  await component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true }).click();
  await expect(component.getByText("Filtered:")).toBeVisible();
  await component.getByLabel("Show chats up to").fill("2020-06");

  await expect(component.getByText("No chats with Aria Nightshade found by June 2020.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Clear month", exact: true })).toBeVisible();
  // The character axis is named in the SENTENCE, so it owes an action beside it — the chip's ✕ above is the
  // primary door, but an empty state that names a cause and cannot undo it is the dead end #541 is about.
  const clearCharacter = component.getByRole("button", { name: "Clear character filter", exact: true });
  await expect(clearCharacter).toBeVisible();

  await clearCharacter.click();
  await expect(component.getByText("Filtered:")).toHaveCount(0);
  await expect(component.getByText("No chats found by June 2020.")).toBeVisible();
});

test("the active chat's row is marked current", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory activeChatId="chat_adventure" />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  const activeRow = page.getByRole("button", { name: ADVENTURE_ROW, exact: true });
  await expect(activeRow).toHaveAttribute("aria-current", "true");
  const otherRow = page.getByRole("button", { name: UNTITLED_ROW, exact: true });
  await expect(otherRow).not.toHaveAttribute("aria-current", "true");
});

test("the per-row kebab opens the actions menu", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  // Finding #4: the kebab is named after the row ("Chat actions for <title> · <stamp>"), not a bare,
  // indistinguishable "Chat actions" repeated N times — so N chat rows expose N distinct menu-trigger names.
  // The cluster rests hidden + inert (P3b), so reach it the way a user does: hover the row first.
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await component.getByRole("button", { name: ADVENTURE_MENU }).click();

  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export transcript" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

// The lifecycle one-home ruling: EXPORT homes on the row kebab (import is the band's ghost; the room
// carries no lifecycle chrome). All THREE formats the host-gated route serves are plain download links —
// a non-host member's GET 404s at the verb, so the item can't leak a plane the requester can't already
// read. `.orb.json` (R6 fidelity container, listed first) rides `?format=orb`; `.jsonl` is the default
// route (ST/share transcript); `.txt` is the reading copy.
test("§12 export homes on the row kebab — all three formats link to the host-gated download route", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await component.getByRole("button", { name: ADVENTURE_MENU }).click();
  await page.getByRole("menuitem", { name: "Export transcript" }).click();

  const orb = page.getByRole("menuitem", { name: "Whole room (.orb.json)" });
  await expect(orb).toHaveAttribute("href", "/api/export/chat/chat_adventure?format=orb");
  await expect(orb).toHaveAttribute("download", "");
  const jsonl = page.getByRole("menuitem", { name: "Transcript (.jsonl)" });
  await expect(jsonl).toHaveAttribute("href", "/api/export/chat/chat_adventure");
  await expect(jsonl).toHaveAttribute("download", "");
  await expect(page.getByRole("menuitem", { name: "Plain text (.txt)" })).toHaveAttribute("href", "/api/export/chat/chat_adventure?format=txt");
});

test("a chat with a portrait-owning participant renders the REAL portrait; the others keep the initials blob (F7)", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // Exactly ONE row resolved a face — the row whose participantCharacterIds hit an avatar-owning character.
  // Scoped to the ROWS: the Arm B faces strip above them paints the same portrait as a shortcut.
  const images = component.locator(LIST_ROW_ROOT).locator(AVATAR_IMAGE);
  await expect(images).toHaveCount(1);
  await expect(images).toHaveAttribute("src", ARIA_BLOB_RE);
  // …and the participant-less row still renders (its avatar is the hue-seeded initials fallback, no <img>).
  await expect(page.getByText("Untitled chat")).toBeVisible();
});

test("D3 a MULTI-SEAT room leads with an AvatarStack (shared, not one member's face); a 1:1 keeps its portrait", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": chatListResponder([GROUP, ADVENTURE]),
    "character.list": CHARACTERS,
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Crimson Court")).toBeVisible();

  // Exactly ONE row stacks — the 3-seat room — and the stack names its cast for a screen reader.
  const stack = component.locator(AVATAR_STACK);
  await expect(stack).toHaveCount(1);
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Crimson Court" }).locator(AVATAR_STACK)).toBeVisible();
  await expect(stack.getByLabel("Aria Nightshade")).toBeVisible();
  // The single-seat row is untouched: one plain avatar, no stack.
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).locator(AVATAR_STACK)).toHaveCount(0);
});

test("a chat whose participants own no portrait falls back to initials (no broken image element)", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": chatListResponder([
      makeChatSummary({
        id: "chat_faceless",
        title: "Faceless chat",
        participantCharacterIds: ["char_faceless"],
        participantPortraits: [makeSeatPortrait("char_faceless", "Faceless")],
      }),
    ]),
    "character.list": CHARACTERS,
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("Faceless chat")).toBeVisible();
  await expect(component.locator(AVATAR_IMAGE)).toHaveCount(0);
});

// #637 — THE SECOND SINGLETON THIS FILE WAS FLAGGED FOR, and the verdict: `chat.star` was the only unfed
// read in this file, and it is NOT an error-arm defect. It is a MUTATION whose result nobody reads
// (`use-chat-row-mutations.ts` declares it `busDriven` with an `unknown` result and no `onSuccess`), so
// routeTrpc's lenient `null` and a real response are behaviourally identical here — nothing rendered the
// wrong arm. What WAS true is that the success path was reached through the lenient fulfil rather than
// stated, which meant the file's one mutation-firing test could not tell a served star from an unrouted one.
// Feeding it `{}` says what the test means; the assertions below are unchanged and still pass.
test("§12 the star is the row's state TOGGLE, and clicking it fires the star MUTATION with the row's id", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": chatListResponder([ADVENTURE, STARRED]),
    "character.list": CHARACTERS,
    "chat.star": {},
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A pinned thread")).toBeVisible();

  // One element, marker + affordance: the starred row announces pressed under the un-set name.
  const starred = component.getByRole("button", { name: PINNED_UNSTAR });
  await expect(starred).toHaveAttribute("aria-pressed", "true");
  const unstarred = component.getByRole("button", { name: ADVENTURE_STAR });
  await expect(unstarred).toHaveAttribute("aria-pressed", "false");

  // Assert the MUTATION fired (not a UI reaction — the row is bus-driven, so the optimistic repaint is
  // not the thing under test): the click hits `chat.star` with THIS row's id and the flipped value.
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await unstarred.click();
  await expect.poll(() => recorder.lastInput("chat.star")).toEqual({ chatId: "chat_adventure", starred: true });
  // Settled snapshot: settled — the recorded input above proves the request already landed, so the COUNT for that
  // same procedure is final at this point (a second fire would need another click).
  await expect.poll(async () => recorder.count("chat.star")).toBe(1);
});

test("§12 the kebab KEEPS its Star item beside the inline toggle (N3 mirror parity)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  const row = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await row.hover();
  await expect(component.getByRole("button", { name: ADVENTURE_STAR })).toBeVisible();

  await component.getByRole("button", { name: ADVENTURE_MENU }).click();
  // Inline is a SHORTCUT, never the only path — everything stays reachable from one menu.
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
});

test("starred and archived rows say so in ACCESSIBLE content, and the archived row recedes (F7)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, STARRED, ARCHIVED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A pinned thread")).toBeVisible();

  // The star is now the §12 pressable, so the state datum is its `aria-pressed` name — exactly one row
  // carries it, and the un-set rows announce the set verb instead.
  await expect(component.getByRole("button", { name: ANY_PRESSED_STAR })).toHaveCount(1);
  // Archived is TEXT, not just a dimming.
  await expect(component.getByText("Archived", { exact: true })).toHaveCount(1);
  // …and the dimming is the reinforcement: the archived row's root carries the receded class, others don't.
  const archivedRow = component.locator(LIST_ROW_ROOT, { hasText: "A shelved thread" });
  await expect(archivedRow).toHaveClass(RECEDED_RE);
  const plainRow = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await expect(plainRow).not.toHaveClass(RECEDED_RE);
});

test("the chats pane's INSTRUMENT tier is LIVE — its rows resolve the mapped step, not the tier-less default", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expectInstrumentTierLive(component);
});

// side-eye P1 (round 2): the round-1 float gate (`actionsFloat={!restVisible}`) was inert on a real chats
// list — a game / starred / archived row is the NORM, so the hover-only cluster kept reserving ~76px of the
// title column on essentially every row. The trailing zone is split now: the rest-visible markers live on
// the TITLE LINE (where the mock draws them) and the floated cluster holds controls only, so the float is
// unconditional. Measured, not classes: `done ≠ rendered`.
test.describe("P1 the trailing zone is split: markers on the title line, the CONTROL cluster floats", () => {
  test("every chat row — game, starred, archived — keeps its text column at rest, and hover shifts it 0px", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GAME, STARRED, ARCHIVED, ADVENTURE]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("The Ashfell run")).toBeVisible();

    // The state rows are exactly the ones the round-1 gate excluded — measure THEM.
    const rested = await component.locator(CONTENT).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(rested).toHaveLength(4);
    // The text column keeps everything the row's leading portrait and its gaps don't take — a cluster that
    // is HIDDEN at rest must spend ZERO width. Stated as "the pane minus the leading budget" rather than a
    // bare number so the row's portrait step (side-eye P2-5 unified the panes on the mock's one 32px
    // avatar) is what it tracks; the regression it guards is the ~76px an in-flow control cluster eats.
    expect(Math.min(...rested)).toBeGreaterThanOrEqual(PANE_WIDTH - LEADING_BUDGET_PX);

    // …and the reveal reflows nothing: the truncation point does not move mid-read.
    const starredRow = component.locator(LIST_ROW_ROOT, { hasText: "A pinned thread" });
    const before = await starredRow.locator(CONTENT).evaluate((el) => el.getBoundingClientRect().width);
    await starredRow.hover();
    await expect(component.getByRole("button", { name: PINNED_UNSTAR })).toBeVisible();
    await expect.poll(async () => starredRow.locator(CONTENT).evaluate((el) => el.getBoundingClientRect().width)).toBe(before);
  });

  test("the markers render IN the title line and stay accessible content (aria-describedby, not the name)", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GAME, STARRED, ARCHIVED, ADVENTURE]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("The Ashfell run")).toBeVisible();

    // Three marked rows, one marker slot each — and the plain row grows no empty box.
    await expect(component.locator(MARKERS)).toHaveCount(3);
    await expect(component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).locator(MARKERS)).toHaveCount(0);
    // The slot is INSIDE the title line, beside the stamp — not a trailing sibling zone.
    const gameRow = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" });
    await expect(gameRow.locator('[data-slot="list-row-title-row"]').locator(MARKERS)).toHaveCount(1);
    await expect(gameRow.locator(MARKERS).getByLabel("Game chat")).toBeVisible();
    // The datum survives for a screen reader: the row body DESCRIBES itself with the marker span.
    const describedBy = await gameRow.locator('[data-slot="list-row-body"]').getAttribute("aria-describedby");
    await expect.poll(async () => gameRow.locator(MARKERS).getAttribute("id")).not.toBeNull();
    const markersId = await gameRow.locator(MARKERS).getAttribute("id");
    expect((describedBy ?? "").split(" ")).toContain(markersId);
  });

  // #863(f) — THE PAUSED MARKER. Turning game mode off used to erase every trace of the game from the list,
  // leaving its existence visible only behind a host-only tab inside a pane that ships closed. The row now
  // keeps a quieter mark that SAYS paused, so the live and the sleeping state are never one ambiguous glyph.
  test("a room whose game is switched OFF keeps a quiet 'paused' marker, distinct from the live one", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GAME, PAUSED_GAME]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("The dormant delve")).toBeVisible();

    const pausedRow = component.locator(LIST_ROW_ROOT, { hasText: "The dormant delve" });
    await expect(pausedRow.locator(MARKERS).getByLabel("Game chat — paused")).toBeVisible();
    // It is NOT the live marker: the two states read differently to a screen reader and to the eye.
    await expect(pausedRow.locator(MARKERS).getByLabel("Game chat", { exact: true })).toHaveCount(0);
    const live = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" });
    await expect(live.locator(MARKERS).getByLabel("Game chat", { exact: true })).toBeVisible();
  });

  test("a starred row never paints TWO stars: the title-line marker yields to the revealed toggle", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([STARRED]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("A pinned thread")).toBeVisible();

    // At rest the marker carries the state and the toggle is hidden (D11's invariant, in the marker slot).
    const marker = component.locator(MARKERS).getByLabel("Starred");
    const toggle = component.getByRole("button", { name: PINNED_UNSTAR });
    await expect(marker).toBeVisible();
    await expect(toggle).toHaveCSS("opacity", "0");

    // Hovered, they swap — exactly one star is painted at a time.
    await component.locator(LIST_ROW_ROOT, { hasText: "A pinned thread" }).hover();
    await expect(toggle).toHaveCSS("opacity", "1");
    await expect(marker).toBeHidden();
  });
});

test("the SCENT line wins the subtitle and stays ONE truncated line; the GAME marker is labelled text (not color)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GAME, ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Ashfell run")).toBeVisible();

  // The snippet REPLACES the participants line on a chat with history; the plain row keeps its identity line.
  // Counted over the ROWS: the faces strip prints her caption as well (see the row-scoped note above).
  await expect(component.getByText("The door gives way", { exact: false })).toBeVisible();
  await expect(component.locator(LIST_ROW_ROOT).getByText("Aria Nightshade", { exact: true })).toHaveCount(1);
  // done ≠ rendered: the long snippet must actually be clipped to one line, not wrap the row open.
  const subtitle = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" }).locator(SUBTITLE);
  await expect
    .poll(async () =>
      subtitle.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          whiteSpace: s.whiteSpace,
          overflow: s.overflow,
          textOverflow: s.textOverflow,
          lines: Math.round(el.getBoundingClientRect().height / Number.parseFloat(s.lineHeight)),
        };
      }),
    )
    .toEqual({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lines: 1 });

  // The game marker is a labelled glyph — the datum is TEXT for a screen reader — and only the game row has it.
  await expect(component.getByLabel("Game chat")).toHaveCount(1);
  const gameRow = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" });
  await expect(gameRow.getByLabel("Game chat")).toBeVisible();
});

// ── Arm B: the chats pane learns FACES (list-pane-projection §5.2) ─────────────────────────────────
// Tapping a face rides the LANDED filter-chip seam — the same pane becomes her threads, visibly "filtered
// by" a chip you can clear, never a second list that owns her chats (the D18 grammar).

test("Arm B: the faces strip curates the recent cast, and tapping one SCOPES the pane through the filter chip", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GROUP, ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Crimson Court")).toBeVisible();

  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await expect(face).toBeVisible();
  await face.click();

  // The chip is the visible scope, and the rows narrowed to hers — the untitled (seat-less) row is gone.
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.getByText("Aria Nightshade", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);
  // `aria-pressed`, not `aria-current`: the chats strip's faces TOGGLE a filter rather than navigate, and
  // `FaceStrip` states its one fact in one vocabulary (`selectMode:"toggle"` → aria-pressed; the character
  // library's favorites strip, which OPENS an editor, keeps aria-current). The source moved in the nightly
  // fix-all; this assertion was its unswept half.
  await expect(face).toHaveAttribute("aria-pressed", "true");
});

// Mock order (side-eye P2b/P2a): the faces are the shortcut you arrive for, so the strip is the FIRST thing
// in the pane — above the scope chip and the search box — and each face is CAPTIONED, because a portrait
// alone is not a name.
test("Arm B: the strip is the pane's FIRST element (above chip + search) and its faces are captioned", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await expect(face).toBeVisible();
  // The caption is real text under the portrait, not just the accessible name.
  await expect(face.getByText("Aria Nightshade", { exact: true })).toBeVisible();

  // DOM order is the reading order: strip → (chip) → search. Compare positions, not classes.
  await face.click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const all = [...document.querySelectorAll("*")];
          const at = (el: Element | null | undefined): number => (el === null || el === undefined ? -1 : all.indexOf(el));
          const strip = at(document.querySelector('[aria-label="Filter by character"]'));
          const chip = at(all.find((el) => el.textContent === "Filtered:"));
          const search = at(document.querySelector('input[aria-label="Search chats"]'));
          return { stripBeforeChip: strip >= 0 && chip > strip, stripBeforeSearch: strip >= 0 && search > strip };
        }),
      { intervals: [20, 50, 100] },
    )
    .toEqual({ stripBeforeChip: true, stripBeforeSearch: true });
});

// ── THE RESERVED STRIP BOX (shell-perf mop, measured 2026-08-09) ───────────────────────────────────
// The strip mounted only once BOTH its reads landed (`chat.listChats` for the cast, `character.list` for
// the portraits), so on arrival it pushed the search field and the entire row list down 74px — measured on
// a live boot as a 0.0070–0.0102 layout shift, which is exactly what UI-Architecture-and-Layout §4.3 rule 7
// forbids ("never layout shift on data arrival"). The strip's height is CHROME (a kicker line + one row of
// face boxes), knowable before either read, so the pending strip now reserves it.
//
// The in-flight phase is a HELD, settled render here, never a flash to race: the route handler below sleeps
// before falling through to `routeTrpc`, so the pending geometry is read from a page that cannot settle
// early. Contention can only make that window longer.
/** Long enough that the pending phase is unmistakably observable, short enough to keep the test quick. */
const PENDING_HOLD_MS = 1200;
/** Sub-pixel equality: the reserved box is built from the settled anatomy's own tokens, so any real
 *  regression is a whole row (74px), never a rounding hair. */
const NO_MOVE_PX = 1;

test("Arm B: the strip RESERVES its box while its reads are in flight — the search field does not move on arrival", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  await page.route("**/api/trpc/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, PENDING_HOLD_MS));
    await route.fallback();
  });

  const component = await mount(<ChatListSurfaceStory />);
  const search = component.getByRole("textbox", { name: "Search chats" });
  await expect(search).toBeVisible();
  const pendingBox = await search.boundingBox();

  // SETTLED barrier: the faces are up AND the rows rendered — the pane is done moving.
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  const settledBox = await search.boundingBox();

  expect(Math.abs((settledBox?.y ?? 0) - (pendingBox?.y ?? -1))).toBeLessThan(NO_MOVE_PX);
});

// The face-verb ambiguity (home side-eye): one rail click away, on home, the same clickable character face
// LAUNCHES a chat. The strip's kicker is therefore the VERB, not the contents — "Faces" named the picture
// and left both readings open. It is the only line a sighted user gets BEFORE committing to a click.
test("Arm B: the strip's kicker names the FILTER verb, so a face here can't read as a launcher", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const kicker = component.getByText("Filter by character", { exact: true });
  await expect(kicker).toBeVisible();
  await expect(kicker).toHaveCSS("text-transform", "uppercase");
  // The launcher noun is gone — a face in this pane never says only what it is.
  await expect(component.getByText("Faces", { exact: true })).toHaveCount(0);
});

test("Arm B: re-tapping the scoping face clears the scope (the same toggle its aria-pressed announces)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await face.click();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);

  await face.click();
  await expect(component.getByText("Filtered:")).toHaveCount(0);
  await expect(page.getByText("Untitled chat")).toBeVisible();
});

test("Arm B: the strip STAYS while a scope is empty — it is the way out, not a dead end", async ({ mount, page }) => {
  // Aria's only seat is on a chat that is filtered out by the search, so the scoped list goes empty.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true }).click();
  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-chat");

  await expect(component.getByText("No matches")).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
});

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([]) });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});

// ── FACEFILT: the strip FOLDS to one row, and the roster lives behind a picker ──────────────────────
// The owner's report: nine faces already scrolled sideways on a six-character library, so the shortcut
// row had become a second thing to navigate. The strip fits the PANE now — as many faces as its measured
// width holds, everyone else behind one picker tile — and the character it is filtering by is always one
// of the faces you can see (a pane cannot be scoped by an invisible control).

/** The narrowest REAL list pane: `--dimension-panel` clamps at 17rem (272px) and `.shell-panel-body`
 *  spends `--spacing-row` (8px) of inline padding on each side. The fold is only observable at one. */
const NARROW_PANE_WIDTH = 256;
const ROSTER_SIZE = 30;
// #208: the strip's ONE name is its printed kicker ("Recent characters" was a divergent second string).
const FACE_ROW = '[aria-label="Filter by character"]';
const FACE_ITEM = "[data-face-key]";
// #208 label-in-name: the captioned tile prints "More", so its accessible name leads with that word.
// #852 — the tile's accessible name LEADS with its visible `+N`, so the pin is a shape, not a fixed string.
const OVERFLOW_TILE = /^\+\d+ More — Filter by another character$/u;
/** The one roster member the strip could never reach by scrolling — the picker's proof. */
const FOLDED_NAME = "Zoltan the Unfathomable";

function rosterName(index: number): string {
  return index === ROSTER_SIZE - 1 ? FOLDED_NAME : `Face ${index}`;
}

/** A library big enough to overflow any pane — the owner's 6 characters were already too many. */
function rosterCharacters(): { readonly items: readonly { id: string; name: string; avatarHash: null }[] } {
  return { items: Array.from({ length: ROSTER_SIZE }, (_unused, index) => ({ id: `char_f${index}`, name: rosterName(index), avatarHash: null })) };
}

/** One chat per roster member, newest-first — so the curation hands the strip all 30 faces. */
function rosterChats(): readonly ReturnType<typeof makeChatSummary>[] {
  return Array.from({ length: ROSTER_SIZE }, (_unused, index) =>
    makeChatSummary({
      id: `chat_f${index}`,
      title: `Thread ${index}`,
      participantNames: [rosterName(index)],
      participantCharacterIds: [`char_f${index}`],
      participantPortraits: [makeSeatPortrait(`char_f${index}`, rosterName(index))],
    }),
  );
}

test("FACEFILT: 30 recent faces fit ONE unscrolled row at the narrowest real pane; the rest fold behind the picker tile", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  // Barrier on the SETTLED folded arm — the tile only exists once the strip has measured itself.
  const tile = component.getByRole("button", { name: OVERFLOW_TILE });
  await expect(tile).toBeVisible();

  const readGeometryAtAssertion = async (): Promise<typeof geometry> =>
    await component.locator(FACE_ROW).evaluate((row) => {
      const box = row.getBoundingClientRect();
      return {
        scrollWidth: Math.round(row.scrollWidth),
        clientWidth: Math.round(row.clientWidth),
        overflowX: getComputedStyle(row).overflowX,
        overhang: [...row.querySelectorAll("[data-face-key]")].map((face) => face.getBoundingClientRect().right - box.right),
      };
    });
  const geometry = await component.locator(FACE_ROW).evaluate((row) => {
    const box = row.getBoundingClientRect();
    return {
      scrollWidth: Math.round(row.scrollWidth),
      clientWidth: Math.round(row.clientWidth),
      overflowX: getComputedStyle(row).overflowX,
      overhang: [...row.querySelectorAll("[data-face-key]")].map((face) => face.getBoundingClientRect().right - box.right),
    };
  });
  // The scrollbar is DEAD: nothing to scroll, and no scroller to scroll it with.
  await expect.poll(async () => (await readGeometryAtAssertion()).scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  await expect.poll(async () => (await readGeometryAtAssertion()).overflowX).toBe("hidden");
  // …and every rendered face is inside the pane, not merely un-scrollable (clipping is not fitting).
  await expect.poll(async () => (await readGeometryAtAssertion()).overhang.length).toBeGreaterThan(0);
  await expect.poll(async () => (await readGeometryAtAssertion()).overhang.length).toBeLessThan(ROSTER_SIZE);
  expect(Math.max(...geometry.overhang)).toBeLessThanOrEqual(0);

  // The count is HONEST — the tile prints exactly the number of faces it is standing in for.
  await expect(tile.getByText(`+${ROSTER_SIZE - geometry.overhang.length}`, { exact: true })).toBeVisible();
});

test("FACEFILT: a folded character picked from the roster scopes the pane AND takes a visible slot in the strip", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  const tile = component.getByRole("button", { name: OVERFLOW_TILE });
  await expect(tile).toBeVisible();
  // She is genuinely unreachable in the strip before the pick — that is what the tile is FOR.
  await expect(component.getByRole("button", { name: `Show chats with ${FOLDED_NAME}`, exact: true })).toHaveCount(0);

  await tile.click();
  await page.getByPlaceholder("Search characters…").fill("Zoltan");
  await page.getByRole("option", { name: FOLDED_NAME }).click();

  // The pane is scoped to her…
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.getByRole("button", { name: `Thread ${ROSTER_SIZE - 1}`, exact: true })).toBeVisible();
  // …and she is a FACE now, current and inside the row's box — never a filter you can't see or re-tap.
  const face = component.getByRole("button", { name: `Show chats with ${FOLDED_NAME}`, exact: true });
  await expect(face).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      component.locator(FACE_ROW).evaluate((row) => {
        const box = row.getBoundingClientRect();
        const current = row.querySelector('[aria-pressed="true"]');
        const rect = current?.getBoundingClientRect();
        return rect !== undefined && rect.left - box.left >= 0 && rect.right - box.right <= 0;
      }),
    )
    .toBe(true);
  // The picker got out of the way once it did its job.
  await expect(page.getByPlaceholder("Search characters…")).toHaveCount(0);
});

test("FACEFILT: the picker tile is KEYBOARD reachable and lands focus in its search field", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  const tile = component.getByRole("button", { name: OVERFLOW_TILE });
  await expect(tile).toBeVisible();

  // Tab from the last visible face reaches the tile — it is the strip's own trailing stop, not a
  // pointer-only affordance parked outside the tab order.
  await component.locator(`${FACE_ROW} ${FACE_ITEM}`).last().focus();
  await page.keyboard.press("Tab");
  await expect(tile).toBeFocused();
  await page.keyboard.press("Enter");

  const search = page.getByPlaceholder("Search characters…");
  await expect(search).toBeFocused();
  await page.keyboard.type("Zoltan");
  await expect(page.getByRole("option", { name: FOLDED_NAME })).toBeVisible();
});

test("FACEFILT: a cast that already fits keeps every face and grows NO picker tile (the ≤N pane is today, minus the scrollbar)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GROUP, ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Sera", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Niko", exact: true })).toBeVisible();

  await expect(component.getByRole("button", { name: OVERFLOW_TILE })).toHaveCount(0);
  const readGeometryAtAssertion = async (): Promise<typeof geometry> =>
    await component.locator(FACE_ROW).evaluate((row) => ({
      scrollWidth: Math.round(row.scrollWidth),
      clientWidth: Math.round(row.clientWidth),
    }));
  const geometry = await component.locator(FACE_ROW).evaluate((row) => ({
    scrollWidth: Math.round(row.scrollWidth),
    clientWidth: Math.round(row.clientWidth),
  }));
  await expect.poll(async () => (await readGeometryAtAssertion()).scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test("FACEFILT: no chats means NO strip at all — the picker tile never becomes a lone shell", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([]), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  await expect(component.getByText("No chats yet")).toBeVisible();

  await expect(component.locator(FACE_ROW)).toHaveCount(0);
  await expect(component.getByRole("button", { name: OVERFLOW_TILE })).toHaveCount(0);
  await expect(component.getByText("Filter by character", { exact: true })).toHaveCount(0);
});

// ── THE COARSE COLLAPSE ON THE ROSTER (side-eye 2026-08-07 finding 6) ────────────────────────────────
// At a coarse pointer `ROW_REVEAL` pins the row's star toggle permanently ON and the touch floor grows it
// to 48px, so EVERY row of the 320px roster spent ~96px on an unpressed star plus the kebab while
// "Example — The Ashen Spire" got 62px of 296 and truncated to ~10 characters. The kebab already carries
// Star for both pointers (the mirror-parity ruling in chat-list-row-menu.tsx), so the inline toggle stands
// down at coarse and the kebab is the one door. The title-line ★ MARKER stays — the state never leaves the
// row, only the affordance moves, which is the half a naive collapse gets wrong.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium; the first assertion proves
// the emulation landed before any geometry is trusted.

const PHONE_WIDTHS = [320, 375] as const;

const PINNED_ROW_RE = /A pinned thread/u;
const STAR_TOGGLE_RE = /^(?:Star|Unstar) /u;
const UNSTAR_TOGGLE_RE = /^Unstar /u;
const ROW_KEBAB_RE = /^Chat actions for/u;

test.describe("coarse roster", () => {
  test.use({ hasTouch: true });

  for (const width of PHONE_WIDTHS) {
    test(`@${width}: the inline star stands down, the kebab stays, and the title gets the width back`, async ({ mount, page }) => {
      await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([STARRED, ADVENTURE]), "character.list": CHARACTERS });
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<ChatListSurfaceStory width={width} />);
      const row = component.getByRole("button", { name: PINNED_ROW_RE }).first();
      await expect(row).toBeVisible();

      // The star TOGGLE is gone from the coarse row entirely (`display:none` ⇒ out of the a11y tree too).
      await expect(component.getByRole("button", { name: STAR_TOGGLE_RE })).toHaveCount(0);
      // …but the STATE is still on the row: the title-line marker survives the collapse.
      await expect(component.getByRole("img", { name: "Starred" }).first()).toBeVisible();
      // …and the verb is one tap away in the kebab, which is still there.
      const kebab = component.getByRole("button", { name: ROW_KEBAB_RE }).first();
      await expect(kebab).toBeVisible();
      await kebab.click();
      await expect(page.getByRole("menuitem", { name: "Unstar" })).toBeVisible();
    });
  }
});

// The fine-pointer roster is untouched: the toggle is the affordance, the marker swaps out from under it
// on hover, and nothing about the desktop row moved.
test("a fine pointer keeps the inline star toggle on the roster row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([STARRED, ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByRole("button", { name: UNSTAR_TOGGLE_RE }).first()).toBeAttached();
});

// ── THE EVICTION TRAP (the character library's "rows vanish as I scroll", live here too) ─────────────
// `useChatListCollection` shipped `maxPages: 5` (× 50 rows) beside `getPreviousPageParam: () => undefined`:
// past 250 rows TanStack dropped page 1 and NOTHING could ever fetch it back, so the top of a deep-scrolled
// chat library was gone until the query key changed. The character tab retired its identical cap on
// 2026-08-13 and left this one annotated for the chat lane; this is the pin that keeps it retired.
//
// The proof is the SCROLL BACK, not a row count at the bottom: at the tail of a virtualized list the head
// rows are legitimately unmounted either way, so "is row 1 in the DOM" cannot tell eviction from
// virtualization. Returning to the top can — an evicted head page makes chat 51 the first row of the library,
// permanently. (The chats pane prints no loaded-vs-census readout — the band's count is its own `limit: 1`
// census read — so the character library's live-region instrument does not exist here.)
const EVICTION_CHATS = 300;
const EVICTION_SCROLL_STEP_PX = 2000;
/** The poll IS the scroll loop: each attempt wheels one step and reports whether the target row has arrived,
 *  so the walk needs no `waitForTimeout` and no awaits inside a `for` (both banned in CTs, and both would be
 *  a fixed sleep standing in for the settle this actually waits on). */
/** A FUNCTION, not a const: Playwright's `pollAgainstDeadline` pops/shifts the interval array it is handed,
 *  so a shared object is drained by its first use and the SECOND walk below silently falls back to 1000ms
 *  (ct-poll-schedule-and-paint ARM A). */
function evictionPoll(): { intervals: number[]; timeout: number } {
  return { intervals: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], timeout: 20_000 };
}
const HEAD_CHAT = "Chat 000";
const TAIL_CHAT = "Chat 299";

// ── EVERY NARROWING AXIS RESETS THE SCROLL (#385) ───────────────────────────────────────────────────
// `useChatListCollection` has THREE scope axes — characterId · search · beforeRecencyAt — all of them part
// of one `keepPreviousData` infinite query feeding one NEVER-remounted `<VirtualList>`. The date arc wired
// the reset key to `beforeRecencyAt` alone, so a deep-scrolled reader who then tapped a face (or searched)
// kept the old offset: the browser clamps it to the shorter scope's height and the reader lands MID-SCOPE,
// with the top of the new scope silently above them. The proof is the SETTLED landing (`scrollTop` 0 with
// row index 0 mounted), never a row count — a mid-scope window renders perfectly valid rows.
const AXIS_LIBRARY_SIZE = 120;
const AXIS_ARIA_SEAT = makeSeatPortrait("char_aria", "Aria Nightshade", "hash_aria");
/** The unscoped half of the axis library — gone from the DOM is how a CT sees the placeholder rows leave. */
const AXIS_UNSCOPED_RE = /^Deep /u;
const AXIS_SEARCH_TERM = "Aria thread";
/** Deep enough that the shorter scope's clamped offset is still far from the top. */
const AXIS_DEEP_SCROLL_PX = 1500;

/** Alternating rows: the odd half carries Aria's seat (and her name in the title), the even half carries
 *  neither — so ONE library exercises the character axis and the search axis with the same scoped set. */
function axisLibrary(): readonly ReturnType<typeof makeChatSummary>[] {
  return Array.from({ length: AXIS_LIBRARY_SIZE }, (_unused, at) => {
    const recencyAt = Date.UTC(2026, 6, 1) - at;
    const scoped = at % 2 === 1;
    return makeChatSummary({
      id: `chat_axis_${String(at)}`,
      title: `${scoped ? "Aria thread" : "Deep"} ${String(at).padStart(3, "0")}`,
      participantNames: scoped ? ["Aria Nightshade"] : [],
      participantCharacterIds: scoped ? ["char_aria"] : [],
      participantPortraits: scoped ? [AXIS_ARIA_SEAT] : [],
      lastMessageAt: recencyAt,
      updatedAt: recencyAt,
    });
  });
}

for (const axis of ["character", "search"] as const) {
  test(`#385 the ${axis} axis lands the top of its new scope after a deep scroll, not the old offset`, async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder(axisLibrary()), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory />);
    await expect(component.getByText("Deep 000", { exact: true })).toBeVisible();

    // The poll IS the scroll loop (the eviction-walk precedent): each attempt wheels one step, which also
    // lets the tail-fetch guard pull the next page, and reports the live offset.
    const scroll = component.locator('[data-slot="virtual-list-scroll"]');
    await component.getByRole("list", { name: "Chats list" }).hover();
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, EVICTION_SCROLL_STEP_PX);
        return scroll.evaluate((node) => node.scrollTop);
      }, evictionPoll())
      .toBeGreaterThan(AXIS_DEEP_SCROLL_PX);

    if (axis === "character") {
      await component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true }).click();
    } else {
      await component.getByRole("textbox", { name: "Search chats" }).fill(AXIS_SEARCH_TERM);
    }

    // SETTLED barrier: the previous scope's placeholder rows are GONE. Every row of the new scope is an
    // "Aria thread", so an unscoped title in the DOM can only be the old page still showing.
    await expect(component.getByText(AXIS_UNSCOPED_RE)).toHaveCount(0);
    await expect(scroll).toHaveJSProperty("scrollTop", 0);
    await expect(component.locator('[data-slot="virtual-list-row"]').first()).toHaveAttribute("data-index", "0");
    await expect(component.getByText("Aria thread 001", { exact: true })).toBeVisible();
  });
}

// A FENCE, not a defect proof (it passes pre-fix): `monthExclusiveUpperBound` builds the exclusive ceiling
// by handing `Date` a month index one past the selection, so December is the one selection whose bound
// crosses a YEAR. Two-sided — the BOUND rolls into January, the printed LABEL must not.
test("#385 a December jump rolls the exclusive bound into the following January while the label stays December", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);

  await component.getByLabel("Show chats up to").fill("2020-12");

  await expect
    .poll(() => trpc.inputs("chat.listChats").some((input) => (input as { beforeRecencyAt?: number } | undefined)?.beforeRecencyAt === Date.UTC(2021, 0, 1)))
    .toBe(true);
  await expect(component.getByText("No chats found by December 2020.")).toBeVisible();
});

test("the head page is NEVER evicted — a deep scroll and back still lands on the first chat", async ({ mount, page }) => {
  // Six pages of the collection's fixed 50 — one more than the old five-page window, which is where the head
  // page used to disappear.
  const library = Array.from({ length: EVICTION_CHATS }, (_unused, at) =>
    makeChatSummary({
      id: `chat_deep_${String(at)}`,
      title: `Chat ${String(at).padStart(3, "0")}`,
      participantNames: [],
      participantCharacterIds: [],
      updatedAt: 100_000_000 - at,
    }),
  );
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder(library), "character.list": { items: [], nextCursor: null } });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText(HEAD_CHAT)).toBeVisible();

  // Walk to the tail the way a user does — each step lets the tail-fetch guard pull the next page.
  const list = component.getByRole("list", { name: "Chats list" });
  await list.hover();
  const tail = component.getByText(TAIL_CHAT);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, EVICTION_SCROLL_STEP_PX);
      return tail.count();
    }, evictionPoll())
    .toBeGreaterThan(0);

  // …and back. With the cap in place this poll can never succeed: page 1 is not in the cache and there is no
  // backward fetch to bring it back, so the library now starts at "Chat 050".
  const head = component.getByText(HEAD_CHAT);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, -EVICTION_SCROLL_STEP_PX);
      return head.count();
    }, evictionPoll())
    .toBeGreaterThan(0);
});

// ── #490: the two filter-honesty defects, pinned at the mount that can see both ──────────────────────
// (1) THE SEARCH FIELD HAD NO WAY OUT. Its sibling month control grew a ✕ the moment it held a value; the
//     search box never did, and the only "Clear search" in the app lived inside the ZERO-RESULTS empty
//     state — so leaving a filter that RETURNED rows meant select-all-delete. Two sibling filters, two
//     reset contracts, one 290px column.
// (2) THE BAND'S CENSUS IGNORED THE FILTERS UNDER IT. `CHATS 896` printed unchanged over twelve narrowed
//     rows and over "No matches". The band feeds a DIFFERENT shell slot, so this is the only mount that
//     can catch it — a header-only story and a surface-only story each pass while the pair lies, which is
//     why `ChatListBandAndSurfaceStory` exists.
const NARROW_TERM = "grand";

test("#490 the search field grows a clear affordance the moment it holds a value", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  const search = component.getByRole("textbox", { name: "Search chats" });
  const clear = component.getByRole("button", { name: "Clear the search" });

  // At rest there is nothing to reset, so nothing is offered (the month control's own contract).
  await expect(clear).toHaveCount(0);
  await search.fill(NARROW_TERM);
  await expect(clear).toBeVisible();

  await clear.click();
  await expect(search).toHaveValue("");
  await expect(clear).toHaveCount(0);
});

// #525 (side-eye 2026-08-22 rail-chats). #490 gave both filters the SAME reset; it left them different
// SHAPES. The ✕ hung in the column gutter beside the field while the month's native picker glyph sat inside
// its box, so two mechanically identical filters read as two kinds of control — and the search field visibly
// shrank the moment you typed. Both glyphs are inset at their own field's inline end now, over a constant
// reserve, so neither field changes width and neither value reflows.
test("#525 both filter clears sit INSIDE their field's box, and the field never resizes around them", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": datedChatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory width={320} />);

  const search = component.getByRole("textbox", { name: "Search chats" });
  const month = component.getByLabel("Show chats up to");
  const restingSearch = await search.boundingBox();
  const restingMonth = await month.boundingBox();

  await search.fill(NARROW_TERM);
  await month.fill("2020-06");
  const searchClear = component.getByRole("button", { name: "Clear the search" });
  const monthClear = component.getByRole("button", { name: "Clear the month" });
  await expect(searchClear).toBeVisible();
  await expect(monthClear).toBeVisible();

  const [filledSearch, filledMonth, searchClearBox, monthClearBox] = await Promise.all([
    search.boundingBox(),
    month.boundingBox(),
    searchClear.boundingBox(),
    monthClear.boundingBox(),
  ]);

  // THE FIELD DOES NOT MOVE. A gutter-mounted reset stole its width from the field the moment it appeared.
  expect(filledSearch?.width, "the search field keeps its resting width when its reset appears").toBeCloseTo(restingSearch?.width ?? -1, 1);
  expect(filledMonth?.width, "and so does the month field").toBeCloseTo(restingMonth?.width ?? -1, 1);

  // THE GLYPH IS INSIDE. Every edge of the button is within its own field's box.
  const contains = (field: typeof filledSearch, glyph: typeof searchClearBox): boolean =>
    field !== null &&
    glyph !== null &&
    glyph.x >= field.x - 0.5 &&
    glyph.x + glyph.width <= field.x + field.width + 0.5 &&
    glyph.y >= field.y - 0.5 &&
    glyph.y + glyph.height <= field.y + field.height + 0.5;
  expect(contains(filledSearch, searchClearBox), "the search reset lives inside the search field").toBe(true);
  expect(contains(filledMonth, monthClearBox), "the month reset lives inside the month field").toBe(true);

  // …and the two silhouettes agree: same box, same distance from their own field's trailing edge.
  expect(searchClearBox?.width).toBeCloseTo(monthClearBox?.width ?? -1, 1);
  expect((filledSearch?.x ?? 0) + (filledSearch?.width ?? 0) - ((searchClearBox?.x ?? 0) + (searchClearBox?.width ?? 0))).toBeCloseTo(
    (filledMonth?.x ?? 0) + (filledMonth?.width ?? 0) - ((monthClearBox?.x ?? 0) + (monthClearBox?.width ?? 0)),
    1,
  );

  // The reset still resets.
  await searchClear.click();
  await expect(search).toHaveValue("");
});

test("#490 the chrome band's count reflects the pane's filters, and returns to the library census", async ({ mount, page }) => {
  const library = [ADVENTURE, UNTITLED, GAME];
  await routeTrpc(page, {
    ...CHAT_ROOM_ROUTES,
    "chat.listChats": (input: unknown): unknown => {
      const search = (input as { search?: string } | undefined)?.search;
      const scoped = search === undefined ? library : library.filter((chat) => (chat.title ?? "").toLowerCase().includes(search.toLowerCase()));
      // The band reads `totalCount` off the SCOPED page, so the responder must narrow it honestly.
      return chatListResponder(scoped)(input);
    },
    "character.list": CHARACTERS,
  });
  const component = await mount(<ChatListBandAndSurfaceStory />);
  const band = component.locator(".shell-panel-header");

  // Unnarrowed: the library census, bare — byte-identical to the pre-#490 band.
  await expect(band).toContainText(String(library.length));
  await expect(band).not.toContainText(" of ");

  await component.getByRole("textbox", { name: "Search chats" }).fill(NARROW_TERM);
  // Narrowed: "N of TOTAL" — the number the reader can count on screen, beside the one they cannot.
  await expect(band).toContainText(`1 of ${String(library.length)}`);

  await component.getByRole("button", { name: "Clear the search" }).click();
  await expect(band).not.toContainText(" of ");
  await expect(band).toContainText(String(library.length));
});

// ── #500 (side-eye 2026-08-22 rail-chats, the P3 cluster) ────────────────────────────────────────────

// P3 item 1 — the row's visual WEIGHT was inverted against its information VALUE. Measured at 896-chat
// density: title 13px/600, subtitle 10.5px/400 — the instrument tier's micro gloss, the same step the
// "CHATS" / "FILTER BY CHARACTER" chrome kickers take. On the imported corpus the titles share a leading
// token, so the loudest element in each row was the part identical ACROSS rows while the only
// discriminating content (the scent line) was the quietest thing on the surface. Read from computed values
// against the document's OWN tokens, never a hardcoded px — the fix is `subtitleStep="label"`, and the
// guard is that the resolved step is the label one and NOT the micro one.
test("#500 the scent line takes the LABEL step, not the chrome kickers' micro gloss — and the title still outranks it", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([GAME, ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Ashfell run")).toBeVisible();

  const readProofAtAssertion = async (): Promise<typeof proof> =>
    await component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" }).evaluate((node: HTMLElement) => {
      const pick = (slot: string): HTMLElement => {
        const found = node.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
        if (found === null) {
          throw new Error(`the row rendered no ${slot} to measure`);
        }
        return found;
      };
      const probe = node.ownerDocument.createElement("div");
      node.ownerDocument.body.append(probe);
      const at = (token: string): string => {
        probe.style.fontSize = `var(${token})`;
        return getComputedStyle(probe).fontSize;
      };
      const label = at("--text-label");
      const micro = at("--text-micro");
      probe.remove();
      const subtitle = getComputedStyle(pick("list-row-subtitle"));
      const title = getComputedStyle(pick("list-row-title"));
      const meta = getComputedStyle(pick("list-row-meta"));
      return {
        label,
        micro,
        subtitleSize: subtitle.fontSize,
        subtitleWeight: subtitle.fontWeight,
        subtitleColor: subtitle.color,
        titleSize: title.fontSize,
        titleWeight: title.fontWeight,
        titleColor: title.color,
        metaSize: meta.fontSize,
      };
    });
  const proof = await component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" }).evaluate((node: HTMLElement) => {
    const pick = (slot: string): HTMLElement => {
      const found = node.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      if (found === null) {
        throw new Error(`the row rendered no ${slot} to measure`);
      }
      return found;
    };
    const probe = node.ownerDocument.createElement("div");
    node.ownerDocument.body.append(probe);
    const at = (token: string): string => {
      probe.style.fontSize = `var(${token})`;
      return getComputedStyle(probe).fontSize;
    };
    const label = at("--text-label");
    const micro = at("--text-micro");
    probe.remove();
    const subtitle = getComputedStyle(pick("list-row-subtitle"));
    const title = getComputedStyle(pick("list-row-title"));
    const meta = getComputedStyle(pick("list-row-meta"));
    return {
      label,
      micro,
      subtitleSize: subtitle.fontSize,
      subtitleWeight: subtitle.fontWeight,
      subtitleColor: subtitle.color,
      titleSize: title.fontSize,
      titleWeight: title.fontWeight,
      titleColor: title.color,
      metaSize: meta.fontSize,
    };
  });

  // The two steps are genuinely different in this document, or the assertion below proves nothing.
  await expect.poll(async () => (await readProofAtAssertion()).label).not.toBe(proof.micro);
  expect(proof.subtitleSize, "the scent line owes the readable label floor").toBe(proof.label);
  expect(proof.subtitleSize, "the scent line must not share the chrome kickers' micro voice").not.toBe(proof.micro);
  // The hierarchy did not invert the other way: the title still leads, on WEIGHT and tone rather than size.
  await expect.poll(async () => Number((await readProofAtAssertion()).titleWeight)).toBeGreaterThan(Number(proof.subtitleWeight));
  await expect.poll(async () => (await readProofAtAssertion()).titleColor).not.toBe(proof.subtitleColor);
  await expect.poll(async () => (await readProofAtAssertion()).titleSize).toBe(proof.label);
  // …and the lift is the SCENT line alone — the recency stamp stays the quiet column the eye scans past.
  expect(proof.metaSize, "the meta stamp keeps the micro step").toBe(proof.micro);
});

// P3 item 4 — the shell's `Skip to content` lands in `<main>`, i.e. PAST this pane, and on the Chats
// surface the work starts in the LIST: 13 measured tab stops stood before the list's first control and the
// only skip target was CONTENT. The pane carries its own now, the landed characters twin's exact posture
// (#491).
test("#500 the pane's skip link is its FIRST focusable and lands focus on the first chat row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText(ADVENTURE_ROW)).toBeVisible();

  const skip = component.getByRole("button", { name: "Skip to chats" });
  // FIRST among the pane's focusables in DOM order — the whole contract: a skip control that is not the
  // first focusable is a second tab stop, not a skip. Asserted structurally rather than by pressing Tab,
  // because where a CT's initial focus SITS is the harness's business, not this pane's.
  await expect
    .poll(async () =>
      skip.evaluate((el: HTMLElement) => {
        const pane = el.closest<HTMLElement>('[tabindex="-1"]');
        const focusables = pane?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
        return focusables?.[0] === el;
      }),
    )
    .toBe(true);

  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(component.locator('[data-slot="list-row-body"]').first()).toBeFocused();
});

// ── RED-FIRST (#1180): the row WARMS the room it opens, and the wrapper carrying that intent is
// ── LAYOUT-NEUTRAL ──────────────────────────────────────────────────────────────────────────────────
// The chats-list door carried the identical 52px shift Home Resume had (#1126/H13): `ChatCharacterBar`
// reads `chat.getChat` non-suspending, so a cold click paints the room without the strip and then pushes
// the transcript down 40px + the room stack's 12px gap once the roster lands. Measured on this door at
// main d8f10cee5: `[cls] shift 0.0225 · div[aria-label=Example — Midnight Run] moved 0px,52px`.
//
// The click is too late to fix it, so the warm-up rides the reader's APPROACH. Two halves are pinned
// because both can fail silently: that the intent reaches the NETWORK (the one place a warm-up is
// observable), and that the `display:contents` wrapper carrying the handlers generates no box — a stray
// box inside a virtualized list is exactly what would corrupt row measurement and perturb the
// transcript's own settle (#1181).
test("#1180 a fine pointer RESTING on a row warms that room's roster read, and only that room's", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const list = await mount(<ChatListSurfaceStory />);
  const row = list.getByRole("button", { name: /A grand adventure/u }).first();
  await expect(row).toBeVisible();

  await row.hover();
  // The WHOLE input list, not a count, and not a separate "nothing warmed at mount" one-shot (which would
  // be a non-retrying read of mutable async state — the DEF-14 class). One array equality carries every
  // half of the claim: the hovered room was warmed, no OTHER room was, and rendering the list warmed
  // nothing on its own — a mount-time prefetch would have put both fixtures in here and this could never
  // match a one-element array.
  await expect.poll(() => trpc.inputs("chat.getChat")).toEqual([{ chatId: "chat_adventure" }]);
});

test("#1180 the intent wrapper is display:contents — it generates no box and moves no row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const list = await mount(<ChatListSurfaceStory />);
  const row = list.getByRole("button", { name: /A grand adventure/u }).first();
  await expect(row).toBeVisible();

  // The wrapper is found by WHAT IT IS rather than by a slot name it does not carry: the nearest ancestor
  // that takes no part in layout. `null` here would mean the wrapper started generating a box, which is
  // the regression this pins.
  await expect
    .poll(async () =>
      row.evaluate((el: HTMLElement) => {
        let node: HTMLElement | null = el.parentElement;
        while (node !== null) {
          if (globalThis.getComputedStyle(node).display === "contents") {
            return true;
          }
          node = node.parentElement;
        }
        return false;
      }),
    )
    .toBe(true);
});

// -- #1361 item 3: THE PHONE'S CHROME BUDGET, and the faces strip that bought the last of it ----------
// The characters twin's posture, one section over (`character/surfaces/character-library-surface.ct.tsx`,
// "#1661 the phone's chrome budget"): a RATCHET on the pixels this pane spends before the thing the reader
// came for, so the number cannot drift back without a red.
//
// WHAT WAS MEASURED (430x740 coarse, live main 2026-09-04): 299px of chrome before the first chat row, of
// which the #1350 month fold took 22 - leaving 285. The FACES STRIP is ~85 of that remainder and is the
// largest single band left, so the owner ruled it folds on the phone landing (#1361 item 3, 2026-09-05).
// The mechanism is the month bound's, deliberately reused rather than re-invented: a `Collapsible` whose
// trigger carries the scope in force.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium (`page.emulateMedia` has no
// `pointer` feature), and the first assertion PROVES the emulation landed before any geometry is trusted -
// at a fine pointer these controls are shorter and a fence would pass while measuring the wrong device.
// `mobile` on the story is the shell's published viewport regime (`setMobileViewport`), which is the axis
// the fold itself reads; the two are independent and BOTH are required for this to be a phone.
//
// MEASURED HERE, both arms, and the number has moved TWICE - each step its own red-first receipt:
//   · 181px  the two secondaries unfolded (pre-#1361)
//   · 156px  each folded behind a disclosure of ITS OWN (#1361 item 3 / #1350)
//   · 104px  both behind ONE Filters row (#1718 arm A) - the number this fence now holds
// The last step is 52px, which is MORE than the 44px trigger box it removes: the second disclosure was also
// spending the column's `gap="row"` above it, and a band that leaves takes its gap with it. WIDTH-INVARIANT
// across the phone band, for the same reason the characters pane is - nothing in the folded chrome wraps at
// either end - so the smaller phone is no worse and the bigger one no better. 106 is the measured number
// plus 2px of sub-pixel headroom.
//
// A FOLD BUYS `band - 44`, NOT THE BAND. That is why #1361's second fold returned only 25 of the ~69px it
// hid, and it is the arithmetic that made ONE row the right shape: the two facts now share one trigger box
// instead of renting two.
//
// THE HEADROOM IS 2px, SO THE SMALLEST OVERSHOOT THIS FENCE REFUSES IS 3px (#1776, measured with a planted
// `pt-[Npx]` on `chat-list-phone-filters.tsx`): at +2 the closed chrome lands on 106 exactly and passes a
// `<=` ceiling by design, at +3 both arms go red. Worth stating because "the fence still catches a 2px
// regression" is the natural thing to assume of a ratchet and is not true of this one — the sub-pixel
// headroom the number was minted with is spent on exactly that.
const CHAT_PHONE_CHROME_CEILING_PX = 106;
const CHAT_PHONE_CHROME_ARMS = [
  { width: 320, ceiling: CHAT_PHONE_CHROME_CEILING_PX },
  { width: 390, ceiling: CHAT_PHONE_CHROME_CEILING_PX },
] as const;

test.describe("#1361 the chats pane's phone chrome budget", () => {
  test.use({ hasTouch: true });

  for (const arm of CHAT_PHONE_CHROME_ARMS) {
    test(`at ${String(arm.width)}px coarse the folded chrome above the first chat row holds its budget`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });
      const component = await mount(<ChatListSurfaceStory mobile={true} width={arm.width} />);
      await expect(component.getByText("A grand adventure")).toBeVisible();

      expect(await settledChatPhoneChrome(component, page)).toBeLessThanOrEqual(arm.ceiling);
    });

    // THE FENCE'S OWN POSITIVE CONTROL, one per arm - a ceiling that never moves is indistinguishable from
    // a constant the test happens to read. The same measurement is taken in the state that must exceed it:
    // the Filters row OPEN, which is the chrome this pane spends with both secondaries on screen - i.e. what
    // the desktop column spends, and what the phone spent before the folds landed.
    test(`at ${String(arm.width)}px coarse the Filters row OPEN exceeds that budget - the fence measures, it does not assert`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });
      const component = await mount(<ChatListSurfaceStory mobile={true} width={arm.width} />);
      await expect(component.getByText("A grand adventure")).toBeVisible();
      expect(await settledChatPhoneChrome(component, page)).toBeLessThanOrEqual(arm.ceiling);

      await component.getByRole("button", { name: "Filters", exact: true }).click();
      // VISIBLE IS NOT OPEN (#1776): the panel's content mounts a frame before the Collapsible's height
      // animation has pushed the list down, so this assertion is the START of the barrier, never the end
      // of it — the settled read below is what makes the number a fact about the OPEN pane.
      await expect(component.getByLabel("Show chats up to")).toBeVisible();
      expect(await settledChatPhoneChrome(component, page)).toBeGreaterThan(arm.ceiling);
    });
  }
});

// #1361 item 3 -> #1718 arm A -> #1735 (side-eye 2026-09-05) - THE FOLD ITSELF, in the two claims a fold
// owes: the faces are not rendered while folded, and the TRIGGER carries the scope in force. #1361's own
// trigger is gone (the pane pays for ONE); #1735 then found the trigger restating the character scope the
// `ChatListFilterChip` already names, so the pin is RE-SPELLED again: the trigger stays at its neutral name
// and the CHIP is what "carries the scope in force" for the character axis (`Filtered: Aria Nightshade ✕`,
// exercised in full at the `#1718/#1735` test above). The strip keeps its own name INSIDE the panel (#208's
// one string), which is a different fact from the group's, and both are asserted here so neither can absorb
// the other.
test("#1361/#1718 @mobile: the faces strip folds behind the shared trigger, which stays neutral while the chip carries the scope", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });
  const component = await mount(<ChatListSurfaceStory mobile={true} width={390} />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // FOLDED: no face row on screen, and the search field - the primary - still is.
  await expect(component.getByRole("textbox", { name: "Search chats" })).toBeVisible();
  await expect(component.getByRole("list", { name: "Filter by character" })).toHaveCount(0);

  // Opening the ONE trigger reveals the SAME strip, announced by the same one name (#208).
  await component.getByRole("button", { name: "Filters", exact: true }).click();
  const strip = component.getByRole("list", { name: "Filter by character" });
  await expect(strip).toBeVisible();

  // Scoping to a face leaves the trigger at its neutral name (#1735) - the chip below it is the one place
  // that now says "Aria Nightshade".
  await strip.getByRole("button", { name: "Show chats with Aria Nightshade" }).click();
  await expect(component.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  await expect(component.locator('[data-slot="badge"]').getByText("Aria Nightshade", { exact: true })).toBeVisible();
});

/** The pane's chrome: the distance from the story root's top edge to the list of chats. */
async function chatPhoneChrome(component: Locator): Promise<number> {
  const list = component.getByRole("list", { name: "Chats list" });
  const [paneBox, listBox] = await Promise.all([component.boundingBox(), list.boundingBox()]);
  return Math.round((listBox?.y ?? 0) - (paneBox?.y ?? 0));
}

/**
 * THE SAME MEASUREMENT, TAKEN ON A SETTLED PANE (#1776, the #1686 barrier discipline).
 *
 * The budget arms were reading a number that was still moving. The tell was the fence's OWN positive
 * control: after clicking Filters it waited for `Show chats up to` to be VISIBLE and then measured — and
 * `toBeVisible()` resolves the frame the panel is inserted, while Base UI's `Collapsible` is still
 * animating its height, so the chats list had not been pushed down yet and the read came back 104, the
 * CLOSED chrome, against a `> 106` assertion. Reproduced 7 times in 20 under `--repeat-each=5`; it passed
 * alone because a fast frame finished the animation inside the assertion's own latency.
 *
 * The barrier is the state the number is ABOUT, in three parts and in this order:
 *   1. FONTS — the bands above the list are typeset, so which pixel row the list starts at is a function of
 *      the real face. A face swapping in after the read moves the answer.
 *   2. EVERY FINITE ANIMATION ON THE PAGE has reached `finished`. That is the Collapsible's height
 *      animation and any co-motion beside it, read as `Animation` objects rather than guessed at with a
 *      wall-clock poll (a fixed budget is exactly what stretches past under lane load). Infinite
 *      animations — a spinner — are excluded by construction: their `finished` never resolves.
 *   3. TWO CONSECUTIVE EQUAL READINGS, which is what makes it a SETTLED state rather than a state that
 *      merely started. This is also the guard against a vacuous pass in the other direction: a pane that
 *      never began moving reads the same number twice immediately and returns it, so the closed arm cannot
 *      be held open by the barrier itself.
 *
 * Deliberately NOT a widened ceiling. 106 is a measured budget (`CHAT_PHONE_CHROME_CEILING_PX`'s own note);
 * raising it to swallow a race would retire the ratchet the number exists to be.
 */
async function settledChatPhoneChrome(component: Locator, page: Page): Promise<number> {
  await page.evaluate(async (): Promise<boolean> => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().iterations ?? Number.POSITIVE_INFINITY))
        // A cancelled animation REJECTS `finished`; a cancelled animation is also a finished movement.
        .map(async (animation) => await animation.finished.catch(() => undefined)),
    );
    return true;
  });
  let settled: number | null = null;
  await expect
    .poll(
      async (): Promise<boolean> => {
        const current = await chatPhoneChrome(component);
        const stable = settled !== null && settled === current;
        settled = current;
        return stable;
      },
      { intervals: [16, 32, 64, 128, 256] },
    )
    .toBe(true);
  if (settled === null) {
    throw new Error("chat phone chrome: never reached two consecutive equal readings");
  }
  return settled;
}
