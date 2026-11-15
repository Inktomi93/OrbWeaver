// A routed chat card frames as a styled reply does: the real transcript (`MessageListSurface`) over a corpus room
// whose latest reply is one `:::card`, its card-frame mint and serve answered by the corpus root's own HTTP entry. A
// handle that is gone mints again once, then the card draws on its script-dead floor, never the server's expiry notice;
// and the card never shows a frame at a height other than its own, because a forming chip holds its body until the
// routed document reports its first height, or falls to its floor when its document fails to load. A remounted card
// mints afresh after a miss rather than serving the handle that missed. A link in a card, inline or fullscreen, opens only
// through the shared confirm and never as a popup; a link the card's own script posts without a click raises nothing; a
// link of another scheme keeps its default; and the script-dead floor hands off no link at all.
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameServing, CardFrameTraffic } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { FRAMED_LINK_CONFIRM_LABEL } from "#client/components/framed-link-names.ts";
import { IMMERSIVE_CARD_LABELS } from "../../../../../packages/ui/src/content/immersive-card/control-labels.ts";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";
import type { StyledReplyStreamStory } from "./_styled-reply-stream-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const CARD_PANEL = '[data-slot="immersive-card-panel"]';
const LIGHTBOX = '[data-slot="immersive-card-lightbox-body"]';
const FRAME = '[data-slot="sandbox-frame"]';
const FORMING_CHIP = '[data-slot="forming-card-chip"]';
const VIEWER_PASSWORD = "card-frame-parity-viewer-password";
const LINK_URL = "https://example.test/tide-tables";
const BLANK_URL = "https://example.test/tide-almanac";
const OPENER_URL = "https://example.test/tide-chart";
const SCRIPTED_URL = "https://example.test/scripted";
const EXTERNAL_PAGES = "https://*.test/**";
const TIDE_LINE = '<p id="tide-line" style="margin:0">High water at dusk.</p>';
const TIDE_LINK = `<a id="tide-link" href="${LINK_URL}">Full tables</a>`;
// A short card: its document measures well below the frame's default height.
const CARD = `:::card title="Tide tables"\n${TIDE_LINE}${TIDE_LINK}\n:::`;
// Its script stamps the body when it runs, and posts a link at once, with no click behind it.
const SCRIPTED_CARD = `:::card title="Tide tables"\n${TIDE_LINE}${TIDE_LINK}<script>document.body.dataset.ran="";parent.postMessage({orbCardFrameLink:"${SCRIPTED_URL}"},"*");</script>\n:::`;
// One link per way a card can reach outside itself.
const SCHEME_CARD = [
  `:::card title="Tide tables"`,
  TIDE_LINE,
  `<a id="script-link" href="javascript:void(document.body.dataset.followed='')">Script</a>`,
  `<a id="custom-link" href="web+tide:high-water">Custom</a>`,
  `<a id="blank-link" href="${BLANK_URL}" target="_blank">Almanac</a>`,
  `<a id="opener-link" href="${OPENER_URL}" onclick="window.open(this.href)">Chart</a>`,
  `<a id="data-link" href="data:text/html,tide">Data</a>`,
  ":::",
].join("\n");
const CARD_POSTURES = ["static", "interactive"] as const;
type CardPosture = (typeof CARD_POSTURES)[number];
const TRANSCRIPT_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings", "plugin.list", "plugin.listSurfaces", "regex.listScripts"] as const;
const DRAWN_HEIGHTS_KEY = "cardDrawnHeights";
const STREAM_STORY = "tests/client/features/chat/components/_styled-reply-stream-stories/StyledReplyStreamStory";
const CHUNK_LABEL = "Stream the next chunk";
// A card whose close line lands, then prose that keeps streaming below it.
const CARD_THEN_PROSE = [':::card title="Tide tables"\n', `${TIDE_LINE}\n`, ":::\n", "The tide ", "turns ", "at dusk."] as const;
const CLOSED_AT = 3;
const LOADS_ATTRIBUTE = "data-ct-frame-loads";

