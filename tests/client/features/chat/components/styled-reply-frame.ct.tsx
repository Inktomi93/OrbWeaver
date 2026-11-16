// A reply a display script styled renders in ONE routed card frame on a row whose card tier is the sandboxed one
// (D354): the real transcript (`MessageListSurface`) over a corpus room, with a native DISPLAY script the viewer
// created through `regex.createScript`, the room's reads served by the corpus root and the card-frame mint and
// serve answered by the root's own HTTP entry. The script's `<style>` applies inside the frame and never lands in
// the main document; with the character set to plain text the same reply renders through the inert path with no
// style; a panel the model wrote itself frames the same way, and plain markup it wrote keeps today's path; a link inside the frame opens only
// through the confirm, which a scripted frame can neither raise without a click in it, nor change, nor raise again
// after a Cancel; an expired handle mints again instead of showing the expiry notice; and the frame grows with 200%
// and 300% text on a phone instead of clipping.
//
// A hostile frame is played by evaluating in the frame's own document: `parent.postMessage` from there is exactly
// what a reply's own script could send.

import { spawn } from "node:child_process";
import { PLAIN_REPLY_REASON } from "@orb/client/lib";
import { rendersTrustedHtml } from "@orb/contracts/chat";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameServing, CardFrameTraffic } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { forEachNonEmpty } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { SCROLL_END_THRESHOLD_PX } from "@orb/ui/message-list";
import type { FrameLocator, Locator, Page } from "@playwright/test";
import { FRAMED_LINK_CONFIRM_LABEL } from "#client/components/framed-link-names.ts";
import { FRAMED_LINK_FIRST_WAIT_MS, FRAMED_LINK_FREE_CANCELS } from "#client/components/framed-link-pace.ts";
import { REPLY_CARRY_BUDGET_CHARS } from "#client/features/chat/lib/reply-parts.ts";
import type { RoutedCardTextScaleStory, RoutedReplyBesideFieldStory } from "./_routed-card-text-scale-stories.tsx";
import type { StyledReplyStreamStory } from "./_styled-reply-stream-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const REPLY_FRAME = '[data-slot="reply-frame"]';
const SANDBOX = '[data-slot="sandbox-frame"]';
const VIEWER_PASSWORD = "styled-reply-viewer-password";
const BANNER_COLOR = "rgb(244, 162, 97)";
const LINK_URL = "https://example.test/sola";
const LINK_TWO_URL = "https://example.test/sola-notes";
const SWAPPED_URL = "https://swapped.test/elsewhere";
const EXTERNAL_PAGES = "https://*.test/**";
const FOCUS_PRESS_BUDGET = 4;
// The row and its message actions come before its reply frame in the Tab order.
const ROW_STOPS_BUDGET = 12;
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
// A panel the model writes itself, as a provider would stream it: cut inside its tag's style attribute, inside the
// panel, and inside its script.
const MODEL_PANEL_CHUNKS = [
  'She looks up.\n\n<div class="w6p-panel" style="pad',
  'ding:4px">\n<b id="w6p-hp">HP 10</b>\n\n<scr',
  "ipt>run()</script>\n</div>",
  "\n\nThe hall waits.",
] as const;
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
const TRANSCRIPT_READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "plugin.transformForDisplay",
] as const;

interface StyledRoom {
  readonly root: Root;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly messageId: MessageId;
}

/** Create a display script on the model's replies and attach it globally: a library script runs only where it is
 *  attached, and globally it reaches every room the viewer opens. */
async function addDisplayScript(caller: Caller, name: string, findRegex: string, replaceString: string): Promise<void> {
  const script = await caller.regex.createScript({ input: { name, findRegex, replaceString, targets: ["AI_OUTPUT"], passes: ["display"] } });
  await caller.regex.attachGlobal({ scriptId: script.id });
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, plus the viewer's banner script. */
async function openStyledRoom(body: string, options?: Parameters<typeof createCorpusHarness>[1]): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness(undefined, options));
  const caller = await root.internalCallerFor(root.ownerId);
  await addDisplayScript(caller, "Scene banner", BANNER_FIND, BANNER_TEMPLATE);
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

interface Corpus {
  readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] };
}

/** The room's reads and its card-frame traffic, routed to `root`. Declare it with `await using` AFTER the root: it is
 *  disposed first, and disposal removes the routes and waits for any handler still answering, so no request the page
 *  makes after the case ends reaches a closed root. */
async function serveRoom(page: Page, root: Root, corpus: Corpus, serving: CardFrameServing = {}): Promise<CardFrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic = await routeCardFrames(page, root, cookie, serving);
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

// A tracker panel whose stylesheet opens after the panel's own tag and holds two blank lines and a comment: the
// Markdown parse ends that HTML block at the first blank line. Its last rule, after the second blank line, colors the
// summary.
const TRACKER_TEMPLATE = [
  '<div class="w6p-hud"><style>.w6p-hud{display:block} .w6p-hud *{margin:0}',
  "",
  ".w6p-hud details{padding:4px} .w6p-hud b{font-weight:600}",
  "",
  "/* Order check: keep the rows in place. */ .w6p-hud summary{color:#F4A261} .w6p-hud i *{padding:0}",
  '</style><details class="w6p-hud-bar"><summary id="w6p-hud-summary">Tracker</summary><div>Row one</div></details></div>',
].join("\n");
const TRACKER_FIND = String.raw`/<scene_hud \/>/g`;
const TRACKER_BODY = '<scene_hud />\n\nGuinevere sets down her goblet. "You are late, Arthur."';

