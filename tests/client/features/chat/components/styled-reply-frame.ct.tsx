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
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import { SCROLL_END_THRESHOLD_PX } from "@orb/ui/message-list";
import type { Locator, Page } from "@playwright/test";
import { REPLY_LINK_CONFIRM_LABEL } from "#client/features/chat/lib/reply-frame-names.ts";
import { REPLY_LINK_FIRST_WAIT_MS, REPLY_LINK_FREE_CANCELS } from "#client/features/chat/lib/reply-link-pace.ts";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";
import type { StyledReplyStreamStory } from "./_styled-reply-stream-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const REPLY_FRAME = '[data-slot="reply-frame"]';
const SANDBOX = '[data-slot="sandbox-frame"]';
const VIEWER_PASSWORD = "styled-reply-viewer-password";
const BANNER_COLOR = "rgb(244, 162, 97)";
const LINK_URL = "https://example.test/sola";
const LINK_TWO_URL = "https://example.test/sola-notes";
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
  `<a id="w6p-link-two" href="${LINK_TWO_URL}">Sola notes</a>`,
  "</div>",
].join("");
const BANNER_FIND = String.raw`/<scene_header location="([^"<>]*)" \/>/g`;
const STYLED_BODY = '<scene_header location="Camelot · Great Hall" />\n\nGuinevere sets down her goblet. "You are late, Arthur."';
const BARE_HTML_BODY = '<div style="color:#F4A261" id="w6p-bare">\n<p>Model-written markup</p>\n<p>with its own inline style</p>\n</div>';
const LONG_BODY = "Arthur crosses the great hall without a word, past the hearth and the long tables, and stops before the dais. ".repeat(8).trim();
const BUBBLE = '[data-slot="message-bubble"]';
const PHONE_VIEWPORT = { width: 320, height: 640 } as const;
// Two boxes laid out at the same width can differ by a rounding step of the device pixel grid.
const SUBPIXEL_PX = 1;
const FORMING_CHIP = '[data-slot="forming-card-chip"]';
const STREAM_STORY = "tests/client/features/chat/components/_styled-reply-stream-stories/StyledReplyStreamStory";
const CHUNK_LABEL = "Stream the next chunk";
// The styled body as a provider would stream it, cut inside its tag, inside an attribute, and inside the prose.
const STREAM_CHUNKS = [
  "<scene_hea",
  'der location="Camelot · Gr',
  'eat Hall" />',
  "\n\nGuinevere sets down",
  ' her goblet. "You are late,',
  ' Arthur."',
] as const;
// A director block a display script deletes, with a blank line inside, streamed around its tags and its prose.
const DIRECTOR_FIND = String.raw`/<director_notes>[\s\S]*?<\/director_notes>/g`;
// Then a details panel whose body is hidden until opened, with its own style block, streamed the same way.
const DIRECTOR_SPOILERS = ["Mordred", "gallery", "Seeds", "Spoilers", "lantern"] as const;
const DIRECTOR_CHUNKS = [
  "Guinevere sets down her goblet.",
  "\n\n<director_no",
  "tes>\nThe twist: Mordred",
  " waits in the gallery.\n\nSeeds: the",
  " gallery door\n</director_notes>",
  "\n\n<details><summary>Spoil",
  "ers</summary>\n<style>.w6p-hid{color:#F4A2",
  "61}</style>\n\nThe lantern",
  " is lit.\n</details>",
  "\n\nShe waits for an answer.",
] as const;
const END_GAP_KEY = "w6pWidestEndGap";
const PINNED_ROOM_COPIES = 3;
const TALL_PANEL_TAG = "<scene_tall />";
const TALL_PANEL_FIND = String.raw`/<scene_tall \/>/g`;
const TALL_PANEL_TEMPLATE = '<div class="w6p-tall" style="block-size:30rem;border:1px solid">Tall panel</div>';
const WIDE_TABLE = [
  "| Witness | Seal | Notes | Hall | Hour | Weather | Ledger | Verdict |",
  "| - | - | - | - | - | - | - | - |",
  // Unbroken cells: a table's columns take at least their longest word, so these overflow any reply's measure.
  `| ${Array.from({ length: 8 }, () => "witness-testimony-under-seal-of-the-court").join(" | ")} |`,
].join("\n");
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
  await caller.regex.createScript({ input: { name: "Scene banner", findRegex: BANNER_FIND, replaceString: BANNER_TEMPLATE, placement: ["DISPLAY"] } });
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