interface CardRoom {
  readonly root: Root;
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to carry one card,
 *  with that character set to the card posture asked for: `static` runs only the pinned frame script. */
async function openCardRoom(content = CARD, posture: CardPosture = "interactive"): Promise<CardRoom> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness());
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const detail = await caller.chat.getChat({ chatId: row.id });
    const trusted = new Set(
      detail.participants.flatMap((seat) =>
        seat.characterId !== null && seat.renderPolicy !== undefined && rendersTrustedHtml(seat.renderPolicy.htmlTrust) ? [seat.characterId] : [],
      ),
    );
    const { messages } = await caller.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null && trusted.has(message.characterId));
    if (reply !== undefined && reply.characterId !== null) {
      await caller.character.update({ characterId: reply.characterId, input: { trustHtml: true, interactiveHtml: posture === "interactive" } });
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content, timeZone: UTC_TIME_ZONE });
      construction.move();
      return { root, chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

/** The room's reads, and its card-frame mint and serve answered by the root's own HTTP entry under the viewer's session. */
async function serveRoom(
  page: Page,
  root: Root,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
  serving: CardFrameServing = {},
): Promise<CardFrameTraffic & AsyncDisposable> {
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

interface ExternalTraffic {
  /** Every external address requested: a popup's page, or a frame that navigated itself. */
  readonly requested: string[];
  /** Every page the context opened. */
  readonly popups: string[];
}

/** External requests land here instead of the network; a page `window.open` would open is counted. */
async function recordExternal(page: Page): Promise<ExternalTraffic> {
  const traffic: ExternalTraffic = { requested: [], popups: [] };
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    traffic.requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  page.context().on("page", (popup) => traffic.popups.push(popup.url()));
  return traffic;
}

const ROUTED_CARD = `${CARD_PANEL} ${FRAME}[data-delivery="routed"]`;

test("a link in a card opens nothing until the confirm, and Open opens exactly its address", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const external = await recordExternal(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await page.frameLocator(ROUTED_CARD).locator("#tide-link").click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(LINK_URL);
  expect(external).toEqual({ requested: [], popups: [] });
  await confirm.getByRole("button", { name: FRAMED_LINK_CONFIRM_LABEL, exact: true }).click();
  await expect.poll(() => [...external.requested]).toEqual([LINK_URL]);
});

test("a link in a card's fullscreen view raises the confirm over it, and a Cancel leaves the fullscreen card open", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const external = await recordExternal(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(ROUTED_CARD)).toBeVisible();
  await page.getByRole("button", { name: IMMERSIVE_CARD_LABELS.fullscreen, exact: true }).click();
  const lightbox = page.getByRole("dialog");
  await expect(lightbox).toBeVisible();
  await page.frameLocator(`${LIGHTBOX} ${FRAME}[data-delivery="routed"]`).locator("#tide-link").click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(LINK_URL);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(lightbox).toBeVisible();
  // Focus came back to the fullscreen card's own stop, inside the dialog, never into the frame.
  await expect(page.locator(LIGHTBOX)).toBeFocused();
  expect(external).toEqual({ requested: [], popups: [] });
});

test("a link a card's script posts with no click raises nothing, and the reader's own click raises the confirm for its own address", async ({
  corpus,
  mount,
  page,
}) => {
  const room = await openCardRoom(SCRIPTED_CARD);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const card = page.frameLocator(ROUTED_CARD);
  // The card's script ran, so its post was sent.
  await expect(card.locator("body[data-ran]")).toHaveCount(1);
  await expect(page.locator(`${CARD_PANEL} ${FRAME}[data-drawn]`)).toHaveCount(1);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await card.locator("#tide-link").click();
  await expect(page.getByRole("alertdialog")).toContainText(LINK_URL);
  await expect(page.getByRole("alertdialog")).not.toContainText(SCRIPTED_URL);
});

test("a card's javascript: link keeps its default, and its custom-scheme link raises nothing and leaves the card drawn", async ({ corpus, mount, page }) => {
  const room = await openCardRoom(SCHEME_CARD);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const external = await recordExternal(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const card = page.frameLocator(ROUTED_CARD);
  // Chromium does not follow a `javascript:` link in the card frame, with or without the frame script's hand-off.
  await card.locator("#script-link").click();
  await card.locator("#custom-link").click();
  // The frame script swallowed the custom-scheme link, so the card's document is still the one drawn.
  await expect(card.locator("#tide-line")).toHaveText("High water at dusk.");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(external).toEqual({ requested: [], popups: [] });
});

test("a card link that targets a new window or opens one itself raises the confirm and never a popup; a data: link raises nothing", async ({
  corpus,
  mount,
  page,
}) => {
  const room = await openCardRoom(SCHEME_CARD);
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  const external = await recordExternal(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const card = page.frameLocator(ROUTED_CARD);
  const confirm = page.getByRole("alertdialog");
  for (const [link, url] of [
    ["#blank-link", BLANK_URL],
    ["#opener-link", OPENER_URL],
  ] as const) {
    await card.locator(link).click();
    await expect(confirm).toContainText(url);
    expect(external).toEqual({ requested: [], popups: [] });
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
  }
  await card.locator("#data-link").click();
  // The frame script swallowed the `data:` link: the card stays drawn and nothing reached the host.
  await expect(card.locator("#tide-line")).toHaveText("High water at dusk.");
  await expect(confirm).toHaveCount(0);
  expect(external.popups).toEqual([]);
});

test("a static card runs only the pinned frame script: it reports its height and hands its link to the confirm", async ({ corpus, mount, page }) => {
  const room = await openCardRoom(SCRIPTED_CARD, "static");
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const card = page.frameLocator(ROUTED_CARD);
  await expect(card.locator("#tide-line")).toHaveText("High water at dusk.");
  // Drawn only on the frame's first height report, so the pinned script ran under the policy's hash.
  await expect(page.locator(`${CARD_PANEL} ${FRAME}[data-drawn]`)).toHaveCount(1);
  await expect(card.locator("body[data-ran]")).toHaveCount(0);
  await card.locator("#tide-link").click();
  await expect(page.getByRole("alertdialog")).toContainText(LINK_URL);
});

test("a link in a card on its script-dead floor hands nothing to the host", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus, { droppedMints: 2 });
  const external = await recordExternal(page);
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.locator(`${CARD_PANEL} ${FRAME}`)).toHaveAttribute("data-delivery", "srcdoc");
  const floor = page.frameLocator(`${CARD_PANEL} ${FRAME}`);
  await floor.locator("#tide-link").click();
  // The link's default took the floor off the card's document; with no script, nothing reached the host.
  await expect(floor.locator("#tide-line")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(external.popups).toEqual([]);
});

test("a card whose handle expired mints again and draws, never the expiry notice", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { droppedMints: 1 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}[data-delivery="routed"]`).locator("#tide-line")).toHaveText("High water at dusk.");
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("a card whose handle is gone again after its fresh mint draws on its floor and gives up", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { droppedMints: 2 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect.poll(() => traffic.serves).toBe(2);
  const floor = page.locator(`${CARD_PANEL} ${FRAME}`);
  await expect(floor).toHaveAttribute("data-delivery", "srcdoc");
  await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}`).locator("#tide-line")).toHaveText("High water at dusk.");
  // Given up: no third mint and no further serve.
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