test("a panel whose stylesheet holds blank lines draws whole in its frame: every rule applies and none prints", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(TRACKER_BODY);
  await using root = room.root;
  await addDisplayScript(await root.internalCallerFor(root.ownerId), "Tracker panel", TRACKER_FIND, TRACKER_TEMPLATE);
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(`${REPLY_FRAME}[data-delivery="routed"] ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const frame = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`);
  const summary = frame.locator("#w6p-hud-summary");
  await expect(summary).toBeVisible();
  // The rule after the stylesheet's second blank line reached the panel.
  expect(await summary.evaluate((node) => getComputedStyle(node).color)).toBe(BANNER_COLOR);
  // Positive control: the model's prose after the panel draws in the same frame.
  await expect(frame.getByText("You are late, Arthur.", { exact: false })).toBeVisible();
  // The text the reader sees: every text node in the frame's reply except a stylesheet's or script's own.
  const shown = await frame.locator(BUBBLE).evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text = "";
    for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
      text += current.parentElement?.closest("style, script") === null ? (current.textContent ?? "") : "";
    }
    return text;
  });
  expect(shown).toContain("You are late, Arthur.");
  expect(sourceIn(shown)).toEqual([]);
});

const CARD = '[data-slot="immersive-card"]';
const CARD_COLOR = "rgb(42, 157, 143)";
// A card written as a card beside the banner panel. Its body sits under the banner's own class, so the reply's
// stylesheet would color it if it reached the card's frame; its own CSS names the reply panel's element, so it would
// color that if it reached the reply's frame.
const MARKED_CARD_BODY = [
  '<scene_header location="Camelot · Great Hall" />',
  "",
  ':::card title="Ledger"',
  '<div class="w6p-banner"><strong id="w6p-card-strong">Ledger entry</strong></div><style>#w6p-location{color:#2A9D8F !important}</style>',
  ":::",
  "",
  'Guinevere sets down her goblet. "You are late, Arthur."',
].join("\n");

test("a marked card in a styled reply keeps its chrome in its own frame, and neither frame's stylesheet reaches the other", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(MARKED_CARD_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const card = page.locator(CARD);
  await expect(card.locator('[data-slot="immersive-card-header"]')).toBeVisible();
  await expect(card.locator('[data-slot="immersive-card-collapse"]')).toBeVisible();
  const cardStrong = card.locator(SANDBOX).contentFrame().locator("#w6p-card-strong");
  await expect(cardStrong).toHaveText("Ledger entry");
  // The script's panel draws in the reply's frames, with no card chrome around it.
  await expect(page.locator(`${REPLY_FRAME} ${CARD}`)).toHaveCount(0);
  const location = page.locator(REPLY_FRAME).first().locator(SANDBOX).contentFrame().locator("#w6p-location");
  await expect(location).toHaveText("Camelot · Great Hall");
  // Positive control: the panel's own stylesheet applies in the reply frame.
  expect(await location.evaluate((node) => getComputedStyle(node).color)).toBe(BANNER_COLOR);
  expect(await cardStrong.evaluate((node) => getComputedStyle(node).color)).not.toBe(BANNER_COLOR);
  // The prose after the card is a second reply run; the card's CSS reaches neither run.
  await expect(page.locator(REPLY_FRAME)).toHaveCount(2);
  for (const run of await page.locator(REPLY_FRAME).all()) {
    const colors = await run
      .locator(SANDBOX)
      .contentFrame()
      .locator("#w6p-location")
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
    expect(colors).not.toContain(CARD_COLOR);
  }
});

// A second panel with no stylesheet of its own, under the banner's class: only the banner's rule colors it.
const LATER_FIND = String.raw`/<scene_later \/>/g`;
const LATER_TEMPLATE = '<div class="w6p-banner"><strong id="w6p-later">The gate opens</strong></div>';
const SPLIT_BODY = ['<scene_header location="Camelot · Great Hall" />', "", ":::choices", "1. Follow her", ":::", "", "<scene_later />"].join("\n");

test("a stylesheet before a choices split still styles the script's panel after it", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(SPLIT_BODY);
  await using root = room.root;
  await addDisplayScript(await root.internalCallerFor(root.ownerId), "Later panel", LATER_FIND, LATER_TEMPLATE);
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(REPLY_FRAME)).toHaveCount(2);
  const later = page.locator(REPLY_FRAME).nth(1).locator(SANDBOX).contentFrame().locator("#w6p-later");
  await expect(later).toHaveText("The gate opens");
  expect(await later.evaluate((node) => getComputedStyle(node).color)).toBe(BANNER_COLOR);
  // Positive control: the run that holds the stylesheet styles its own panel.
  const location = page.locator(REPLY_FRAME).first().locator(SANDBOX).contentFrame().locator("#w6p-location");
  expect(await location.evaluate((node) => getComputedStyle(node).color)).toBe(BANNER_COLOR);
});

// The same panel twice across two splits: every run is styled, and each carries the repeated sheet once.
const REPEATED_BODY = [
  '<scene_header location="Camelot · Great Hall" />',
  "",
  ":::choices",
  "1. Follow her",
  ":::",
  "",
  '<scene_header location="The Gate" />',
].join("\n");

test("a panel repeated across splits styles every run", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(REPEATED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(REPLY_FRAME)).toHaveCount(2);
  for (const run of [0, 1]) {
    const location = page.locator(REPLY_FRAME).nth(run).locator(SANDBOX).contentFrame().locator("#w6p-location");
    expect(await location.evaluate((node) => getComputedStyle(node).color)).toBe(BANNER_COLOR);
  }
});

// A stylesheet the reply's runs would carry past the budget: a fourteenth of it, carried by each of sixteen other runs.
const HEAVY_CSS = `.w6p-heavy{content:"${"x".repeat(Math.ceil(REPLY_CARRY_BUDGET_CHARS / 14))}"}`;
const OVER_BUDGET_BODY = [
  '<scene_header location="Camelot · Great Hall" />',
  `<style>${HEAVY_CSS}</style>`,
  ...Array.from({ length: 16 }, (_, index) => `She rolls. [dice: d20 → ${String(index + 1)}]\n\nThe hall waits.`),
].join("\n\n");

