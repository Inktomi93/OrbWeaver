// @subject packages/client/src/features/chat/components/chat-header-title.tsx
// @subject packages/client/src/components/title-reveal.tsx
// The room title in the topbar says all of itself by one press, tap or key, host or member. While its text is cut the title is the control that
// opens the whole title (the participants and the room's name), and the host's reveal also offers Rename, which starts the editor. While nothing
// is cut the host's press renames directly and a member's title carries no control. A control that holds an open reveal outlives the cut, so
// closing the reveal returns focus to it.

import { CHAT_NAME_FIELD_NAME, chatTitleWhole, RENAME_CHAT_NAME } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatId, UserId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const SERVED = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "notifications.presence",
  "invites.selfLeave",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;
const ROLES = ["host", "member"] as const;
const DESKTOP = { width: 1440, height: 900 } as const;
// Wide enough that the whole title fits the row once the window is, and long enough that it does not at the desktop width.
const ROOM_NAME =
  "The long vigil at the lighthouse keeper's cottage through the whole of the storm season, kept by lamplight while the surf broke on the rocks below";
const REVEAL_WIDTH = 2800;

test.use({ hasTouch: true, isMobile: false, viewport: DESKTOP });

/** Serve the corpus room the owner hosts and the shared member sits in, as one of the two people in it. */
async function routeSharedRoomAs(
  { root, page, corpus }: { readonly root: ServerTestHarness; readonly page: Page; readonly corpus: CorpusPlayback },
  role: (typeof ROLES)[number],
  roomName: string | null,
): Promise<{ readonly chatId: ChatId; readonly memberId: UserId }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const captured = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (captured === undefined || memberId === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so the viewer's caller is made after it is set.
  const host = await root.internalCallerFor(root.ownerId);
  await host.chat.updateTitle({ chatId: captured.id, title: roomName });
  const viewer = await root.internalCallerFor(role === "host" ? root.ownerId : memberId);
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, { ...serveCorpusProcedures(viewer, SERVED) });
  return { chatId: captured.id, memberId };
}

/** A room the owner hosts alone with one short-named character: its whole title fits the row, which the shared corpus room's four-character title does not. */
async function routeShortRoom({ root, page }: { readonly root: ServerTestHarness; readonly page: Page }): Promise<ChatId> {
  const owner = await root.internalCallerFor(root.ownerId);
  const wren = await owner.character.create({ input: createCharacterSchema.parse({ handle: "title-reveal-wren", name: "Wren", description: "A keeper." }) });
  const { chat } = await owner.chat.startChat({ characterIds: [wren.id], opening: "none" });
  await seedShellState(page, { activeSection: "chats" });
  await routeTrpc(page, { ...serveCorpusProcedures(owner, SERVED) });
  return chat.id;
}

const WIDE_IDENTITY = '.shell-topbar-identity[data-identity="wide"]';

/** Whether a title part of the wide identity is drawn cut by its line: the positive control that the whole text is not already on screen. */
function titleIsCut(page: Page): Promise<boolean> {
  return page
    .locator(WIDE_IDENTITY)
    .evaluate((identity) =>
      [...identity.querySelectorAll<HTMLElement>(".shell-topbar-title, .shell-topbar-subtitle")].some((part) => part.scrollWidth > part.clientWidth),
    );
}

/** The title the wide identity prints: the participants the row leads with, then the room's name. */
async function wholeTitle(page: Page): Promise<string> {
  const participants = (await page.locator(`${WIDE_IDENTITY} .shell-topbar-title`).textContent()) ?? "";
  return chatTitleWhole(participants, ROOM_NAME);
}

/** Wait until the title is drawn cut or uncut and the component has taken that state. The component learns a cut from a resize
 *  observer after the layout that causes it, so the drawn text alone says nothing about what a press does yet. A cut title's control
 *  announces its reveal; an uncut host title is a control with none; an uncut member title is no control. */
async function expectTitleSettled(page: Page, cut: boolean, role: (typeof ROLES)[number] = "host"): Promise<void> {
  await expect.poll(() => titleIsCut(page)).toBe(cut);
  const control = page.locator(`${WIDE_IDENTITY} [data-slot="title-reveal"]`).getByRole("button");
  const uncut = role === "host" ? "acts" : "plain";
  await expect
    .poll(() =>
      control.evaluateAll((found) => {
        const [first] = found;
        if (first === undefined) {
          return "plain";
        }
        return first.getAttribute("aria-haspopup") === "dialog" ? "reveals" : "acts";
      }),
    )
    .toBe(cut ? "reveals" : uncut);
}

/** The wide identity's title control, found by the room's name its accessible name carries. */
function titleControl(page: Page): Locator {
  return page.locator(WIDE_IDENTITY).getByRole("button", { name: ROOM_NAME });
}