for (const status of [401, 500]) {
  test(`a card whose frame document answers ${String(status)} leaves its forming chip and draws its own floor`, async ({ corpus, mount, page }) => {
    const room = await openCardRoom();
    await using root = room.root;
    await using traffic = await serveRoom(page, root, corpus, { serveStatus: status });
    await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
    await expect(page.locator(`${CARD_PANEL} ${FRAME}`)).toHaveAttribute("data-delivery", "srcdoc");
    await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}`).locator("#tide-line")).toHaveText("High water at dusk.");
    await expect(page.locator(`${CARD_PANEL} ${FORMING_CHIP}`)).toHaveCount(0);
    expect([traffic.mints, traffic.serves]).toEqual([1, 1]);
  });
}

test("a card remounted in the same tab after its handle was dropped never asks for that handle again", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { droppedMints: 1 });
  const elsewhere = (await (await root.internalCallerFor(root.ownerId)).chat.listChats({ limit: 100 })).items.find((row) => row.id !== room.chatId);
  if (elsewhere === undefined) {
    throw new Error("The corpus needs a second room");
  }
  const story = await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  const routed = page.frameLocator(`${CARD_PANEL} ${FRAME}[data-delivery="routed"]`);
  await expect(routed.locator("#tide-line")).toHaveText("High water at dusk.");
  expect([traffic.mints, traffic.serves, traffic.misses]).toEqual([2, 2, 1]);
  // Away to another room and back, in the same tab: the card's row mounts again with the same bytes.
  await story.update({ chatId: elsewhere.id, fontScale: 1 });
  await expect(page.locator(CARD_PANEL)).toHaveCount(0);
  await story.update({ chatId: room.chatId, fontScale: 1 });
  await expect(routed.locator("#tide-line")).toHaveText("High water at dusk.");
  // The tab forgot the dropped handle on its miss, so the remount minted afresh instead of serving it again.
  expect(traffic.misses).toBe(1);
});

test("a short card shows a forming chip until its routed frame draws, and no frame at another height ever shows", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  const { promise: servesWait, resolve: releaseServes } = Promise.withResolvers<void>();
  await using held = new AsyncDisposableStack();
  held.defer(releaseServes);
  await using _routes = await serveRoom(page, root, corpus, { servesWait });
  // From before mount, every height a drawn card frame is seen at, on every frame the browser paints.
  await page.addInitScript(
    ({ selector, key }) => {
      if (globalThis.window !== globalThis.top) {
        return;
      }
      const heights = new Set<number>();
      const sample = (): void => {
        for (const node of document.querySelectorAll(selector)) {
          const box = node.getBoundingClientRect();
          if (node.hasAttribute("data-drawn") && box.height > 0) {
            heights.add(Math.round(box.height));
          }
        }
        document.documentElement.dataset[key] = [...heights].join(",");
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { selector: `${CARD_PANEL} ${FRAME}`, key: DRAWN_HEIGHTS_KEY },
  );
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  // The mint has answered and its document is held: the chip stands in and the routed frame waits, undrawn.
  await expect(page.locator(`${CARD_PANEL} ${FRAME}[data-delivery="routed"]`)).toHaveCount(1);
  await expect(page.locator(`${CARD_PANEL} ${FORMING_CHIP}`)).toBeVisible();
  await expect(page.locator(`${CARD_PANEL} ${FRAME}[data-drawn]`)).toHaveCount(0);
  releaseServes();
  const frame = page.locator(`${CARD_PANEL} ${FRAME}[data-delivery="routed"][data-drawn]`);
  await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}`).locator("#tide-line")).toHaveText("High water at dusk.");
  await expect(page.locator(`${CARD_PANEL} ${FORMING_CHIP}`)).toHaveCount(0);
  const drawnPx = Math.round((await frame.boundingBox())?.height ?? 0);
  expect(drawnPx).toBeGreaterThan(0);
  const seen = await page.evaluate((key) => document.documentElement.dataset[key] ?? "", DRAWN_HEIGHTS_KEY);
  // The only height a drawn frame ever had is its own measured one.
  expect(seen.split(",").map(Number)).toEqual([drawnPx]);
});

