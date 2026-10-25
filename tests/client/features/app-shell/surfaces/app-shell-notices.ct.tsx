// The shell's notice overlay and its stray-file guard: a notice never moves the content column, a burst stays inside
// the overlay's cap, the empty overlay passes the pointer through, and only a file nothing else handled is swallowed.
import { dropOn, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AppShellModalStory, AppShellNoticeStory, AppShellRoomStory, AppShellStory } from "./_app-shell-stories.tsx";
import { namedGroupRoom, routeRoom, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
// The Add document dialog's own reads, past Home's captures.
// Three wrapped lines of detail, so a burst of three outgrows the overlay's cap.
const LONG_DETAIL =
  "The card imported, but two of its lorebook entries named a book this library does not hold, so they were set aside for you to place by hand. Open the import notes to see which entries and where they came from.";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeRoom(page, corpus, await root.internalCallerFor(root.ownerId));
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

interface NoticeGeometry {
  readonly prevented: boolean;
  readonly before: { x: number; y: number; width: number; height: number };
  readonly after: { x: number; y: number; width: number; height: number };
  readonly toastTop: number;
  readonly chromeBottom: number;
}

/** Raise one notice the production way, a stray file drop, and measure the content column either side of it. */
async function raiseStrayNotice(page: Page): Promise<NoticeGeometry> {
  const main = page.locator("main.shell-content");
  const before = await settledBox(main);
  const prevented = await dropOn(main, { file: "card.png", type: "image/png" });
  const toast = await settledBox(page.locator('[data-slot="toast-root"]'));
  const topbar = await settledBox(page.locator(".shell-topbar"));
  return { prevented, before, after: await settledBox(main), toastTop: toast.y, chromeBottom: topbar.y + topbar.height };
}

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("a notice leaves the content column where it was and clears the topbar", async ({ mount, page }) => {
    await mount<typeof AppShellStory>(STORY, {});
    const geometry = await raiseStrayNotice(page);
    expect(geometry.prevented).toBe(true);
    expect(geometry.after).toEqual(geometry.before);
    // The overlay hangs below the chrome row it sits under.
    expect(geometry.toastTop).toBeGreaterThanOrEqual(geometry.chromeBottom - 1);
    await expect(page.locator('[data-slot="toast-viewport"]')).toHaveCSS("position", "fixed");
  });

  test("in an open room a notice leaves the composer clear", async ({ mount, page }) => {
    await seedShellState(page, { activeSection: "chats" });
    const room = namedGroupRoom((await (await root.internalCallerFor(root.ownerId)).chat.listChats({ limit: 100 })).items);
    await mount<typeof AppShellRoomStory>(`${SHELL_STORIES}/AppShellRoomStory`, { chatId: room.id });
    const composer = page.locator('[data-slot="composer"]');
    await expect(composer).toBeVisible();
    const geometry = await raiseStrayNotice(page);
    expect(geometry.prevented).toBe(true);
    expect(geometry.after).toEqual(geometry.before);
    const [toast, field] = await Promise.all([settledBox(page.locator('[data-slot="toast-root"]')), settledBox(composer)]);
    const apart =
      toast.y + toast.height <= field.y || field.y + field.height <= toast.y || toast.x + toast.width <= field.x || field.x + field.width <= toast.x;
    expect(apart).toBe(true);
  });
});

test("on a desktop a notice leaves the content column where it was and clears the topbar", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount<typeof AppShellStory>(STORY, {});
  const geometry = await raiseStrayNotice(page);
  expect(geometry.prevented).toBe(true);
  expect(geometry.after).toEqual(geometry.before);
  // The overlay hangs below the chrome row it sits under.
  expect(geometry.toastTop).toBeGreaterThanOrEqual(geometry.chromeBottom - 1);
  await expect(page.locator('[data-slot="toast-viewport"]')).toHaveCSS("position", "fixed");
});

test("a burst stays inside the overlay's resolved cap, and the capped overlay takes the wheel between notices", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount<typeof AppShellNoticeStory>(`${SHELL_STORIES}/AppShellNoticeStory`, { title: "Imported with notes", description: LONG_DETAIL });
  const raise = page.getByRole("button", { name: "Raise a notice", exact: true });
  await raise.click();
  await raise.click();
  await raise.click();
  const notices = page.locator('[data-slot="toast-root"]');
  const overlay = page.locator('[data-slot="toast-viewport"]');
  await expect(notices).toHaveCount(3);
  const cap = await overlay.evaluate((node) => Number.parseFloat(getComputedStyle(node).maxHeight));
  expect(cap).toBeGreaterThan(0);
  await expect.poll(() => overlay.evaluate((node) => node.getBoundingClientRect().height)).toBeLessThanOrEqual(cap);
  await expect.poll(() => overlay.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0);

  const main = page.locator("main.shell-content");
  const mainBefore = await settledBox(main);
  const first = await settledBox(notices.nth(0));
  const second = await settledBox(notices.nth(1));
  const box = await settledBox(overlay);
  await page.mouse.move(box.x + box.width / 2, (first.y + first.height + second.y) / 2);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => overlay.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await settledBox(main)).toEqual(mainBefore);
});

test("the empty overlay intercepts nothing, and takes the pointer back once it holds a notice", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  const overlay = page.locator('[data-slot="toast-viewport"]');
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
  await expect(overlay).toHaveCSS("pointer-events", "none");
  expect(await dropOn(page.locator("main.shell-content"), { file: "card.png", type: "image/png" })).toBe(true);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
  await expect(overlay).toHaveCSS("pointer-events", "auto");
});

test("a soft keyboard marks the root keyboard-up while it is open, and clears it when it closes", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  await expect(page.locator(".shell-rail")).toBeVisible();
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-keyboard-up");
  // An iOS-shaped keyboard: the visual viewport loses most of its lower half.
  await page.evaluate(() => {
    const viewport = globalThis.visualViewport;
    if (viewport === null) {
      throw new Error("no visualViewport");
    }
    Object.defineProperty(viewport, "height", { configurable: true, get: () => globalThis.innerHeight - 336 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(html).toHaveAttribute("data-keyboard-up", "");
  await page.evaluate(() => {
    const viewport = globalThis.visualViewport;
    if (viewport === null) {
      throw new Error("no visualViewport");
    }
    Reflect.deleteProperty(viewport, "height");
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect(html).not.toHaveAttribute("data-keyboard-up");
});

test("a file dropped where nothing imports is swallowed with a notice, and a dragged text is left alone", async ({ mount, page }) => {
  await mount<typeof AppShellStory>(STORY, {});
  const main = page.locator("main.shell-content");
  await expect(page.locator(".shell-rail")).toBeVisible();
  // A text drag's insertion is the browser's own default; cancelling it would break dropping text into a field.
  expect(await dropOn(main, { text: "some dragged prose" })).toBe(false);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
  expect(await dropOn(main, { file: "card.png", type: "image/png" })).toBe(true);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
});

test("a file dropped on a real dropzone is the zone's to import, and raises no stray-drop notice", async ({ mount, page }) => {
  await mount<typeof AppShellModalStory>(`${SHELL_STORIES}/AppShellModalStory`, { modalId: "addDocument" });
  const zone = page.getByRole("dialog").locator('[data-slot="file-dropzone"]');
  await expect(zone).toBeVisible();
  const upload = page.waitForRequest(
    (request) => request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/") && !request.url().includes("/api/trpc/"),
  );
  expect(await dropOn(zone, { file: "notes.txt", type: "text/plain" })).toBe(true);
  await upload;
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
});