test("a styled reply whose runs would carry too much CSS renders plain whole, with its reason, and frames nothing", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(OVER_BUDGET_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = page.locator(`[data-slot="message-row"][data-message-id="${room.messageId}"] ${BUBBLE}`);
  await expect(row.locator(`[data-plain-reason="${PLAIN_REPLY_REASON.carriedStylesOverBudget}"]`)).toHaveCount(1);
  // The row says once why it is plain, with no control: nothing the viewer sets changes the budget.
  const notice = page.locator(`[data-slot="message-row"][data-message-id="${room.messageId}"] [data-slot="plain-notice"]`);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-reason", PLAIN_REPLY_REASON.carriedStylesOverBudget);
  await expect(notice.locator('[data-slot="plain-notice-action"]')).toHaveCount(0);
  // Positive control: the script ran on this row, so the plain path is the budget's doing.
  await expect(row.getByText("Camelot · Great Hall", { exact: true })).toBeVisible();
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
  expect(((await row.textContent()) ?? "").includes("w6p-heavy")).toBe(false);
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

/** The styled room with no display script, so no reply in it is styled. */
async function openUnscriptedRoom(body: string): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const room = await openStyledRoom(body);
  construction.use(room.root);
  const caller = await room.root.internalCallerFor(room.root.ownerId);
  for (const script of await caller.regex.listScripts()) {
    await caller.regex.removeScript({ scriptId: script.id });
  }
  construction.move();
  return room;
}

const rowOf = (page: Page, id: MessageId): Locator => page.locator(`[data-slot="message-row"][data-message-id="${id}"]`);

// THE MODEL'S OWN PANELS (D354): each trigger, written by the model with no display script, draws in the row's frame
// with its own style; with the character's HTML trust off it reads plain with the notice; markup that is no panel stays
// in the transcript.
const MODEL_PANELS = [
  ["a block whose tag carries a style attribute", BARE_HTML_BODY, "#w6p-bare p"],
  ["a stylesheet", `<style>#w6p-own{color:${BANNER_COLOR}}</style>\n<p id="w6p-own">Model-written markup</p>`, "#w6p-own"],
  ["a script", '<p id="w6p-run">Model-written markup</p>\n<script>document.body.dataset.ran = "1"</script>', "#w6p-run"],
  ["an svg", '<p>Model-written markup <svg id="w6p-svg" width="8" height="8"><circle r="4" fill="red"/></svg></p>', "#w6p-svg"],
  [
    "a whole document",
    `<!DOCTYPE html>\n<html>\n<head>\n<title>Status</title>\n<style>body{color:${BANNER_COLOR}}</style>\n</head>\n\n<body>\n<p id="w6p-doc">Model-written markup</p>\n</body>\n</html>`,
    "#w6p-doc",
  ],
] as const;

for (const [name, body, shown] of MODEL_PANELS) {
  test(`${name} the model wrote draws in its row's frame, with no display script`, async ({ corpus, mount, page }) => {
    const room = await openUnscriptedRoom(body);
    await using root = room.root;
    await using _routes = await serveRoom(page, root, corpus);
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    const row = rowOf(page, room.messageId);
    await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
    await expect(row.locator(REPLY_FRAME).locator(SANDBOX).contentFrame().locator(shown).first()).toBeVisible();
    expect(sourceIn((await row.textContent()) ?? "")).toEqual([]);
    expect(await mainDocumentStyles(page)).not.toContain("w6p-");
  });

  test(`${name} the model wrote reads plain with the notice when the character's HTML trust is off`, async ({ corpus, mount, page }) => {
    const room = await openUnscriptedRoom(`${body}\n\nThe hall waits.`);
    await using root = room.root;
    await (await root.internalCallerFor(root.ownerId)).character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
    await using _routes = await serveRoom(page, root, corpus);
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    const row = rowOf(page, room.messageId);
    // Positive control: the reply drew, so the absence of a frame is the trust's doing.
    await expect(row.getByText("The hall waits.", { exact: true })).toBeVisible();
    await expect(row.getByText("Model-written markup", { exact: false }).first()).toBeVisible();
    await expect(row.locator(REPLY_FRAME)).toHaveCount(0);
    await expect(row.locator('[data-slot="plain-notice"]')).toHaveCount(1);
    expect(sourceIn((await row.textContent()) ?? "")).toEqual([]);
  });
}

const INLINE_MARKUP = [
  ["a coloured span", 'She says <span style="color:red">hi</span>.', "She says hi."],
  ["a font colour tag", 'She says <font color="red">hi</font>.', "She says hi."],
  ["a bare wrapper block", "<div>\nModel-written markup\n</div>", "Model-written markup"],
] as const;

for (const [name, body, shown] of INLINE_MARKUP) {
  test(`${name} the model wrote is no panel: it stays in the transcript, framed by nothing`, async ({ corpus, mount, page }) => {
    const room = await openUnscriptedRoom(body);
    await using root = room.root;
    await using _routes = await serveRoom(page, root, corpus);
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    const row = rowOf(page, room.messageId);
    await expect(row.getByText(shown, { exact: true })).toBeVisible();
    await expect(row.locator(REPLY_FRAME)).toHaveCount(0);
    await expect(row.locator('[data-slot="plain-notice"]')).toHaveCount(0);
  });
}

test("a model panel streams behind the forming chip from its first tag, and no tag, CSS or script text ever shows", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom("Unchanged.");
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const ghost = '[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]';
  await watchForSource(page, ghost, [...SOURCE_MARKERS, "padding", "run()"]);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: MODEL_PANEL_CHUNKS,
    chunkLabel: CHUNK_LABEL,
  });
  await streamEachChunk(page, MODEL_PANEL_CHUNKS);
  const body = page.locator(ghost);
  await expect(body.locator(FORMING_CHIP)).toHaveCount(1);
  // Positive control: the prose on both sides of the panel streamed, so the watch read the row as it formed.
  await expect(body).toContainText("She looks up.");
  await expect(body).toContainText("The hall waits.");
  const { hits } = await sourceSeen(page);
  expect(hits).toEqual([]);
});

