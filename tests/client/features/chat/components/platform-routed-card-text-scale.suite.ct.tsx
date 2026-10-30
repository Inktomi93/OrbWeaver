// A routed chat card follows the viewer's appearance font scale: the transcript mints the card through the real
// card-frame routes with the clamped style slice, and the served document's rem text scales while authored px
// text stays fixed. An out-of-range scale lands at the clamp's bound, not past it.
import { CARD_FRAME_ROUTE, rendersTrustedHtml } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { FONT_SCALE } from "@orb/kit/font-scale";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { RoutedCardTextScaleStory } from "./_routed-card-text-scale-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/chat/components/_routed-card-text-scale-stories/RoutedCardTextScaleStory";
const FRAME = '[data-slot="sandbox-frame"]';
const VIEWER_PASSWORD = "routed-card-scale-viewer-password";
const { min: MIN_SCALE, max: MAX_SCALE } = FONT_SCALE;
// A scale no stored setting can hold, written straight onto the root: the frame must stop at the bound.
const PLANTED_SCALE = 3;
const CARD = ':::card title="Scale"\n<p id="rem" style="font-size:1rem;margin:0">rem text</p><p id="px" style="font-size:16px;margin:0">px text</p>\n:::';
const TRANSCRIPT_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings", "plugin.list", "plugin.listSurfaces", "regex.listScripts"] as const;

interface CardRoom {
  readonly root: Root;
  readonly chatId: ChatId;
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to carry one card. */
async function openCardRoom(): Promise<CardRoom> {
  const root = await createCorpusHarness();
  try {
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
        return { root, chatId: row.id };
      }
    }
    throw new Error("No corpus room has a reply from a character that renders trusted HTML");
  } catch (error) {
    await root[Symbol.asyncDispose]();
    throw error;
  }
}

/** Answer the card-frame mint and serve from the page with the root's own HTTP entry, under the viewer's session. */
async function routeCardFrames(page: Page, root: Root): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const sent = await request.allHeaders();
    const headers: Record<string, string> = { cookie, forwarded: "" };
    for (const name of [CSRF_HEADER, "content-type"]) {
      const value = sent[name.toLowerCase()];
      if (value !== undefined) {
        headers[name] = value;
      }
    }
    const body = request.postData();
    const response = await root.http.request(new URL(request.url()).pathname, { method: request.method(), headers, ...(body === null ? {} : { body }) });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
}

/** Which delivery the card frame used, and the computed font size of one line inside it. */
async function frameText(page: Page, selector: string): Promise<{ readonly delivery: string | null; readonly px: number }> {
  const delivery = await page.locator(FRAME).getAttribute("data-delivery");
  const px = Number.parseFloat(
    await page
      .frameLocator(FRAME)
      .locator(selector)
      .evaluate((node) => getComputedStyle(node).fontSize),
  );
  return { delivery, px };
}

test("a routed chat card's rem text follows the appearance font scale and stops at the clamp's bounds", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  const { chatId } = room;
  const caller = await root.internalCallerFor(root.ownerId);
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  await routeCardFrames(page, root);
  const story = await mount<typeof RoutedCardTextScaleStory>(STORY, { chatId, fontScale: 1 });
  await expect.poll(() => frameText(page, "#px")).toMatchObject({ delivery: "routed" });
  const fixed = (await frameText(page, "#px")).px;
  await expect.poll(() => frameText(page, "#rem")).toEqual({ delivery: "routed", px: fixed });
  for (const [fontScale, served] of [
    [MAX_SCALE, MAX_SCALE],
    [MIN_SCALE, MIN_SCALE],
    [PLANTED_SCALE, MAX_SCALE],
  ] as const) {
    await story.update({ chatId, fontScale });
    await expect.poll(() => frameText(page, "#rem"), `scale ${fontScale}`).toEqual({ delivery: "routed", px: fixed * served });
    expect(await frameText(page, "#px")).toEqual({ delivery: "routed", px: fixed });
  }
});
