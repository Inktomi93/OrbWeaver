// CT: the composer's ✨ utility menu (composer-utility-menu.tsx), mounted through the real composer. In a
// shared room both image doors post the generated picture into the chat, so the Media group states it; a
// solo room keeps the bare group label. The sentence rides the group label, which is the group's accessible
// name, so it is asserted through the group's role and name as well as on screen.

import { ROOM_PICTURES_NOTE } from "@orb/client/lib";
import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatSurfaceContributorStory, ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, COMPOSER_CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

type ParticipantFixture = NonNullable<TrpcFixtureOutput<"chat.getChat">["participants"]>[number];

function human(key: string, role: ParticipantRole, leftSeq: number | null = null): ParticipantFixture {
  return {
    id: `chat_participant_${key}`,
    kind: "human",
    userId: `user_ct_${key}`,
    characterId: null,
    role,
    displayName: key,
    leftSeq,
  };
}

function roomWith(participants: readonly ParticipantFixture[]): TrpcFixtureOutput<"chat.getChat"> {
  return { ...CHAT_ROOM_ROUTES["chat.getChat"], participants, viewerIsHost: true };
}

async function openMediaGroup(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Message tools", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Generate image from text" })).toBeVisible();
}

test("a shared room states at the image doors that generated pictures post into the chat", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": roomWith([human("hostess", "host"), human("guest", "member")]) });
  await mount(<ComposerStory />);
  await openMediaGroup(page);

  const note = page.locator('[data-slot="composer-room-pictures-note"]');
  await expect(note).toHaveText(ROOM_PICTURES_NOTE);
  await expect(note).toBeVisible();
  await expect(page.getByRole("group", { name: `Media ${ROOM_PICTURES_NOTE}`, exact: true })).toBeVisible();
});

test("a solo room keeps the bare Media label", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": roomWith([human("hostess", "host")]) });
  await mount(<ComposerStory />);
  await openMediaGroup(page);

  await expect(page.getByRole("group", { name: "Media", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="composer-room-pictures-note"]')).toHaveCount(0);
});

test("a member who left does not make a room shared", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    "chat.getChat": roomWith([human("hostess", "host"), human("gone", "member", 4)]),
  });
  await mount(<ComposerStory />);
  await openMediaGroup(page);

  await expect(page.locator('[data-slot="composer-room-pictures-note"]')).toHaveCount(0);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "narrow", width: 900, height: 800 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name}: the sentence wraps inside the menu popup and the popup stays in the viewport`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": roomWith([human("hostess", "host"), human("guest", "member")]) });
    await mount(<ComposerStory />);
    await openMediaGroup(page);

    const note = page.locator('[data-slot="composer-room-pictures-note"]');
    await expect(note).toBeVisible();
    await expect
      .poll(() =>
        note.evaluate((el: HTMLElement) => {
          const popup = el.closest('[role="menu"]');
          const own = el.getBoundingClientRect();
          const box = popup === null ? own : popup.getBoundingClientRect();
          return {
            noOverflow: el.scrollWidth <= el.clientWidth,
            insidePopup: own.right <= box.right + 1 && own.left >= box.left - 1,
            popupInViewport: box.left >= 0 && box.right <= window.innerWidth,
          };
        }),
      )
      .toEqual({ noOverflow: true, insidePopup: true, popupInViewport: true });
  });
}

// ── The Media group is reachable on a phone. The menu scrolls inside a height bound, so a group that sits past
// the bound is behind a scroll nothing on screen announces. Image actions are a main use of this menu, so the
// Media group's first item must be inside the popup's visible box the moment it opens, with the room sentence on.
for (const viewport of [
  { name: "360x640", width: 360, height: 640 },
  { name: "360x780", width: 360, height: 780 },
] as const) {
  test(`${viewport.name}: the Media group's first item is visible when the menu opens`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": roomWith([human("hostess", "host"), human("guest", "member")]) });
    await mount(<ComposerStory />);
    await page.getByRole("button", { name: "Message tools", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // The room sentence is the tallest part of the group and the reason it slid out of view; wait for it.
    await expect(page.locator('[data-slot="composer-room-pictures-note"]')).toHaveCount(1);

    const attach = page.getByTestId("composer-attach-images");
    await expect
      .poll(() =>
        attach.evaluate((el: HTMLElement) => {
          const popup = el.closest('[role="menu"]');
          const item = el.getBoundingClientRect();
          const box = popup === null ? item : popup.getBoundingClientRect();
          return {
            scrolled: popup === null ? -1 : popup.scrollTop,
            insidePopup: item.top >= box.top - 1 && item.bottom <= box.bottom + 1,
            insideViewport: item.top >= 0 && item.bottom <= window.innerHeight,
          };
        }),
      )
      .toEqual({ scrolled: 0, insidePopup: true, insideViewport: true });
  });
}

// Gallery has one menu home in Options. Its ownership filter and store dispatch survive removing the
// single-character Tools shortcut; a guest must never receive another owner's door.