test("a stored model panel holds behind the chip until its frame draws, then draws in place with no source shown", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom(MODEL_PANEL_CHUNKS.join(""));
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  const row = `[data-slot="message-row"][data-message-id="${room.messageId}"]`;
  await watchForSource(page, `${row} ${BUBBLE}`, [...SOURCE_MARKERS, "padding", "run()"]);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const host = page.locator(`${row} ${REPLY_FRAME}`);
  await expect(host).toHaveAttribute("data-delivery", "held");
  await expect(host.locator(FORMING_CHIP)).toHaveCount(1);
  await expect(host).toContainText("She looks up.");
  mints.resolve();
  await expect(host.locator(SANDBOX)).toHaveAttribute("data-delivery", "routed");
  await expect(host.locator(SANDBOX).contentFrame().locator("#w6p-hp")).toHaveText("HP 10");
  const { hits, seen } = await sourceSeen(page);
  expect(seen).toContain("She looks up.");
  expect(hits).toEqual([]);
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
  await confirm.getByRole("button", { name: FRAMED_LINK_CONFIRM_LABEL, exact: true }).click();
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
  // Keyboard Enter on a link raises it too: the Cancel left focus on the reply's own stop, and Tab enters the frame.
  await tabToFrameNode(page, "w6p-link");
  await page.keyboard.press("Enter");
  await expect(confirm).toContainText(LINK_URL);
});

test("after a Cancel a frame's script alone raises nothing, and a reader's links past the free Cancels wait, the newest kept", async ({
  corpus,
  mount,
  page,
}) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const frame = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`);
  const confirm = page.getByRole("alertdialog");
  const cancel = async (): Promise<void> => {
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
  };
  await frame.locator("#w6p-link").click();
  await expect(confirm).toContainText(LINK_URL);
  await cancel();
  // The Cancel returned focus to the app, so the frame's own script cannot raise the confirm without a new click.
  await postFromFrame(page, { orbCardFrameLink: SWAPPED_URL });
  await expect(confirm).toHaveCount(0);
  // The reader's clicks: the free Cancels raise it at once.
  for (let cancels = 1; cancels <= FRAMED_LINK_FREE_CANCELS; cancels += 1) {
    await frame.locator("#w6p-link").click();
    await expect(confirm).toContainText(LINK_URL);
    await cancel();
  }
  // Past them a click waits. A second click inside the wait replaces the first: the newest link is the one the
  // reader wants, so the confirm that comes when the wait ends names it.
  await frame.locator("#w6p-link").click();
  await frame.locator("#w6p-link-two").click();
  await expect(confirm).toHaveCount(0);
  // The second address extends the first, so naming it proves the first was replaced.
  await expect(confirm).toContainText(LINK_TWO_URL, { timeout: FRAMED_LINK_FIRST_WAIT_MS * 3 });
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
  await using traffic = await serveRoom(page, root, corpus, { droppedMints: 1 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("a handle that is gone again after its fresh mint leaves the reply on the inert path", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { droppedMints: 2 });
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

for (const status of [401, 500]) {
  test(`a reply whose frame document answers ${String(status)} gives up its frame and reads on the inert path`, async ({ corpus, mount, page }) => {
    const room = await openStyledRoom(STYLED_BODY);
    await using root = room.root;
    await using traffic = await serveRoom(page, root, corpus, { serveStatus: status });
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    // The inert path also shows while the mint is pending, so the barrier is the served error page. It posts no height,
    // so only the bound after its load takes the frame away.
    await expect.poll(() => traffic.serves).toBe(1);
    await expect(page.locator(SANDBOX)).toHaveCount(0);
    await expect(page.locator(`${REPLY_FRAME}[data-delivery="fallback"]`)).toBeVisible();
    await expect(page.locator(FORMING_CHIP)).toHaveCount(0);
    await expect(page.getByText("Camelot · Great Hall", { exact: true })).toBeVisible();
    expect([traffic.mints, traffic.serves]).toEqual([1, 1]);
  });
}

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
    // A press on the frame's own prose enters it as a reader's would; the move to the link stays inside the frame.
    await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location").click();
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
  // Out by Shift+Tab, focus is on the row; Tab from there, through the row's own actions, enters the frame and keeps it.
  const frame = page.locator(`${REPLY_FRAME} ${SANDBOX}`);
  for (let presses = 1; presses <= ROW_STOPS_BUDGET && !(await frame.evaluate((node) => node === document.activeElement)); presses += 1) {
    await page.keyboard.press("Tab");
  }
  await settle(page);
  await expect(frame).toBeFocused();
});

// A display script whose template carries a field and a script that logs every key its document receives, counts
// its own focus calls, and takes focus at once when the page asks it to, or as it loads. The reply's script is the
// frame's own, as a hostile preset's would be.
const KEYS_ATTRIBUTE = "data-keys";
const GRABS_ATTRIBUTE = "data-grabs";
const GRAB_EVENT = "w6p-grab";
const LOGGER_TAG = "<key_logger />";
const LOGGER_FIND = String.raw`/<key_logger \/>/g`;
function loggerTemplate(grabOnLoad: boolean): string {
  return [
    '<input id="w6p-field" aria-label="Field inside the frame">',
    "<script>",
    `document.addEventListener("keydown",(e)=>{document.body.setAttribute("${KEYS_ATTRIBUTE}",(document.body.getAttribute("${KEYS_ATTRIBUTE}")??"")+e.key);},true);`,
    `const grab=()=>{document.getElementById("w6p-field").focus();document.body.setAttribute("${GRABS_ATTRIBUTE}",String(Number(document.body.getAttribute("${GRABS_ATTRIBUTE}")??"0")+1));};`,
    `document.body.addEventListener("${GRAB_EVENT}",grab);`,
    grabOnLoad ? "grab();" : "",
    "</script>",
  ].join("");
}
const TYPED = "hunter2";
const FIELD_STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedReplyBesideFieldStory";
const OUTSIDE_FIELD = { name: "Outside the frame", exact: true } as const;

/** The styled room with the key logger in its reply, loading quiet or taking focus as it loads. */
async function openLoggerRoom(grabOnLoad: boolean): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const room = await openStyledRoom(`${STYLED_BODY}\n\n${LOGGER_TAG}`);
  construction.use(room.root);
  const caller = await room.root.internalCallerFor(room.root.ownerId);
  await addDisplayScript(caller, "Key logger", LOGGER_FIND, loggerTemplate(grabOnLoad));
  construction.move();
  return room;
}

/** The reply frame's document body, where the logger keeps its counts. */
function frameBody(page: Page): Locator {
  return page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("body");
}

/** The keys the reply frame's document received. */
async function keysInFrame(page: Page): Promise<string> {
  return (await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("body").getAttribute(KEYS_ATTRIBUTE)) ?? "";
}

/** Two animation frames in the app, so the app has answered a focus move that has already happened. */
async function settle(page: Page): Promise<void> {
  await page.locator("html").evaluate(async () => {
    for (let frame = 0; frame < 2; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
}

/** Press Tab until the frame's node `id` holds focus inside the frame document. */
async function tabToFrameNode(page: Page, id: string): Promise<void> {
  const frameFocus = page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("html");
  for (let presses = 1; presses <= FOCUS_PRESS_BUDGET; presses += 1) {
    await page.keyboard.press("Tab");
    if ((await frameFocus.evaluate(() => document.activeElement?.id)) === id) {
      return;
    }
  }
  throw new Error(`Tab never reached #${id} inside the frame`);
}

