// A reply a display script styled renders in ONE routed card frame on a row whose card tier is the sandboxed one
// (D354): the real transcript (`MessageListSurface`) over a corpus room, with a native DISPLAY script the viewer
// created through `regex.createScript`, the room's reads served by the corpus root and the card-frame mint and
// serve answered by the root's own HTTP entry. The script's `<style>` applies inside the frame and never lands in
// the main document; with the character set to plain text the same reply renders through the inert path with no
// style; model-written markup that no script produced keeps today's path; a link inside the frame opens only
// through the confirm, which a scripted frame can neither raise without a click in it, nor change, nor raise again
// after a Cancel; an expired handle mints again instead of showing the expiry notice; and the frame grows with 200%
// and 300% text on a phone instead of clipping.
//
// A hostile frame is played by evaluating in the frame's own document: `parent.postMessage` from there is exactly
// what a reply's own script could send.
import { CARD_FRAME_ROUTE, rendersTrustedHtml } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { REPLY_LINK_CONFIRM_LABEL } from "#client/features/chat/lib/reply-frame-names.ts";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const REPLY_FRAME = '[data-slot="reply-frame"]';
const SANDBOX = '[data-slot="sandbox-frame"]';
const VIEWER_PASSWORD = "styled-reply-viewer-password";
const BANNER_COLOR = "rgb(244, 162, 97)";
const LINK_URL = "https://example.test/sola";
const SWAPPED_URL = "https://swapped.test/elsewhere";
const EXTERNAL_PAGES = "https://*.test/**";
// A well-formed handle no mint ever produced: its serve is the server's own miss notice.
const UNKNOWN_HANDLE = "0".repeat(32);
const FOCUS_PRESS_BUDGET = 4;
// The shape of the Sola preset's scene banner: a `<style>` block with keyframes, an inline SVG, inline styles and
// a `<details>` bar, all in the script's own template, with the model's attribute spliced in.
const BANNER_TEMPLATE = [
  '<div class="w6p-banner" style="display:flex;gap:8px;padding:8px 11px;border-left:2px solid #F4A261">',
  "<style>.w6p-banner strong{color:#F4A261;animation:w6pGlow 2s infinite;}@keyframes w6pGlow{50%{opacity:.6;}}</style>",
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#F3B74B"/></svg>',
  '<strong id="w6p-location">$1</strong>',
  '<details class="w6p-bar"><summary>Scene notes</summary><p id="w6p-notes">Hearth smoke, damp stone</p></details>',
  `<a id="w6p-link" href="${LINK_URL}">Sola hub</a>`,
  '<a id="w6p-internal" href="/settings">Settings</a>',
  "</div>",
].join("");
const BANNER_FIND = String.raw`/<scene_header location="([^"<>]*)" \/>/g`;
const STYLED_BODY = '<scene_header location="Camelot · Great Hall" />\n\nGuinevere sets down her goblet. "You are late, Arthur."';
const BARE_HTML_BODY = '<div style="color:#F4A261" id="w6p-bare">\n<p>Model-written markup</p>\n<p>with its own inline style</p>\n</div>';
const TRANSCRIPT_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings", "plugin.list", "plugin.listSurfaces", "regex.listScripts"] as const;

interface StyledRoom {
  readonly root: Root;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly messageId: MessageId;
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, plus the viewer's banner script. */
async function openStyledRoom(body: string): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness());
  const caller = await root.internalCallerFor(root.ownerId);
  const banner = await caller.regex.createScript({
    input: { name: "Scene banner", findRegex: BANNER_FIND, replaceString: BANNER_TEMPLATE, targets: ["AI_OUTPUT"], passes: ["display"] },
  });
  // A library script runs only where it is attached; globally, it reaches every room the viewer opens.
  await caller.regex.attachGlobal({ scriptId: banner.id });
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const detail = await caller.chat.getChat({ chatId: row.id });
    const trusted = new Set(
      detail.participants.flatMap((seat) =>
        seat.characterId !== null && seat.renderPolicy !== undefined && rendersTrustedHtml(seat.renderPolicy.htmlTrust) ? [seat.characterId] : [],
      ),
    );
    const { messages } = await caller.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null && trusted.has(message.characterId));
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      construction.move();
      return { root, chatId: row.id, characterId: reply.characterId, messageId: reply.id };
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