interface FrameServing {
  /** The first this many serves ask the root for a handle no mint produced, so they get its real miss notice. */
  readonly missServes?: number;
  /** Every mint is answered only once this settles, so the reply holds its pending state until then. */
  readonly mintsWait?: Promise<void>;
  /** Every frame document is served only once this settles, so a routed frame cannot draw until then. */
  readonly servesWait?: Promise<void>;
}

/** The request headers the root reads, under the viewer's session cookie. */
function forwardedHeaders(sent: Readonly<Record<string, string>>, cookie: string): Record<string, string> {
  const headers: Record<string, string> = { cookie, forwarded: "" };
  for (const name of [CSRF_HEADER, "content-type"]) {
    const value = sent[name.toLowerCase()];
    if (value !== undefined) {
      headers[name] = value;
    }
  }
  return headers;
}

/** Answer the card-frame mint and serve from the page with the root's own HTTP entry, under the viewer's session. */
async function routeCardFrames(page: Page, root: Root, { missServes = 0, mintsWait, servesWait }: FrameServing): Promise<FrameTraffic> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic: FrameTraffic = { mints: 0, serves: 0 };
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const isMint = request.method() === "POST";
    await (isMint ? mintsWait : servesWait);
    const missed = !isMint && traffic.serves < missServes;
    traffic.mints += isMint ? 1 : 0;
    traffic.serves += isMint ? 0 : 1;
    const headers = forwardedHeaders(await request.allHeaders(), cookie);
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
async function serveRoom(page: Page, root: Root, corpus: Corpus, serving: FrameServing = {}): Promise<FrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  const traffic = await routeCardFrames(page, root, serving);
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

// What markup or CSS source looks like on screen: a tag's bracket, a rule's brace, or a name the template's CSS holds.
const SOURCE_MARKERS = ["<", ">", "{", "}", "w6pGlow", "@keyframes", "border-left", "#F4A261"] as const;
const SOURCE_HITS_KEY = "w6pSourceHits";
const SOURCE_SEEN_KEY = "w6pSourceSeen";
const SOURCE_HIT_SEPARATOR = "\n--\n";

/** The source markers `text` shows. */
function sourceIn(text: string): readonly string[] {
  return SOURCE_MARKERS.filter((marker) => text.includes(marker));
}

/** From before mount, check the text of every node `watched` matches on every DOM change: each source marker it ever
 *  showed lands in {@link sourceSeen}'s hits, with the text that showed it, and its longest text is kept as the positive
 *  control that the watch saw the row at all. */
async function watchForSource(page: Page, watched: string, shown: readonly string[] = SOURCE_MARKERS): Promise<void> {
  await page.addInitScript(
    ({ selector, markers, hitsKey, seenKey, separator }) => {
      if (globalThis.window !== globalThis.top) {
        return;
      }
      const hits = new Set<string>();
      let seen = "";
      const scan = (text: string): void => {
        for (const marker of markers) {
          const at = text.indexOf(marker);
          if (at !== -1) {
            hits.add(`${marker} in: ${text.slice(Math.max(0, at - 60), at + 60)}`);
          }
        }
      };
      const sample = (): void => {
        for (const node of document.querySelectorAll(selector)) {
          seen = node.textContent.length > seen.length ? node.textContent : seen;
          scan(node.textContent);
        }
        document.documentElement.dataset[hitsKey] = [...hits].join(separator);
        document.documentElement.dataset[seenKey] = seen;
      };
      new MutationObserver(sample).observe(document, { subtree: true, childList: true, characterData: true });
    },
    { selector: watched, markers: shown, hitsKey: SOURCE_HITS_KEY, seenKey: SOURCE_SEEN_KEY, separator: SOURCE_HIT_SEPARATOR },
  );
}