test("a drawn reply frame's script that takes focus gets none of the reader's keys: focus goes back to the field", async ({ corpus, mount, page }) => {
  const room = await openLoggerRoom(false);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedReplyBesideFieldStory>(FIELD_STORY, { chatId: room.chatId });
  await expect(page.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-drawn", "");
  const field = page.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  await frameBody(page).evaluate((body, cue) => body.dispatchEvent(new Event(cue)), GRAB_EVENT);
  await expect(frameBody(page)).toHaveAttribute(GRABS_ATTRIBUTE, "1");
  await settle(page);
  await expect(field).toBeFocused();
  await page.keyboard.type(TYPED);
  await expect(field).toHaveValue(TYPED);
  expect(await keysInFrame(page)).toBe("");
  // Positive control: a click on the frame's own field gives it the reader's keys.
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-field").click();
  await page.keyboard.type("ok");
  await expect.poll(async () => keysInFrame(page)).toBe("ok");
});

test("a veiled reply frame that takes focus as it loads gets none of the reader's keys", async ({ corpus, mount, page }) => {
  const room = await openLoggerRoom(true);
  await using root = room.root;
  const serves = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { servesWait: serves.promise });
  await mount<typeof RoutedReplyBesideFieldStory>(FIELD_STORY, { chatId: room.chatId });
  const frame = page.locator(`${REPLY_FRAME} ${SANDBOX}`);
  // The frame is mounted and veiled behind the held run while the reader is in the field; then its document loads.
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  await expect(frame).toBeHidden();
  const field = page.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  serves.resolve();
  await expect(frameBody(page)).toHaveAttribute(GRABS_ATTRIBUTE, "1");
  await expect(frame).toHaveAttribute("data-drawn", "");
  await settle(page);
  await expect(field).toBeFocused();
  await page.keyboard.type(TYPED);
  await expect(field).toHaveValue(TYPED);
  expect(await keysInFrame(page)).toBe("");
});

test("a Cancel leaves focus on the reply, so a frame that takes focus as the confirm closes gets no key", async ({ corpus, mount, page }) => {
  const room = await openLoggerRoom(false);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedReplyBesideFieldStory>(FIELD_STORY, { chatId: room.chatId });
  const confirm = page.getByRole("alertdialog");
  await page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-link").click();
  await expect(confirm).toContainText(LINK_URL);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(REPLY_FRAME)).toBeFocused();
  await frameBody(page).evaluate((body, cue) => body.dispatchEvent(new Event(cue)), GRAB_EVENT);
  await expect(frameBody(page)).toHaveAttribute(GRABS_ATTRIBUTE, "1");
  await settle(page);
  await expect(page.locator(REPLY_FRAME)).toBeFocused();
  await page.keyboard.type(TYPED);
  expect(await keysInFrame(page)).toBe("");
});