interface FrameTraffic {
  mints: number;
  serves: number;
}

/** Answer the card-frame mint and serve from the page with the root's own HTTP entry, under the viewer's session.
 *  The first `missServes` serves ask the root for a handle no mint produced, so they get its real miss notice. */
async function routeCardFrames(page: Page, root: Root, missServes = 0): Promise<FrameTraffic> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic: FrameTraffic = { mints: 0, serves: 0 };
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const isMint = request.method() === "POST";
    const missed = !isMint && traffic.serves < missServes;
    traffic.mints += isMint ? 1 : 0;
    traffic.serves += isMint ? 0 : 1;
    const sent = await request.allHeaders();
    const headers: Record<string, string> = { cookie, forwarded: "" };
    for (const name of [CSRF_HEADER, "content-type"]) {
      const value = sent[name.toLowerCase()];
      if (value !== undefined) {
        headers[name] = value;
      }
    }
    const body = request.postData();
    const path = missed ? `${CARD_FRAME_ROUTE}/${UNKNOWN_HANDLE}` : new URL(request.url()).pathname;
    const response = await root.http.request(path, { method: request.method(), headers, ...(body === null ? {} : { body }) });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  return traffic;
}

interface Corpus {
  readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] };
}

/** The room's reads and its card-frame traffic, routed to `root`. Declare it with `await using` AFTER the root: it is
 *  disposed first, and disposal removes the routes and waits for any handler still answering, so no request the page
 *  makes after the case ends reaches a closed root. */
async function serveRoom(page: Page, root: Root, corpus: Corpus, missServes = 0): Promise<FrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  const traffic = await routeCardFrames(page, root, missServes);
  return Object.assign(traffic, {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await page.unrouteAll({ behavior: "wait" });
    },
  });
}

/** Every external page a popup asked for: `window.open` from the confirm lands here instead of the network. */
async function recordExternalPages(page: Page): Promise<string[]> {
  const opened: string[] = [];
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    opened.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  return opened;
}

let barrierPx = 100_000;

/** Post `message` from inside the reply frame, as the reply's own script could, and wait until the host has handled
 *  it: a height report posted right after it from the same window is handled after it, and its growth is visible. */
async function postFromFrame(page: Page, message: Readonly<Record<string, unknown>>): Promise<void> {
  barrierPx += 1000;
  const px = barrierPx;
  await page
    .frameLocator(`${REPLY_FRAME} ${SANDBOX}`)
    .locator("html")
    .evaluate(
      (_node, { posted, height }) => {
        parent.postMessage(posted, "*");
        parent.postMessage({ orbCardFrameHeight: height }, "*");
      },
      { posted: message, height: px },
    );
  await expect
    .poll(async () => await page.locator(`${REPLY_FRAME} ${SANDBOX}`).evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(px);
}

/** Every `<style>` text in the MAIN document — the frame's document is a separate one and is never read here. */
async function mainDocumentStyles(page: Page): Promise<string> {
  return await page.evaluate(() => [...document.querySelectorAll("style")].map((node) => node.textContent).join("\n"));
}

test("a display script's banner draws in one routed frame with its own style, which never reaches the main document", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const frame = page.locator(`${REPLY_FRAME}[data-delivery="routed"] ${SANDBOX}`);
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  const location = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location");
  await expect(location).toHaveText("Camelot · Great Hall");
  // The script's own `<style>` outranks the app's prose rules, and its `strong` and SVG shape keep their tags.
  expect(await location.evaluate((node) => [node.tagName, getComputedStyle(node).color])).toEqual(["STRONG", BANNER_COLOR]);
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator(".w6p-banner svg circle")).toHaveCount(1);
  // The model's own prose rides the same frame, in the transcript's prose.
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).getByText("You are late, Arthur.", { exact: false })).toBeVisible();
  expect(await mainDocumentStyles(page)).not.toContain("w6p-banner");
  await expect(page.locator(".w6p-banner")).toHaveCount(0);
  await expect(frame).toHaveAttribute("title", /\S/u);
});