test("prose streaming below a closed card never remounts or reloads the card's frame", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using _routes = await serveRoom(page, root, corpus);
  await mount<typeof StyledReplyStreamStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    chunks: CARD_THEN_PROSE,
    chunkLabel: CHUNK_LABEL,
  });
  const press = page.getByRole("button", { name: CHUNK_LABEL, exact: true });
  for (let sent = 0; sent < CLOSED_AT; sent += 1) {
    await press.click();
  }
  const ghost = page.locator('[data-slot="ghost-message-row"]');
  const frame = ghost.locator(FRAME);
  await expect(page.frameLocator(`[data-slot="ghost-message-row"] ${FRAME}`).locator("#tide-line")).toHaveText("High water at dusk.");
  // Count every load the mounted element fires from here on: a reload fires one, a remount drops the counter with the node.
  await frame.evaluate((element, attribute) => {
    element.setAttribute(attribute, "0");
    element.addEventListener("load", () => {
      element.setAttribute(attribute, String(Number(element.getAttribute(attribute)) + 1));
    });
  }, LOADS_ATTRIBUTE);
  for (let sent = CLOSED_AT; sent < CARD_THEN_PROSE.length; sent += 1) {
    await press.click();
  }
  await expect(ghost).toContainText("The tide turns at dusk.");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute(LOADS_ATTRIBUTE, "0");
});