test("one reply's grab while the reader is in another reply stops neither, and the keys after it reach neither", async ({ corpus, mount, page }) => {
  const room = await openLoggerRoom(false);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.chat.duplicateMessage({ chatId: room.chatId, messageId: room.messageId });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedReplyBesideFieldStory>(FIELD_STORY, { chatId: room.chatId });
  const sandboxes = page.locator(`${REPLY_FRAME} ${SANDBOX}`);
  await expect(sandboxes).toHaveCount(2);
  const frameAt = (nth: number): FrameLocator => sandboxes.nth(nth).contentFrame();
  const keysAt = async (nth: number): Promise<string> => (await frameAt(nth).locator("body").getAttribute(KEYS_ATTRIBUTE)) ?? "";
  const field = page.getByRole("textbox", OUTSIDE_FIELD);
  // A held press, as a reader's is: a move from one frame into another is read while the press is down.
  const pressField = async (nth: number): Promise<void> => {
    const box = await frameAt(nth).locator("#w6p-field").boundingBox();
    if (box === null) {
      throw new Error("the reply's field has no box to press");
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await settle(page);
    await page.mouse.up();
  };
  // The reader was last in the app's field, pressed into the second reply, then into the first, and is there now.
  await field.click();
  await pressField(1);
  await pressField(0);
  await page.keyboard.type("ab");
  await expect.poll(async () => keysAt(0)).toBe("ab");
  await frameAt(1)
    .locator("body")
    .evaluate((body, cue) => body.dispatchEvent(new Event(cue)), GRAB_EVENT);
  await expect(frameAt(1).locator("body")).toHaveAttribute(GRABS_ATTRIBUTE, "1");
  await settle(page);
  // The grab is refused to the app's field, and the refusal costs the reply the reader was in nothing.
  await expect(field).toBeFocused();
  await page.keyboard.type(TYPED);
  await expect(field).toHaveValue(TYPED);
  expect(await keysAt(0)).toBe("ab");
  expect(await keysAt(1)).toBe("");
  await expect(page.locator(`${REPLY_FRAME}[data-delivery="routed"]`)).toHaveCount(2);
  // Both replies' scripts still run: each answers one more grab of its own.
  for (const nth of [0, 1]) {
    await frameAt(nth)
      .locator("body")
      .evaluate((body, cue) => body.dispatchEvent(new Event(cue)), GRAB_EVENT);
    await expect(frameAt(nth).locator("body")).toHaveAttribute(GRABS_ATTRIBUTE, nth === 0 ? "1" : "2");
  }
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
  await addDisplayScript(caller, "Tall panel", TALL_PANEL_FIND, TALL_PANEL_TEMPLATE);
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
  await addDisplayScript(caller, "Director notes", DIRECTOR_FIND, "");
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

// A coding answer's HTML sample, streamed in a styled room: a code block and a code span the renderer shows as written.
const SAMPLE_CHUNKS = ["Here is the page:\n\n```html\n<style>h1 {", " color: teal; }\n\n</style>\n<h1>Hi</h1>\n```", "\n\nUse `<b>` for bold."] as const;

test("a code sample streams as written in a styled room, its tags and stylesheet kept", async ({ corpus, mount, page }) => {
  const room = await openStyledRoom(STYLED_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: SAMPLE_CHUNKS,
    chunkLabel: CHUNK_LABEL,
  });
  await streamEachChunk(page, SAMPLE_CHUNKS);
  const body = page.locator('[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]');
  await expect(body.locator("pre")).toContainText("<style>h1 { color: teal; }");
  await expect(body.locator("pre")).toContainText("<h1>Hi</h1>");
  await expect(body.locator("code").last()).toHaveText("<b>");
  await expect(body.locator(FORMING_CHIP)).toHaveCount(0);
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

// THE TRAINS ROW (tide): the display pass runs once over the whole reply, and the train cuts what it drew into bubbles.
const TRAIN = '[data-slot="message-bubble-train"]';
const TRAIN_BUBBLE = `${TRAIN} > ${BUBBLE}`;
// Status lines whose match spans a paragraph break, as a preset status panel does: no one paragraph holds the match.
const STATUS_FIND = String.raw`/Location: ([^\n]*)\n\nHP: \d+/g`;
const STATUS_BODY = 'Location: Camelot · Great Hall\n\nHP: 10\n\nGuinevere sets down her goblet. "You are late, Arthur."';
// A stylesheet the model wrote, holding a blank line, in a panel between two paragraphs.
const MODEL_PANEL_BODY =
  'She looks up.\n\n<div class="w6p-model"><style>.w6p-model b{color:red}\n\n.w6p-model i{margin:0}</style><b>HUD</b></div>\n\nThe hall waits.';
const PLAIN_PARAGRAPHS = ["Guinevere rises.", "She crosses the hall.", "She waits by the door."] as const;
const SPOKEN_PARAGRAPHS = ["The hall falls quiet.", "Lancelot rises from the high table.", "He waits by the door."] as const;
const SPOKEN_BODY = `${SPOKEN_PARAGRAPHS[0]}\n\n<speaker>Lancelot</speaker>${SPOKEN_PARAGRAPHS[1]}\n\n${SPOKEN_PARAGRAPHS[2]}`;
const MAX_BUBBLES_KEY = "w6pMaxTrainBubbles";

/** The styled room on the trains row, its reply rewritten to `body`. */
async function openTrainRoom(body: string, options?: Parameters<typeof createCorpusHarness>[1]): Promise<StyledRoom> {
  await using construction = new AsyncDisposableStack();
  const room = await openStyledRoom(body, options);
  construction.use(room.root);
  const caller = await room.root.internalCallerFor(room.root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle: "tide" } });
  construction.move();
  return room;
}

const trainRow = (page: Page, room: StyledRoom): Locator => page.locator(`[data-slot="message-row"][data-message-id="${room.messageId}"]`);

test("tide: a display script whose match spans a blank line draws its panel, framed in one bubble", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(STATUS_BODY);
  await using root = room.root;
  await addDisplayScript(await root.internalCallerFor(root.ownerId), "Status panel", STATUS_FIND, BANNER_TEMPLATE);
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = trainRow(page, room);
  await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  const frame = row.locator(REPLY_FRAME).locator(SANDBOX).contentFrame();
  await expect(frame.locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  await expect(frame.getByText("You are late, Arthur.", { exact: false })).toBeVisible();
  await expect(row.locator(TRAIN_BUBBLE)).toHaveCount(1);
  expect(((await row.textContent()) ?? "").includes("HP:")).toBe(false);
});

test("tide: a reply holding a model-written panel is one framed bubble", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(MODEL_PANEL_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = trainRow(page, room);
  await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
  await expect(row.locator(TRAIN_BUBBLE)).toHaveCount(1);
  const frame = row.locator(REPLY_FRAME).locator(SANDBOX).contentFrame();
  expect(await frame.locator(".w6p-model b").evaluate((node) => getComputedStyle(node).color)).toBe("rgb(255, 0, 0)");
  await expect(frame.getByText("The hall waits.")).toBeVisible();
});

test("tide: with the character's HTML trust off a model-written panel trains plain as its words, its CSS never printed", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(MODEL_PANEL_BODY);
  await using root = room.root;
  await (await root.internalCallerFor(root.ownerId)).character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const bubbles = trainRow(page, room).locator(TRAIN_BUBBLE);
  // The panel's words keep their bubble: the plain path unwraps the markup it drops, never leaves the bubble empty.
  await expect(bubbles).toHaveText(["She looks up.", "HUD", "The hall waits."]);
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
  await expect(trainRow(page, room).locator('[data-slot="plain-notice"]')).toHaveCount(1);
  expect(sourceIn((await bubbles.allTextContents()).join("\n"))).toEqual([]);
});

test("tide: a plain three-paragraph reply trains as three bubbles, in order", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(PLAIN_PARAGRAPHS.join("\n\n"));
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(trainRow(page, room).locator(TRAIN_BUBBLE)).toHaveText([...PLAIN_PARAGRAPHS]);
});