test("on a row whose character renders plain text the same reply draws through the inert path with no style", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  // Positive control: the script ran on this row (its output text is on screen), so the absence below is the tier's doing.
  await expect(page.getByText("Camelot · Great Hall", { exact: true })).toBeVisible();
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
  expect(await mainDocumentStyles(page)).not.toContain("w6p-banner");
  const color = await page.getByText("Camelot · Great Hall", { exact: true }).evaluate((node) => getComputedStyle(node).color);
  expect(color).not.toBe(BANNER_COLOR);
});

test("model-written markup no display script produced keeps today's path in a normal room", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(BARE_HTML_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.getByText("Model-written markup", { exact: true })).toBeVisible();
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
  await expect(page.locator(SANDBOX)).toHaveCount(0);
});

test("a link inside the frame opens nothing until the confirm, which names the address", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const link = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link");
  await expect(link).toBeVisible();
  const before = page.context().pages().length;
  await link.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(LINK_URL);
  expect(page.context().pages()).toHaveLength(before);
});

test("a frame's link message raises nothing unless the click was in that frame", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link")).toBeVisible();
  // A click elsewhere in the app gives the page a live activation; the frame then posts a link on its own.
  await page.locator('[data-slot="message-bubble"] p').first().click();
  await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  // Positive control: a click on the frame's own link still raises the confirm.
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link").click();
  await expect(page.getByRole("alertdialog")).toContainText(LINK_URL);
});

test("an open confirm keeps its address, and Open opens exactly the address it shows", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const opened = await recordExternalPages(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link").click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(LINK_URL);
  // The frame still holds focus and the click's activation is live: the strongest moment for a swap.
  await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
  await expect(confirm).toContainText(LINK_URL);
  await expect(confirm).not.toContainText(SWAPPED_URL);
  await confirm.getByRole("button", { name: REPLY_LINK_CONFIRM_LABEL, exact: true }).click();
  await expect.poll(() => [...opened]).toEqual([LINK_URL]);
});

test("after a Cancel the frame's links raise nothing until it remounts", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const link = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link");
  await link.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await link.click();
  await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("a link to the app's own origin never reaches the confirm", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-internal").click();
  await postFromFrame(page, {});
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  // Positive control: the external link in the same frame still reaches it.
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link").click();
  await expect(page.getByRole("alertdialog")).toContainText(LINK_URL);
});

test("an expired frame handle mints again and the reply draws, never the expiry notice", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, 1);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("a handle that is gone again after its fresh mint leaves the reply on the inert path", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, 2);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  // The inert path also shows while a mint is pending, so the settled outcome is read off the traffic first: the
  // second miss has been served, and the frame that loaded it is gone.
  await expect.poll(() => traffic.serves).toBe(2);
  await expect(page.locator(SANDBOX)).toHaveCount(0);
  await expect(page.locator(`${REPLY_FRAME}[data-delivery="fallback"]`)).toBeVisible();
  await expect(page.getByText("Camelot · Great Hall", { exact: true })).toBeVisible();
  // Given up: no third mint and no further serve.
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("the framed prose reads in the transcript's own type: the app stylesheet and tokens reach the frame", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  // The prose paragraph, not its quoted span: the quote carries its own tint, which the native neighbour has none of.
  const framed = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("p", { hasText: "Guinevere sets down her goblet." });
  await expect(framed).toBeVisible();
  // A native neighbour: the first row's prose, drawn in the main document by the same markdown seal.
  const native = page.locator('[data-slot="message-bubble"] p').first();
  // The frame's base rule closes every family list with one generic fallback of its own, so the list is compared
  // by its first family.
  const read = async (node: typeof native): Promise<readonly string[]> =>
    await node.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.fontFamily.slice(0, style.fontFamily.indexOf(",")), style.fontSize, style.lineHeight, style.fontWeight, style.color];
    });
  await expect.poll(async () => await read(framed)).toEqual(await read(native));
});

