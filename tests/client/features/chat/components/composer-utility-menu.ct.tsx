// CT: the composer's ✨ utility menu (composer-utility-menu.tsx), mounted through the real composer. In a
// shared room both image doors post the generated picture into the chat, so the Media group states it; a
// solo room keeps the bare group label. The sentence rides the group label, which is the group's accessible
// name, so it is asserted through the group's role and name as well as on screen.

import { ROOM_PICTURES_NOTE } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcFixtureOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ComposerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES } from "../fixtures.ts";

type ParticipantFixture = NonNullable<TrpcFixtureOutput<"chat.getChat">["participants"]>[number];

function human(key: string, role: "host" | "member", leftSeq: number | null = null): ParticipantFixture {
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