test("tide: on a row whose character renders plain text a styled reply trains, its panel whole in one bubble", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(TRACKER_BODY);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await addDisplayScript(caller, "Tracker panel", TRACKER_FIND, TRACKER_TEMPLATE);
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const bubbles = trainRow(page, room).locator(TRAIN_BUBBLE);
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.nth(0).locator("details summary")).toHaveText("Tracker");
  await expect(bubbles.nth(1)).toContainText("You are late, Arthur.");
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
  expect(sourceIn((await bubbles.allTextContents()).join("\n"))).toEqual([]);
});

// Replies whose blank lines sit inside markup, each with the bubbles Markdown draws from it. A wrapper element ends its
// paragraphs at a blank line as any text does; a list item keeps its continuation, which alone would read as code.
const WRAPPED_REPLIES = [
  ["a reply wrapped in an unknown element", '<response>\n*She looks up.*\n\n"You came."\n</response>', ["*She looks up.*", '"You came."']],
  ["a think block before the reply", "<think>\nA plan.\n\nMore.\n</think>\n\nShe smiles.", ["A plan.", "More.", "She smiles."]],
  [
    "a list item and its continuation",
    "- She draws.\n\n    The blade hums.\n\nThe hall waits.",
    [/^\s*She draws\.\s*The blade hums\.\s*$/u, "The hall waits."],
  ],
  ["a comment holding a blank line", "<!-- plan\n\nbetray him -->\n\nShe smiles.\n\nShe waits.", ["She smiles.", "She waits."]],
  // A wrapper tag alone on its line draws nothing, so it is no bubble.
  ["a wrapper tag alone at each end", "<continuation>\n\nShe looks up.\n\nShe waits.\n\n</continuation>", ["She looks up.", "She waits."]],
  ["a stray close tag before the reply", "</think>\n\nShe smiles.\n\nShe waits.", ["She smiles.", "She waits."]],
] as const;

for (const [name, body, expected] of WRAPPED_REPLIES) {
  test(`tide: ${name} trains as Markdown draws it`, async ({ corpus, mount, page }) => {
    const room = await openTrainRoom(body);
    await using root = room.root;
    await using _routes = await serveRoom(page, root, corpus);
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    const bubbles = trainRow(page, room).locator(TRAIN_BUBBLE);
    await expect(bubbles).toHaveText([...expected]);
    await expect(bubbles.locator("pre, code")).toHaveCount(0);
  });
}

test("tide: a folded element holding a blank line stays in one bubble, its contents still folded", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom("<details>\n<summary>Notes</summary>\n\nA secret.\n\n</details>\n\nShe smiles.");
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const bubbles = trainRow(page, room).locator(TRAIN_BUBBLE);
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.nth(0).locator("details summary")).toHaveText("Notes");
  await expect(bubbles.nth(1)).toHaveText("She smiles.");
  await expect(trainRow(page, room).getByText("A secret.")).toBeHidden();
});

test("tide: a styled reply too heavy to frame trains plain and says why once, under the whole train", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(OVER_BUDGET_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = trainRow(page, room);
  await expect(row.locator(`${TRAIN}[data-plain-reason="${PLAIN_REPLY_REASON.carriedStylesOverBudget}"]`)).toHaveCount(1);
  // Positive control: the reply trained, so one notice for many bubbles is the train's doing.
  expect(await row.locator(TRAIN_BUBBLE).count()).toBeGreaterThan(1);
  await expect(row.locator('[data-slot="plain-notice"]')).toHaveCount(1);
  await expect(page.locator(REPLY_FRAME)).toHaveCount(0);
});

test("tide: a speaker's span runs on across the bubbles it covers", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(SPOKEN_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const bubbles = trainRow(page, room).locator(TRAIN_BUBBLE);
  await expect(bubbles).toHaveText([...SPOKEN_PARAGRAPHS]);
  // Each bubble from the speaker's tag on reads under the speaker's own tint; the narration before it under none.
  const tinted = await Promise.all([0, 1, 2].map(async (nth) => await bubbles.nth(nth).locator('[data-slot="theme-scope"]').count()));
  expect(tinted).toEqual([0, 1, 1]);
});

// A viewer plugin whose display transform marks the end of whatever text it is handed.
const ANNOTATE_MARK = " [annotated]";
const ANNOTATE_MANIFEST = pluginManifestSchema.parse({
  id: "train-annotate",
  name: "Train annotate",
  description: "Marks the end of each row it displays.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["chat.transform"],
});
const ANNOTATE_SOURCE = `orb.host(1).transforms.registerDisplay({ name: "annotate", apply: async ({ text }) => text + ${JSON.stringify(ANNOTATE_MARK)} });`;

test("tide: a viewer plugin's display transform runs once over the whole reply, so only the last bubble carries its mark", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(PLAIN_PARAGRAPHS.join("\n\n"), { pluginSpawn: spawn });
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  const installed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(ANNOTATE_MANIFEST, ANNOTATE_SOURCE, root.clock.now())).toString("base64"),
    grant: ANNOTATE_MANIFEST.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(trainRow(page, room).locator(TRAIN_BUBBLE)).toHaveText([PLAIN_PARAGRAPHS[0], PLAIN_PARAGRAPHS[1], `${PLAIN_PARAGRAPHS[2]}${ANNOTATE_MARK}`]);
});