test("a sheet the page cannot read and a stylesheet the app did not build never reach the frame, which still draws", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  // An extension-style cross-origin sheet, and an injected `<style>` the way the owner's custom theme is applied.
  await page.addInitScript(
    ({ leak }) => {
      // An init script runs in every frame; the sheets belong to the app page only.
      if (globalThis.window !== globalThis.top) {
        return;
      }
      document.addEventListener("DOMContentLoaded", () => {
        const foreign = document.createElement("link");
        foreign.rel = "stylesheet";
        foreign.href = "https://unreadable.example.test/sheet.css";
        const injected = document.createElement("style");
        injected.textContent = `.${leak}, [data-slot="message-bubble"] p { outline: 3px solid rgb(1, 2, 3); }`;
        document.head.append(foreign, injected);
      });
    },
    { leak: "w6p-leak" },
  );
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  // Positive control: the injected rule is live in the main document.
  expect(
    await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => sheet.ownerNode instanceof HTMLStyleElement && sheet.ownerNode.textContent.includes("w6p-leak")),
    ),
  ).toBe(true);
  await expect(page.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const frameHtml = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("html");
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  const leaked = await frameHtml.evaluate((node) => {
    const html = node.outerHTML;
    const at = Math.max(html.indexOf("w6p-leak"), html.indexOf("rgb(1, 2, 3)"));
    return at < 0 ? "" : html.slice(Math.max(0, at - 300), at + 100);
  });
  expect(leaked).toBe("");
});

test("focus moves through the frame and out again in both directions, never trapped", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const link = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link");
  await expect(link).toBeVisible();
  // The frame holds three stops (the notes summary and two links): a few presses either way must leave it.
  const pressesToLeave = async (key: string): Promise<number> => {
    await link.focus();
    for (let presses = 1; presses <= FOCUS_PRESS_BUDGET; presses += 1) {
      await page.keyboard.press(key);
      const outside = await page.evaluate(
        () => document.activeElement !== null && document.activeElement.tagName !== "IFRAME" && document.activeElement !== document.body,
      );
      if (outside) {
        return presses;
      }
    }
    return Number.POSITIVE_INFINITY;
  };
  expect(await pressesToLeave("Tab")).toBeLessThanOrEqual(FOCUS_PRESS_BUDGET);
  expect(await pressesToLeave("Shift+Tab")).toBeLessThanOrEqual(FOCUS_PRESS_BUDGET);
});

for (const fontScale of [2, 3] as const) {
  test.describe(`at ${String(fontScale * 100)}% text on a phone`, () => {
    test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true });

    test("the frame grows to its content: nothing clips and the page never scrolls sideways", async ({ corpus, mount, page }) => {
      const room = await openStyledRoom(STYLED_BODY);
      await using root = room.root;
      await using _routes = await serveRoom(page, root, corpus);
      await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale });
      const frame = page.locator(`${REPLY_FRAME} ${SANDBOX}`);
      await expect(frame).toHaveAttribute("data-delivery", "routed");
      const content = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("body");
      await expect
        .poll(async () => {
          const inner = await content.evaluate((node) => node.scrollHeight);
          const outer = await frame.evaluate((node) => node.getBoundingClientRect().height);
          return outer >= inner;
        })
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      // Markup wider than the column (an author's flex row at 300%) may scroll sideways inside the frame, never clip.
      const clipped = await content.evaluate((body) => {
        const clips = ["hidden", "clip"];
        const roots = [document.documentElement, body].map((node) => getComputedStyle(node).overflowX);
        const right = Math.max(0, ...[...body.querySelectorAll("*")].map((element) => element.getBoundingClientRect().right));
        return roots.some((overflow) => clips.includes(overflow)) && right > body.clientWidth + 1 ? `${roots.join("/")} ${right}` : "";
      });
      expect(clipped).toBe("");
    });
  });
}