function characterSeat(key: string, name: string): ParticipantFixture {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_ct_${key}`,
    role: "member",
    displayName: name,
    leftSeq: null,
  };
}

/** A shared room with Aria seated: the host owns her, the guest owns nothing. Shared, so the Media label's
 *  room note is the rendered sign that this roster has landed. */
function galleryRoom(viewerOwnsAria: boolean): TrpcFixtureOutput<"chat.getChat"> {
  return {
    ...roomWith([human("hostess", "host"), human("guest", "member"), characterSeat("aria", "Aria")]),
    viewerGalleryCharacterId: viewerOwnsAria ? "character_ct_aria" : null,
    viewerOwnedCharacterIds: viewerOwnsAria ? ["character_ct_aria"] : [],
  };
}

for (const viewport of [
  { name: "mobile", width: 360, height: 780 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`${viewport.name}: the gallery has one menu home in Options, not Tools`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": galleryRoom(true) });
    const component = await mount(<ComposerStory />);
    await openMediaGroup(page);

    await expect(page.getByRole("menuitem", { name: /gallery/u })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Chat options", exact: true }).click();
    const door = page.getByRole("menuitem", { name: "Aria's gallery", exact: true });
    await expect(door).toBeInViewport();
    await door.click();
    await expect(component.getByTestId("composer-gallery-target")).toHaveText(`character_ct_aria|Aria|${COMPOSER_CHAT_ID}`);
  });

  test(`${viewport.name}: a viewer who owns no character in the room gets no gallery row`, async ({ mount, page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.getChat": galleryRoom(false) });
    await mount(<ComposerStory />);
    await openMediaGroup(page);

    // Both menus must be settled before the permission-shaped absence is asserted.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Chat options", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Close chat", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /gallery/u })).toHaveCount(0);
  });
}

test.describe("owned galleries on a touch pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 780 } });
  test("both owned-character rows dispatch their own gallery and chat context", async ({ mount, page }) => {
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.getChat": {
        ...galleryRoom(true),
        participants: [human("hostess", "host"), characterSeat("aria", "Aria"), characterSeat("bryn", "Bryn")],
        viewerOwnedCharacterIds: ["character_ct_aria", "character_ct_bryn"],
      },
    });
    const component = await mount(<ComposerStory />);
    for (const [id, name] of [
      ["aria", "Aria"],
      ["bryn", "Bryn"],
    ] as const) {
      await component.getByRole("button", { name: "Chat options", exact: true }).tap();
      await page.getByRole("menuitem", { name: "Character galleries", exact: true }).tap();
      await page.getByRole("menuitem", { name, exact: true }).tap();
      await expect(component.getByTestId("composer-gallery-target")).toHaveText(`character_ct_${id}|${name}|${COMPOSER_CHAT_ID}`);
    }
  });
});

for (const action of [
  { label: "Undo continuation", route: "chat.undoContinue" },
  { label: "Revert continuation", route: "chat.revertContinue" },
] as const) {
  test(`${action.label} remains keyboard-reachable and targets the tail assistant`, async ({ mount, page }) => {
    const tail = makeMessageView({ role: "assistant", hasContinuation: true });
    const calls = await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.listMessages": makeMessagesPage([tail]),
      "chat.undoContinue": tail,
      "chat.revertContinue": tail,
    });
    const component = await mount(<ComposerStory tailRole="assistant" tailAssistantMessageId={tail.id} />);
    const tools = component.getByRole("button", { name: "Message tools", exact: true });
    await tools.focus();
    await page.keyboard.press("Enter");
    const continuation = page.getByRole("menuitem", { name: "Continuation", exact: true });
    await continuation.focus();
    await page.keyboard.press("ArrowRight");
    const item = page.getByRole("menuitem", { name: action.label, exact: true });
    await expect(item).toBeEnabled();
    await item.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("menu", { name: "Continuation", exact: true })).toBeHidden();
    await expect(continuation).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await item.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(tools).toBeFocused();
    await expect.poll(() => calls.lastInput(action.route)).toEqual({ chatId: COMPOSER_CHAT_ID, messageId: tail.id });
  });
}

const COMPOSER_CONTRIBUTION_ROUTES = {
  ...CHAT_AMBIENT_ROUTES,
  ...CHAT_ROOM_ROUTES,
  "chat.previewContextFit": {
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    limit: null,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  },
};

for (const width of [1440, 360]) {
  test.describe(`composer contributions at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width === 360 });
    test("composer-action survives regrouping inside the fill slot", async ({ mount, page }) => {
      await routeTrpc(page, COMPOSER_CONTRIBUTION_ROUTES);
      const component = await mount(<ChatSurfaceContributorStory anchor="composer-action" visible={true} />);
      const bar = component.locator('[data-slot="action-bar"]');
      const contribution = bar.locator('[data-slot="action-bar-fill"]').getByText("fake composer-action", { exact: true });
      await expect(contribution).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await contribution.evaluate((node) => {
            const host = node.closest('[data-slot="action-bar"]')?.getBoundingClientRect();
            const box = node.getBoundingClientRect();
            return host !== undefined && box.left >= host.left && box.right <= host.right;
          });
          return bounds;
        })
        .toEqual(true);
      await expect(bar.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
    });
    for (const anchor of ["composer-room", "composer-media"] as const) {
      test(`${anchor} survives regrouping in Message tools`, async ({ mount, page }) => {
        await routeTrpc(page, COMPOSER_CONTRIBUTION_ROUTES);
        const component = await mount(<ChatSurfaceContributorStory anchor={anchor} visible={true} />);
        await expect(component.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
        await component.getByRole("button", { name: "Message tools", exact: true }).click();
        await expect(page.getByRole("menu", { name: "Message tools", exact: true }).getByText(`fake ${anchor}`, { exact: true })).toBeVisible();
      });
    }
  });
}