test("tide: from mount to framed a styled reply is one bubble, never the unscripted paragraphs or the template's source", async ({ corpus, mount, page }) => {
  const room = await openTrainRoom(STYLED_BODY);
  await using root = room.root;
  const mints = Promise.withResolvers<void>();
  await using _routes = await serveRoom(page, root, corpus, { mintsWait: mints.promise });
  const row = `[data-slot="message-row"][data-message-id="${room.messageId}"]`;
  await watchForSource(page, `${row} ${BUBBLE}`);
  await page.addInitScript(
    ({ selector, key }) => {
      if (globalThis.window !== globalThis.top) {
        return;
      }
      new MutationObserver(() => {
        const count = document.querySelectorAll(selector).length;
        document.documentElement.dataset[key] = String(Math.max(count, Number(document.documentElement.dataset[key] ?? "0")));
      }).observe(document, { subtree: true, childList: true });
    },
    { selector: `${row} ${TRAIN_BUBBLE}`, key: MAX_BUBBLES_KEY },
  );
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const host = page.locator(`${row} ${REPLY_FRAME}`);
  await expect(host).toHaveAttribute("data-delivery", "held");
  mints.resolve();
  await expect(host.locator(SANDBOX)).toHaveAttribute("data-delivery", "routed");
  await expect(page.frameLocator(`${REPLY_FRAME} ${SANDBOX}`).locator("#w6p-location")).toHaveText("Camelot · Great Hall");
  const { hits, seen } = await sourceSeen(page);
  expect(seen).toContain("You are late, Arthur.");
  expect(hits).toEqual([]);
  expect(await page.evaluate((key) => document.documentElement.dataset[key], MAX_BUBBLES_KEY)).toBe("1");
});

// A stylesheet the reply's own author wrote, on a row no display script styled. Markup the model or the user writes
// never styles a row, and its CSS must not print as prose on any path the frame does not draw.
const OWN_CSS = ".w6p-own b{color:red}";
const OWN_STYLE_BODY = `She looks up.\n\n<div class="w6p-own"><style>${OWN_CSS}</style><b>HUD</b></div>\n\nThe hall waits.`;
const OWN_STYLE_CHUNKS = ['She looks up.\n\n<div class="w6p-own"><style>.w6p-own b{', "color:red}</style><b>HUD</b></div>", "\n\nThe hall waits."] as const;
// The same element as a code sample: a fence and a code span show it as written.
const OWN_SAMPLE_BODY = `Here is the page:\n\n\`\`\`html\n<style>${OWN_CSS}</style>\n\`\`\`\n\nOr inline: \`<style>${OWN_CSS}</style>\`.`;

forEachNonEmpty(THEME_CHAT_STYLES, "THEME_CHAT_STYLES", (chatStyle) => {
  test(`${chatStyle}: a stylesheet the model wrote into an unstyled reply draws in its frame and never prints as text`, async ({ corpus, mount, page }) => {
    const room = await openUnscriptedRoom(OWN_STYLE_BODY);
    await using root = room.root;
    await (await root.internalCallerFor(root.ownerId)).settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle } });
    await using _routes = await serveRoom(page, root, corpus);
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    const row = rowOf(page, room.messageId);
    await expect(row.locator(`${REPLY_FRAME} ${SANDBOX}`)).toHaveAttribute("data-delivery", "routed");
    const frame = row.locator(REPLY_FRAME).locator(SANDBOX).contentFrame();
    await expect(frame.getByText("The hall waits.")).toBeVisible();
    expect(await frame.locator(".w6p-own b").evaluate((node) => getComputedStyle(node).color)).toBe("rgb(255, 0, 0)");
    expect((await row.textContent()) ?? "").not.toContain(OWN_CSS);
  });
});

test("a stylesheet a user wrote into their message never prints as text", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom("Unchanged.");
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  const { messages } = await caller.chat.listMessages({ chatId: room.chatId });
  const user = messages.findLast((message) => message.role === "user");
  expect(user).toBeDefined();
  const userId = user?.id ?? room.messageId;
  await caller.chat.editMessage({ chatId: room.chatId, messageId: userId, content: OWN_STYLE_BODY, timeZone: UTC_TIME_ZONE });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = rowOf(page, userId);
  await expect(row).toContainText("The hall waits.");
  expect((await row.textContent()) ?? "").not.toContain(OWN_CSS);
});

test("a stylesheet the model wrote into its reasoning never prints as text when the trace is opened", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom("Unchanged.");
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.chat.editReasoning({ chatId: room.chatId, messageId: room.messageId, reasoning: OWN_STYLE_BODY });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = rowOf(page, room.messageId);
  await row.locator('[data-slot="collapsible-trigger"]').first().click();
  const trace = row.locator('[data-slot="collapsible-panel"]').first();
  await expect(trace).toContainText("The hall waits.");
  expect((await trace.textContent()) ?? "").not.toContain(OWN_CSS);
});

test("a stylesheet the model writes while the reply streams never prints as text, with no display script", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom("Unchanged.");
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const ghost = '[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]';
  await watchForSource(page, ghost, [OWN_CSS]);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: OWN_STYLE_CHUNKS,
    chunkLabel: CHUNK_LABEL,
  });
  await streamEachChunk(page, OWN_STYLE_CHUNKS);
  await expect(page.locator(ghost)).toContainText("The hall waits.");
  const { hits } = await sourceSeen(page);
  expect(hits).toEqual([]);
});

test("a card's stylesheet never prints as text in the plain card a row without trusted HTML draws", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom(`She looks up.\n\n:::card title="Status"\n<style>${OWN_CSS}</style><strong>Card body</strong>\n:::\n\nThe hall waits.`);
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = rowOf(page, room.messageId);
  await expect(row).toContainText("Card body");
  expect((await row.textContent()) ?? "").not.toContain(OWN_CSS);
});

test("a stylesheet written as a code sample in an unstyled reply still shows as written", async ({ corpus, mount, page }) => {
  const room = await openUnscriptedRoom(OWN_SAMPLE_BODY);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const row = rowOf(page, room.messageId);
  await expect(row.locator("pre")).toContainText(`<style>${OWN_CSS}</style>`);
  await expect(row.locator("p code")).toHaveText(`<style>${OWN_CSS}</style>`);
});
