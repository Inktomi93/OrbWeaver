// The held-cards notice on the two row kinds beside the plain settled row: a reply drawn through the framed layout (its
// model panel frames) and the ghost row while a reply streams. Each says it in a game room whose immersive HTML cards
// are off when the reply holds card markup, and says nothing with the switch on. The real transcript
// (`MessageListSurface`) over a corpus game room the owner hosts, its reads, `/api/auth/config` and card frames
// answered by the corpus root.

import { HELD_CARDS_REASON } from "@orb/client/lib";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";
import { GHOST_ROOM_PROCEDURES } from "./ghost-room.fixtures.ts";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const TRANSCRIPT_STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const STREAM_STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const VIEWER_PASSWORD = "held-cards-rows-viewer-password";
const NOTICE = `[data-slot="plain-notice"][data-reason="${HELD_CARDS_REASON}"]`;
const GHOST_ROW = '[data-slot="ghost-message-row"]';
const REPLY_FRAME = '[data-slot="reply-frame"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const CARD_FRAME = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const PROSE = "Guinevere unrolls the chart.";
const PANEL_TEXT = "Mood: wary.";
const CHART_TEXT = "High water at dusk.";
// A naked element-majority block the lenient wrap cards, with no style, so no model panel frames it on its own.
const CARD_BLOCK = `<div class="tide-chart">\n<p>${CHART_TEXT}</p>\n<p>Low water at dawn.</p>\n</div>`;
const CARD_MARKUP = `${PROSE}\n\n${CARD_BLOCK}`;
// A styled block the sandboxed tier frames as a model panel (D354), beside the same card block.
const PANEL_REPLY = `<div class="hud" style="border-left:2px solid #F4A261">\n<p>${PANEL_TEXT}</p>\n</div>\n\n${CARD_MARKUP}`;
const TRANSCRIPT_READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

interface GameRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

/** A game room the owner hosts whose latest character reply holds `body`, its speaker on the sandboxed tier. */
async function gameRoom(owner: Caller, body: string, immersiveHtml: boolean): Promise<GameRoom> {
  for (const row of (await owner.chat.listChats({ limit: 100 })).items) {
    const detail = await owner.chat.getChat({ chatId: row.id });
    if (!detail.viewerIsHost || detail.rpg === null) {
      continue;
    }
    const { messages } = await owner.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await owner.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      await owner.character.update({ characterId: reply.characterId, input: { trustHtml: true } });
      await owner.rpg.updateConfig({ chatId: row.id, patch: { immersiveHtml } });
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("The corpus has no game room the owner hosts with a character reply");
}

async function serveRoom(page: Page, root: Root, owner: Caller, reads: Parameters<typeof serveCorpusProcedures>[1]): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(owner, reads));
  await routeCardFrames(page, root, cookie);
}

// With the switch off the row takes the framed layout, its panel in the routed reply frame; with it on the game's wrap
// draws both blocks as cards, the chart in the last card's frame.
const SWITCH_CASES = [
  { immersiveHtml: false, notices: 1, frame: REPLY_FRAME, drawn: PANEL_TEXT },
  { immersiveHtml: true, notices: 0, frame: CARD_FRAME, drawn: CHART_TEXT },
] as const;

for (const { immersiveHtml, notices, frame, drawn } of SWITCH_CASES) {
  test(`a framed reply holding card markup shows ${String(notices)} held-cards notice with immersive HTML ${immersiveHtml ? "on" : "off"}`, async ({
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    const owner = await root.internalCallerFor(root.ownerId);
    const room = await gameRoom(owner, PANEL_REPLY, immersiveHtml);
    await serveRoom(page, root, owner, TRANSCRIPT_READS);
    await mount<typeof PlainContentNoticeStory>(TRANSCRIPT_STORY, { chatId: room.chatId });
    await expect(page.locator(frame).last().contentFrame().getByText(drawn)).toBeVisible();
    await expect(page.locator(NOTICE)).toHaveCount(notices);
    await page.unrouteAll({ behavior: "wait" });
  });

  test(`a streaming reply holding card markup shows ${String(notices)} held-cards notice with immersive HTML ${immersiveHtml ? "on" : "off"}`, async ({
    mount,
    page,
    corpusMedia,
  }) => {
    await using root = await createCorpusHarness();
    const owner = await root.internalCallerFor(root.ownerId);
    const room = await gameRoom(owner, PROSE, immersiveHtml);
    await serveRoom(page, root, owner, GHOST_ROOM_PROCEDURES);
    await corpusMedia();
    await mount<typeof StreamingReplyStory>(STREAM_STORY, {
      chatId: room.chatId,
      speakerCharacterId: room.characterId,
      streamedText: CARD_MARKUP,
      streamLabel: STREAM_LABEL,
    });
    // The settled reply holds prose only, so any notice on screen is the ghost's.
    await expect(page.getByText(PROSE)).toHaveCount(1);
    await expect(page.locator(NOTICE)).toHaveCount(0);
    await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
    const ghost = page.locator(GHOST_ROW);
    await expect(ghost).toContainText(PROSE);
    await expect(ghost.locator(NOTICE)).toHaveCount(notices);
    await expect(page.locator(NOTICE)).toHaveCount(notices);
    await page.unrouteAll({ behavior: "wait" });
  });
}

test("a streaming reply of prose only shows no held-cards notice with immersive HTML off", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await gameRoom(owner, PROSE, false);
  await serveRoom(page, root, owner, GHOST_ROOM_PROCEDURES);
  await corpusMedia();
  const streamed = "Lancelot checks the rigging.";
  await mount<typeof StreamingReplyStory>(STREAM_STORY, {
    chatId: room.chatId,
    speakerCharacterId: room.characterId,
    streamedText: streamed,
    streamLabel: STREAM_LABEL,
  });
  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  await expect(page.locator(GHOST_ROW)).toContainText(streamed);
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
