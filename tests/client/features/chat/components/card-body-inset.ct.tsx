// A card's body sits the design system's block step in from the card's edge in the transcript, at phone and desktop
// widths; a styled reply's frame sits flush with its message. The real transcript (`MessageListSurface`) over a corpus
// room, the card-frame mint and serve answered by the corpus root, so the inset is the one the server's frame document
// carries. The archive's card is held to the same inset by `tests/client/features/rpg/components/archive-card-notices.ct.tsx`.
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { frameTextInsetPx, hostLengthPx } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const TRANSCRIPT_STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "card-body-inset-viewer-password";
const CARD_FRAME = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const REPLY_FRAME = '[data-slot="reply-frame"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const CARD_TEXT = "High water at dusk.";
const PANEL_TEXT = "Mood: wary.";
const CARD = `:::card title="Tide tables"\n<p>${CARD_TEXT}</p>\n:::`;
const STYLED_REPLY = `<div class="hud" style="border-left:2px solid #F4A261">\n<p>${PANEL_TEXT}</p>\n</div>\n\nGuinevere sets down her goblet.`;
const READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;
const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

/** A room whose latest reply, from a character that renders trusted HTML, now holds `body`. */
async function trustedRoom(owner: Caller, body: string): Promise<ChatId> {
  for (const row of (await owner.chat.listChats({ limit: 100 })).items) {
    const detail = await owner.chat.getChat({ chatId: row.id });
    const trusted = new Set(
      detail.participants.flatMap((seat) =>
        seat.characterId !== null && seat.renderPolicy !== undefined && rendersTrustedHtml(seat.renderPolicy.htmlTrust) ? [seat.characterId] : [],
      ),
    );
    const { messages } = await owner.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null && trusted.has(message.characterId));
    if (reply !== undefined) {
      await owner.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      return row.id;
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

async function serve(page: Page, root: Root, owner: Caller): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(owner, READS));
  await routeCardFrames(page, root, cookie);
}

for (const { name, width, height } of WIDTHS) {
  test(`a card's body sits the block step in from its edge in the transcript at ${name} width`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height });
    await using root = await createCorpusHarness();
    const owner = await root.internalCallerFor(root.ownerId);
    const chatId = await trustedRoom(owner, CARD);
    await serve(page, root, owner);
    await mount<typeof PlainContentNoticeStory>(TRANSCRIPT_STORY, { chatId });
    const card = page.locator(CARD_FRAME).last();
    await expect(card.contentFrame().getByText(CARD_TEXT)).toBeVisible();
    // Read once the app's stylesheet is on the page, which declares the token.
    const step = await hostLengthPx(page, TOKENS["spacing.block"].cssVar);
    expect(step).toBeGreaterThan(0);
    expect(await frameTextInsetPx(card, CARD_TEXT)).toBeCloseTo(step, 0);
    await page.unrouteAll({ behavior: "wait" });
  });
}

test("a styled reply's frame takes no card inset, so its text sits flush with the message", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const chatId = await trustedRoom(owner, STYLED_REPLY);
  await serve(page, root, owner);
  await mount<typeof PlainContentNoticeStory>(TRANSCRIPT_STORY, { chatId });
  const reply = page.locator(REPLY_FRAME).last();
  await expect(reply.contentFrame().getByText(PANEL_TEXT)).toBeVisible();
  const flush = await reply
    .contentFrame()
    .locator("body")
    .evaluate((body) => getComputedStyle(body).paddingLeft);
  expect(flush).toBe("0px");
  await page.unrouteAll({ behavior: "wait" });
});
