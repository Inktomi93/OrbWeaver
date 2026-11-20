// A game room whose immersive HTML cards are off says, under a reply, that HTML the game would draw as a card is not
// drawn as one: the host gets the control that opens the game's settings, a member gets the reason only, and a reply with
// no such markup, or a room with the switch on, says nothing. The real transcript (`MessageListSurface`) over the
// corpus's shared game room, its reads and `/api/auth/config` answered by the corpus root.

import { HELD_CARDS_REASON } from "@orb/client/lib";
import { GAME_SETTINGS_TAB_ID } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type UserId = Root["ownerId"];

const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "held-cards-viewer-password";
const NOTICE = `[data-slot="plain-notice"][data-reason="${HELD_CARDS_REASON}"]`;
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const READOUT = '[data-slot="navigation-readout"]';
const CARD_FRAME = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"]';
const PROSE = "Guinevere unrolls the chart.";
const CHART_TEXT = "High water at dusk.";
// A naked element-majority block the lenient wrap cards, with no style, so no model panel frames it on its own.
const CARD_MARKUP = `${PROSE}\n\n<div class="tide-chart">\n<p>${CHART_TEXT}</p>\n<p>Low water at dawn.</p>\n</div>`;
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
  readonly messageId: Awaited<ReturnType<Caller["chat"]["listMessages"]>>["messages"][number]["id"];
}

/** The corpus's shared room, a game the owner hosts and the member sits in, whose latest character reply holds `body`. */
async function gameRoom(owner: Caller, member: Caller, body: string): Promise<GameRoom> {
  const hostRooms = new Set((await owner.chat.listChats({ limit: 100 })).items.map((row) => row.id));
  for (const row of (await member.chat.listChats({ limit: 100 })).items) {
    const detail = hostRooms.has(row.id) ? await owner.chat.getChat({ chatId: row.id }) : undefined;
    if (detail?.viewerIsHost !== true || detail.rpg === null) {
      continue;
    }
    const { messages } = await owner.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply !== undefined) {
      await owner.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      return { chatId: row.id, messageId: reply.id };
    }
  }
  throw new Error("The corpus has no game room the owner hosts and the member sits in");
}

async function people(root: Root, corpus: CorpusPlayback): Promise<{ readonly owner: Caller; readonly member: Caller; readonly memberId: UserId }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  return { owner: await root.internalCallerFor(root.ownerId), member: await root.internalCallerFor(memberId), memberId };
}

async function serveRoom(page: Page, root: Root, viewer: Caller, viewerId: UserId): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(viewerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(viewer, TRANSCRIPT_READS));
  await routeCardFrames(page, root, cookie);
}

test("with immersive HTML off, the host is told the reply's card markup is not drawn, and the control opens the game's settings", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const { owner, member } = await people(root, corpus);
  const room = await gameRoom(owner, member, CARD_MARKUP);
  await owner.rpg.updateConfig({ chatId: room.chatId, patch: { immersiveHtml: false } });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.getByText(PROSE)).toBeVisible();
  const notice = page.locator(NOTICE);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-remedy", "game-settings");
  await expect(notice.locator("p")).toBeVisible();
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-context-tab", GAME_SETTINGS_TAB_ID);
  await expect(readout).toHaveAttribute("data-overlay", "context");
  await page.unrouteAll({ behavior: "wait" });
});

test("a member of the same room is told who can turn it on, with no control", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { owner, member, memberId } = await people(root, corpus);
  const room = await gameRoom(owner, member, CARD_MARKUP);
  await owner.rpg.updateConfig({ chatId: room.chatId, patch: { immersiveHtml: false } });
  await serveRoom(page, root, member, memberId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  const notice = page.locator(NOTICE);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-remedy", "ask-host");
  await expect(notice.locator(NOTICE_ACTION)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("a reply with no card markup shows none, and with immersive HTML on the markup draws as a card with none", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { owner, member } = await people(root, corpus);
  const room = await gameRoom(owner, member, PROSE);
  await owner.rpg.updateConfig({ chatId: room.chatId, patch: { immersiveHtml: false } });
  await serveRoom(page, root, owner, root.ownerId);
  const prose = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.getByText(PROSE)).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await prose.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await owner.chat.editMessage({ chatId: room.chatId, messageId: room.messageId, content: CARD_MARKUP, timeZone: UTC_TIME_ZONE });
  await owner.rpg.updateConfig({ chatId: room.chatId, patch: { immersiveHtml: true } });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CHART_TEXT)).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