for (const role of ROLES) {
  test.describe(`the ${role}`, () => {
    test("opens the whole title from a cut title when tapped", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId } = await routeSharedRoomAs({ root, page, corpus }, role, ROOM_NAME);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await expectTitleSettled(page, true, role);
      const whole = await wholeTitle(page);
      await titleControl(page).tap();
      const reveal = page.getByRole("dialog", { name: whole, exact: true });
      await expect(reveal.getByText(whole, { exact: true })).toBeVisible();
      await expect(reveal.getByRole("button", { name: RENAME_CHAT_NAME, exact: true })).toHaveCount(role === "host" ? 1 : 0);
    });

    test("carries a control only where there is something to press while the title fits", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const chatId = role === "host" ? await routeShortRoom({ root, page }) : (await routeSharedRoomAs({ root, page, corpus }, role, null)).chatId;
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await expect(page.locator(`${WIDE_IDENTITY} .shell-topbar-title`)).toBeVisible();
      await expectTitleSettled(page, false, role);
      // The host's title is the rename control; a member's is plain text.
      await expect(page.locator(`${WIDE_IDENTITY} [data-slot="title-reveal"]`).getByRole("button")).toHaveCount(role === "host" ? 1 : 0);
    });

    test("holds phrasing content only inside the cut title's control", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId } = await routeSharedRoomAs({ root, page, corpus }, role, ROOM_NAME);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await expect(titleControl(page)).toBeVisible();
      // The control holds the title's text parts (the positive control), and no block element among them.
      await expect(titleControl(page).locator(".shell-topbar-title")).toHaveCount(1);
      await expect(titleControl(page).locator("div, p")).toHaveCount(0);
    });

    test("keeps its place in the topbar row when it crosses between cut and uncut", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId } = await routeSharedRoomAs({ root, page, corpus }, role, ROOM_NAME);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      // The topbar row is the one box the control, the frame and the plain title all sit in; the width moves it, never the title inside it.
      const row = page.locator(WIDE_IDENTITY).locator("xpath=..");
      const participants = page.locator(`${WIDE_IDENTITY} .shell-topbar-title`);
      await expect(participants).toHaveCount(1);
      const offsetInRow = async (): Promise<{ readonly x: number; readonly y: number }> => {
        const [text, box] = [await participants.boundingBox(), await row.boundingBox()];
        if (text === null || box === null) {
          throw new Error("The title or its row is not drawn");
        }
        return { x: text.x - box.x, y: text.y - box.y };
      };
      await expectTitleSettled(page, true, role);
      const cut = await offsetInRow();
      await page.setViewportSize({ width: REVEAL_WIDTH, height: DESKTOP.height });
      // A member's control gives way to plain text here, so the title is measured only once that swap is done.
      await expectTitleSettled(page, false, role);
      const uncut = await offsetInRow();
      // Within a device pixel: the two widths round the box's own edge differently.
      expect(Math.abs(uncut.x - cut.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(uncut.y - cut.y)).toBeLessThanOrEqual(1);
    });

    test("keeps the control under an open reveal whose title stops being cut, and closing it returns focus there", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const { chatId } = await routeSharedRoomAs({ root, page, corpus }, role, ROOM_NAME);
      await mount<typeof ChatRoomShellStory>(STORY, { chatId });
      await expectTitleSettled(page, true, role);
      const whole = await wholeTitle(page);
      await titleControl(page).tap();
      const reveal = page.getByRole("dialog", { name: whole, exact: true });
      await expect(reveal).toBeVisible();
      await page.setViewportSize({ width: REVEAL_WIDTH, height: DESKTOP.height });
      await expect.poll(() => titleIsCut(page)).toBe(false);
      await expect(reveal).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(reveal).toBeHidden();
      await expect(titleControl(page)).toBeFocused();
    });
  });
}

test.describe("the host's press", () => {
  const Presses = {
    mouse: (control: Locator): Promise<void> => control.click(),
    touch: (control: Locator): Promise<void> => control.tap(),
    enter: async (control: Locator): Promise<void> => {
      await control.focus();
      await control.press("Enter");
    },
    space: async (control: Locator): Promise<void> => {
      await control.focus();
      await control.press("Space");
    },
  } as const;
  const States = [
    { name: "not cut", width: REVEAL_WIDTH, cut: false },
    { name: "cut", width: DESKTOP.width, cut: true },
  ] as const;

  for (const [input, press] of Object.entries(Presses)) {
    for (const state of States) {
      test(`${state.name}: a ${input} press ${state.cut ? "opens the whole title" : "starts the rename"}`, async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const { chatId } = await routeSharedRoomAs({ root, page, corpus }, "host", ROOM_NAME);
        await page.setViewportSize({ width: state.width, height: DESKTOP.height });
        await mount<typeof ChatRoomShellStory>(STORY, { chatId });
        await expectTitleSettled(page, state.cut);
        await press(titleControl(page));
        const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
        const reveal = page.getByRole("dialog", { name: await wholeTitle(page), exact: true });
        await expect(reveal).toHaveCount(state.cut ? 1 : 0);
        await expect(field).toHaveCount(state.cut ? 0 : 1);
      });
    }
  }

  test("a press released outside does nothing and leaves nothing behind for a later click", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { chatId } = await routeSharedRoomAs({ root, page, corpus }, "host", ROOM_NAME);
    await page.setViewportSize({ width: REVEAL_WIDTH, height: DESKTOP.height });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await expectTitleSettled(page, false);
    const box = await titleControl(page).boundingBox();
    await page.mouse.move((box?.x ?? 0) + 8, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await page.mouse.down();
    await page.mouse.move(8, DESKTOP.height - 8);
    await page.mouse.up();
    const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
    await expect(field).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The title is cut when the next activation arrives with no pointer press before it (assistive technology): it acts on the state it is in then.
    await page.setViewportSize(DESKTOP);
    await expectTitleSettled(page, true);
    await titleControl(page).dispatchEvent("click");
    await expect(page.getByRole("dialog", { name: await wholeTitle(page), exact: true })).toBeVisible();
    await expect(field).toHaveCount(0);
  });

  test("starts the editor from Rename inside the reveal, and Escape returns focus to the title control", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { chatId } = await routeSharedRoomAs({ root, page, corpus }, "host", ROOM_NAME);
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await expectTitleSettled(page, true);
    const whole = await wholeTitle(page);
    await titleControl(page).tap();
    await page.getByRole("dialog", { name: whole, exact: true }).getByRole("button", { name: RENAME_CHAT_NAME, exact: true }).tap();
    const field = page.getByRole("textbox", { name: CHAT_NAME_FIELD_NAME, exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
    await expect(titleControl(page)).toBeFocused();
  });
});
