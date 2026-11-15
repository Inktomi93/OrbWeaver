// A routed chat card frames as a styled reply does: the real transcript (`MessageListSurface`) over a corpus room
// whose latest reply is one `:::card`, its card-frame mint and serve answered by the corpus root's own HTTP entry. A
// handle that is gone mints again once, then the card draws on its script-dead floor, never the server's expiry notice;
// and the card never shows a frame at a height other than its own, because a forming chip holds its body until the
// routed document reports its first height.
import { CARD_FRAME_ROUTE, rendersTrustedHtml } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const CARD_PANEL = '[data-slot="immersive-card-panel"]';
const FRAME = '[data-slot="sandbox-frame"]';
const FORMING_CHIP = '[data-slot="forming-card-chip"]';
const VIEWER_PASSWORD = "card-frame-parity-viewer-password";
// A well-formed handle no mint ever produced: its serve is the server's own miss notice.
const UNKNOWN_HANDLE = "0".repeat(32);
// A short card: its document measures well below the frame's default height.
const CARD = `:::card title="Tide tables"\n<p id="tide-line" style="margin:0">High water at dusk.</p>\n:::`;
const TRANSCRIPT_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings", "plugin.list", "plugin.listSurfaces", "regex.listScripts"] as const;
const DRAWN_HEIGHTS_KEY = "cardDrawnHeights";

interface CardRoom {
  readonly root: Root;
  readonly chatId: ChatId;
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to carry one card. */
async function openCardRoom(): Promise<CardRoom> {
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
    if (reply !== undefined) {
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content: CARD, timeZone: UTC_TIME_ZONE });
      construction.move();
      return { root, chatId: row.id };
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

/** The room's reads, and its card-frame mint and serve answered by the root's own HTTP entry under the viewer's session. */
async function serveRoom(
  page: Page,
  root: Root,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
  serving: FrameServing = {},
): Promise<FrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic: FrameTraffic = { mints: 0, serves: 0 };
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const isMint = request.method() === "POST";
    if (!isMint) {
      await serving.servesWait;
    }
    const missed = !isMint && traffic.serves < (serving.missServes ?? 0);
    traffic.mints += isMint ? 1 : 0;
    traffic.serves += isMint ? 0 : 1;
    const headers = forwardedHeaders(await request.allHeaders(), cookie);
    const body = request.postData();
    const path = missed ? `${CARD_FRAME_ROUTE}/${UNKNOWN_HANDLE}` : new URL(request.url()).pathname;
    const response = await root.http.request(path, { method: request.method(), headers, ...(body === null ? {} : { body }) });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  return Object.assign(traffic, {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await page.unrouteAll({ behavior: "wait" });
    },
  });
}

test("a card whose handle expired mints again and draws, never the expiry notice", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { missServes: 1 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}[data-delivery="routed"]`).locator("#tide-line")).toHaveText("High water at dusk.");
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
});

test("a card whose handle is gone again after its fresh mint draws on its floor and gives up", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await using traffic = await serveRoom(page, root, corpus, { missServes: 2 });
  await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId: room.chatId, fontScale: 1 });
  await expect.poll(() => traffic.serves).toBe(2);
  const floor = page.locator(`${CARD_PANEL} ${FRAME}`);
  await expect(floor).toHaveAttribute("data-delivery", "srcdoc");
  await expect(page.frameLocator(`${CARD_PANEL} ${FRAME}`).locator("#tide-line")).toHaveText("High water at dusk.");
  // Given up: no third mint and no further serve.
  expect([traffic.mints, traffic.serves]).toEqual([2, 2]);
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