/** What {@link watchForSource} recorded so far. */
async function sourceSeen(page: Page): Promise<{ readonly hits: readonly string[]; readonly seen: string }> {
  const { hits, seen } = await page.evaluate(
    ({ hitsKey, seenKey }) => ({ hits: document.documentElement.dataset[hitsKey] ?? "", seen: document.documentElement.dataset[seenKey] ?? "" }),
    { hitsKey: SOURCE_HITS_KEY, seenKey: SOURCE_SEEN_KEY },
  );
  return { hits: hits === "" ? [] : hits.split(SOURCE_HIT_SEPARATOR), seen };
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
  // The template's text and safe structure read; its `<style>` content and markup source never print.
  const row = page.locator(`[data-slot="message-row"][data-message-id="${room.messageId}"] ${BUBBLE}`);
  await expect(row.locator("details summary")).toHaveText("Scene notes");
  expect(sourceIn((await row.textContent()) ?? "")).toEqual([]);
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

test("a Cancel closes only the confirm: the same link and another link each raise it again", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const frame = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`);
  const confirm = page.getByRole("alertdialog");
  for (const [id, address] of [
    ["#w6p-link", LINK_URL],
    ["#w6p-link", LINK_URL],
    ["#w6p-link-two", LINK_TWO_URL],
  ] as const) {
    await frame.locator(id).click();
    await expect(confirm).toContainText(address);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
  }
  // Keyboard Enter on a link raises it too.
  await frame.locator("#w6p-link").press("Enter");
  await expect(confirm).toContainText(LINK_URL);
});

test("a frame that raises the confirm again and again with no click is paced, and its request is kept, not dropped", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const confirm = page.getByRole("alertdialog");
  const cancel = async (): Promise<void> => {
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
  };
  // One click in the frame gives it focus and the page an activation, as a reader's would.
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link").click();
  await expect(confirm).toContainText(LINK_URL);
  await cancel();
  // The host cannot tell the frame's own script from a reader's click: the free Cancels raise it at once.
  for (let cancels = 1; cancels <= REPLY_LINK_FREE_CANCELS; cancels += 1) {
    await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
    await expect(confirm).toContainText(SWAPPED_URL);
    await cancel();
  }
  // Past them the request waits: handled (the barrier) but no confirm yet, then the same address once the wait ends.
  await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
  await expect(confirm).toHaveCount(0);
  await expect(confirm).toContainText(SWAPPED_URL, { timeout: REPLY_LINK_FIRST_WAIT_MS * 3 });
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
  await using traffic = await serveRoom(page, root, corpus, { missServes: 1 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("a handle that is gone again after its fresh mint leaves the reply on the inert path", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { missServes: 2 });
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
  // The frame holds four stops (the notes summary and three links): a few presses either way must leave it.
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

/** The styled room with long unstyled replies above the styled one, so the transcript scrolls and the styled reply is
 *  its last row. Copies of the styled reply supply the rows, as a swipe-free duplicate does in the product. The styled
 *  reply also carries a tall panel, so its frame lands taller than its held state, the way a preset's panels do. */
async function openPinnedRoom(): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const body = `${STYLED_BODY}\n\n${TALL_PANEL_TAG}`;
  const room = await openStyledRoom(body);
  construction.use(room.root);
  const caller = await room.root.internalCallerFor(room.root.ownerId);
  await caller.regex.createScript({ input: { name: "Tall panel", findRegex: TALL_PANEL_FIND, replaceString: TALL_PANEL_TEMPLATE, placement: ["DISPLAY"] } });
  for (let copy = 0; copy < PINNED_ROOM_COPIES; copy += 1) {
    await caller.chat.duplicateMessage({ chatId: room.chatId, messageId: room.messageId });
  }
  const { messages } = await caller.chat.listMessages({ chatId: room.chatId });
  const last = messages.at(-1);
  if (last === undefined || last.characterId !== room.characterId) {
    throw new Error("The styled reply's copies did not land at the end of the room");
  }
  for (const message of messages) {
    if (message.id !== last.id && message.characterId === room.characterId && message.content === body) {
      await caller.chat.editMessage({ chatId: room.chatId, messageId: message.id, content: LONG_BODY, timeZone: UTC_TIME_ZONE });
    }
  }
  construction.move();
  return { ...room, messageId: last.id };
}

test("from mount to framed the row shows its prose and a forming panel, never the template's markup or CSS", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  const row = `[data-slot="message-row"][data-message-id="${room.messageId}"]`;
  await watchForSource(page, `${row} ${BUBBLE}`);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const host = page.locator(`${row} ${REPLY_FRAME}`);
  await expect(host).toHaveAttribute("data-delivery", "held");
  await expect(host.locator(FORMING_CHIP)).toHaveCount(1);
  await expect(host).toContainText("You are late, Arthur.");
  mints.resolve();
  await expect(host.locator(SANDBOX)).toHaveAttribute("data-delivery", "routed");
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  const { hits, seen } = await sourceSeen(page);
  expect(seen).toContain("You are late, Arthur.");
  expect(hits).toEqual([]);
});

/** Press the stream control once per chunk; each chunk paints before the next arrives: two animation frames, so the
 *  commit and its layout have landed. */
async function streamEachChunk(page: Page, chunks: readonly string[], afterEach?: (chunk: string) => Promise<void>): Promise<void> {
  for (const chunk of chunks) {
    await page.getByRole("button", { name: CHUNK_LABEL, exact: true }).click();
    await page.evaluate(async () => {
      for (let frame = 0; frame < 2; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    await afterEach?.(chunk);
  }
}

test("a routed frame stays hidden behind the held run until its document draws, so no empty frame ever shows", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  const serves = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { servesWait: serves.promise });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const host = page.locator(REPLY_FRAME);
  const frame = host.locator(SANDBOX);
  // The mint has routed, so the frame is mounted and loading; its document cannot arrive yet.
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  await expect(frame).toBeHidden();
  await expect(host.locator(FORMING_CHIP)).toBeVisible();
  await expect(host).toContainText("You are late, Arthur.");
  serves.resolve();
  await expect(frame).toHaveAttribute("data-drawn", "");
  await expect(frame).toBeVisible();
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  await expect(host.locator(FORMING_CHIP)).toHaveCount(0);
});

test("a styled reply streams its prose and forms its panel, and no markup or CSS source shows at any moment", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const ghost = '[data-slot="ghost-message-row"]';
  await watchForSource(page, `${ghost} [data-slot="ghost-stream-body"]`);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: STREAM_CHUNKS,
    chunkLabel: CHUNK_LABEL,
  });
  const body = page.locator(`${ghost} [data-slot="ghost-stream-body"]`);
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  const endGap = async (): Promise<number> => await scroller.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  await streamEachChunk(page, STREAM_CHUNKS, async (chunk) => {
    expect(await endGap(), chunk).toBeLessThanOrEqual(SCROLL_END_THRESHOLD_PX);
  });
  await expect(body.locator(FORMING_CHIP)).toHaveCount(1);
  await expect(body).toContainText("You are late, Arthur.");
  const { hits, seen } = await sourceSeen(page);
  expect(seen).toContain("You are late, Arthur.");
  expect(hits).toEqual([]);
});

test("a block a display script deletes and a details panel with a style block never show while the reply streams, with no styling script", async ({
  corpus,
  mount,
  page,
}) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  // The deleting script alone: it draws no markup, so nothing would style the reply, yet the block must still hold.
  for (const script of await caller.regex.listScripts()) {
    await caller.regex.removeScript({ scriptId: script.id });
  }
  await caller.regex.createScript({ input: { name: "Director notes", findRegex: DIRECTOR_FIND, replaceString: "", placement: ["DISPLAY"] } });
  await using _routes = await serveRoom(page, root, corpus);
  const ghost = '[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]';
  await watchForSource(page, ghost, [...SOURCE_MARKERS, ...DIRECTOR_SPOILERS]);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: DIRECTOR_CHUNKS,
    chunkLabel: CHUNK_LABEL,
  });
  await streamEachChunk(page, DIRECTOR_CHUNKS);
  // Positive control: the prose on both sides of the block streamed, so the watch read the row as it formed.
  await expect(page.locator(ghost)).toContainText("Guinevere sets down her goblet.");
  await expect(page.locator(ghost)).toContainText("She waits for an answer.");
  const { hits } = await sourceSeen(page);
  expect(hits).toEqual([]);
});

test("a framed reply's height follows its content down from a taller held state, and back down when a drawer closes", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const host = page.locator(REPLY_FRAME);
  await expect(host).toHaveAttribute("data-delivery", "held");
  const heldPx = (await sizeOf(host)).height;
  mints.resolve();
  const frame = host.locator(SANDBOX);
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  const reply = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("[data-frame-reply]");
  const contentPx = async (): Promise<number> => await reply.evaluate((node) => Math.ceil(node.getBoundingClientRect().bottom));
  const framePx = async (): Promise<number> => (await sizeOf(frame)).height;
  // Positive control: the held state stands taller than the framed content, so the frame has to come down.
  expect(heldPx).toBeGreaterThan(await contentPx());
  await expect.poll(async () => Math.abs((await framePx()) - (await contentPx()))).toBeLessThanOrEqual(SUBPIXEL_PX);
  const closedPx = await framePx();
  const drawer = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator(".w6p-bar summary");
  await drawer.click();
  await expect.poll(framePx).toBeGreaterThan(closedPx);
  await drawer.click();
  await expect.poll(async () => Math.abs((await framePx()) - closedPx)).toBeLessThanOrEqual(SUBPIXEL_PX);
});

test("a reader pinned to the end stays pinned while the newest reply's frame lands, and through a swipe of it", async ({ corpus, mount, page }) => {
  const room = await openPinnedRoom();
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: STREAM_CHUNKS,
    chunkLabel: CHUNK_LABEL,
    swipeOf: room.messageId,
  });
  const row = `[data-slot="message-row"][data-message-id="${room.messageId}"]`;
  const host = page.locator(`${row} ${REPLY_FRAME}`);
  await expect(host).toHaveAttribute("data-delivery", "held");
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  const endGap = async (): Promise<number> => await scroller.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  // Positive control: the transcript scrolls, and the reader starts at its end.
  expect(await scroller.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(SCROLL_END_THRESHOLD_PX);
  await expect.poll(endGap).toBeLessThanOrEqual(SUBPIXEL_PX);
  // From here on, every layout in which the list or a row changes size records how far the reader sits from the end, as
  // it will paint: a resize observer made after the list's own runs after the list's in the same delivery, which comes
  // after layout and before paint. A frame callback would read the layout before the list had its turn. A row that
  // mounts later (the swipe's live row) is watched from the moment it mounts.
  await scroller.evaluate((node, key) => {
    const record = (): void => {
      const gap = node.scrollHeight - node.scrollTop - node.clientHeight;
      document.documentElement.dataset[key] = String(Math.max(Number(document.documentElement.dataset[key] ?? "0"), gap));
    };
    const sizes = new ResizeObserver(record);
    const watch = (): void => {
      for (const watched of [node, ...node.querySelectorAll('[data-slot="message-list-viewport"], [data-slot="message-list-row"]')]) {
        sizes.observe(watched);
      }
    };
    watch();
    // Only to watch new rows: a mutation callback runs before layout, so a read there sees no frame that will paint.
    new MutationObserver(watch).observe(node, { subtree: true, childList: true });
  }, END_GAP_KEY);
  const widestGap = async (): Promise<number> => await page.evaluate((key) => Number(document.documentElement.dataset[key] ?? "0"), END_GAP_KEY);
  mints.resolve();
  const frame = host.locator(SANDBOX);
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  const reply = page.frameLocator(`${row} ${REPLY_FRAME} ${SANDBOX}`).locator("[data-frame-reply]");
  await expect
    .poll(async () => Math.abs((await sizeOf(frame)).height - (await reply.evaluate((node) => Math.ceil(node.getBoundingClientRect().bottom)))))
    .toBeLessThanOrEqual(SUBPIXEL_PX);
  expect(await widestGap(), "while the frame landed").toBeLessThanOrEqual(SCROLL_END_THRESHOLD_PX);
  // The swipe: its live reply takes the framed row's place, from its first chunk to its last.
  await streamEachChunk(page, STREAM_CHUNKS);
  await expect(page.locator('[data-slot="ghost-message-row"]')).toContainText("You are late, Arthur.");
  expect(await widestGap(), "through the swipe").toBeLessThanOrEqual(SCROLL_END_THRESHOLD_PX);
});

test("a wide table in a bubble-style framed reply scrolls inside its row with a cue, and the page never scrolls sideways", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(`${STYLED_BODY}\n\n${WIDE_TABLE}`);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle: "bubble" } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const scroller = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator('[data-streamdown="table-wrapper"] > :has(> table)');
  await expect(scroller).toBeVisible();
  const box = await scroller.evaluate((node) => ({
    overflows: node.scrollWidth > node.clientWidth,
    frameOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    attachment: getComputedStyle(node).backgroundAttachment,
  }));
  // The table overflows its own box, which scrolls; the frame's document does not, so no column is cut at its edge.
  expect(box.overflows).toBe(true);
  expect(box.frameOverflow).toBeLessThanOrEqual(0);
  // The cue: edge shades that scroll with the table (`local`) over shades fixed to the box (`scroll`).
  expect(box.attachment).toContain("local");
  await scroller.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

interface WidthRoom extends StyledRoom {
  readonly longReplyId: MessageId;
}

/** The styled room in `chatStyle`, with a copy of the styled reply, same speaker, rewritten as one long unstyled paragraph. */
async function openWidthRoom(chatStyle: ThemeChatStyle): Promise<WidthRoom> {
  await using construction = new AsyncDisposableStack();
  const room = await openStyledRoom(STYLED_BODY);
  construction.use(room.root);
  const caller = await room.root.internalCallerFor(room.root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle } });
  const copy = await caller.chat.duplicateMessage({ chatId: room.chatId, messageId: room.messageId });
  await caller.chat.editMessage({ chatId: room.chatId, messageId: copy.id, content: LONG_BODY, timeZone: UTC_TIME_ZONE });
  construction.move();
  return { ...room, longReplyId: copy.id };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

async function sizeOf(locator: Locator): Promise<Size> {
  return await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

const WIDTHS = [
  { name: "desktop", use: {} },
  { name: "phone", use: { viewport: PHONE_VIEWPORT, hasTouch: true, isMobile: true } },
] as const;

for (const width of WIDTHS) {
  test.describe(`at ${width.name} width`, () => {
    test.use(width.use);

    forEachNonEmpty(THEME_CHAT_STYLES, "THEME_CHAT_STYLES", (chatStyle) => {
      test(`${chatStyle}: a styled reply takes a long unstyled reply's width, pending and framed, and only its content changes height`, async ({
        corpus,
        mount,
        page,
      }) => {
        const room = await openWidthRoom(chatStyle);
        await using root = room.root;
        const mints = Promise.withResolvers<void>();
        await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
        await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
        const row = (id: MessageId): Locator => page.locator(`[data-slot="message-row"][data-message-id="${id}"]`);
        const host = row(room.messageId).locator(REPLY_FRAME).first();
        const styled = row(room.messageId)
          .locator(BUBBLE)
          .filter({ has: page.locator(REPLY_FRAME) })
          .first();
        const long = row(room.longReplyId).locator(BUBBLE).first();
        await expect(long).toContainText(LONG_BODY.slice(0, LONG_BODY.indexOf(".")));
        await expect(host).toHaveAttribute("data-delivery", "held");
        const longWidth = (await sizeOf(long)).width;
        const pending = { bubble: await sizeOf(styled), content: await sizeOf(host) };
        mints.resolve();
        const frame = host.locator(SANDBOX);
        await expect(frame).toHaveAttribute("data-delivery", "routed");
        // The frame loads lazily, and the long reply below can hold it off a phone's screen.
        await frame.scrollIntoViewIfNeeded();
        // Settled once the frame holds its whole document: the height it reported is the frame's own.
        const body = host.frameLocator(SANDBOX).locator("body");
        await expect
          .poll(async () => (await frame.evaluate((node) => node.getBoundingClientRect().height)) >= (await body.evaluate((node) => node.scrollHeight)))
          .toBe(true);
        const framed = { bubble: await sizeOf(styled), content: await sizeOf(host) };
        // The bubble moves no further than its content does, and the same way: a box with a floor of its own (echo's art
        // tile) may move less.
        const bubbleMove = framed.bubble.height - pending.bubble.height;
        const contentMove = framed.content.height - pending.content.height;
        expect(
          {
            pending: Math.abs(pending.bubble.width - longWidth) <= SUBPIXEL_PX,
            framed: Math.abs(framed.bubble.width - longWidth) <= SUBPIXEL_PX,
            height: Math.abs(bubbleMove) <= Math.abs(contentMove) + SUBPIXEL_PX && bubbleMove * contentMove >= -SUBPIXEL_PX,
          },
          `long ${String(longWidth)}, pending ${JSON.stringify(pending)}, framed ${JSON.stringify(framed)}`,
        ).toEqual({ pending: true, framed: true, height: true });
      });
    });
  });
}

for (const fontScale of [2, 3] as const) {
  test.describe(`at ${String(fontScale * 100)}% text on a phone`, () => {
    test.use({ viewport: PHONE_VIEWPORT, hasTouch: true, isMobile: true });

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
