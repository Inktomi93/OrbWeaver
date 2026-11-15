// A row whose rich content renders plain says why, and opens the one setting that turns it on when the viewer may change
// it: the real transcript (`MessageListSurface`) over a corpus room, the room's reads and `/api/auth/config` answered by
// the corpus root, so the reason comes from the character and install settings the root actually holds. Both plain
// arms carry the notice: an inert `:::card`, and a reply a display script styled that its tier draws through the inert
// path.

import type { PlainReason, PlainRemedy } from "@orb/client/lib";
import { CHARACTER_TRUST_TAB_ID, MEDIA_TRUST_CONFIG_SUB, TRUST_HTML_CONFIG_SETTING } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "plain-notice-viewer-password";
const NOTICE = '[data-slot="plain-notice"]';
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const INERT_CARD = '[data-slot="inert-card"]';
const READOUT = '[data-slot="navigation-readout"]';
const BANNER_FIND = String.raw`/<scene_header location="([^"<>]*)" \/>/g`;
const BANNER_TEMPLATE = '<div class="w6p-banner" style="border-left:2px solid #F4A261"><strong>$1</strong></div>';
const CARD_TITLE = "Tide tables";
// A styled banner a display script draws, prose, then a card fence: both plain arms in one reply.
const BODY = `<scene_header location="Camelot · Great Hall" />\n\nGuinevere sets down her goblet.\n\n:::card title="${CARD_TITLE}"\n<p>High water at dusk.</p>\n:::`;
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

interface PlainRoom {
  readonly chatId: ChatId;
  readonly characterId: NonNullable<Awaited<ReturnType<Caller["chat"]["listMessages"]>>["messages"][number]["characterId"]>;
}

/** A room `viewer` sits in whose latest character reply now holds {@link BODY}, written by the room's host. */
async function plainRoom(root: Root, host: Caller, viewer: Caller): Promise<PlainRoom> {
  const hostRooms = new Set((await host.chat.listChats({ limit: 100 })).items.map((row) => row.id));
  for (const row of (await viewer.chat.listChats({ limit: 100 })).items) {
    const hosted = hostRooms.has(row.id) && (await host.chat.getChat({ chatId: row.id })).viewerIsHost;
    if (!hosted) {
      continue;
    }
    const { messages } = await host.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await host.chat.editMessage({ chatId: row.id, messageId: reply.id, content: BODY, timeZone: UTC_TIME_ZONE });
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error(`No room the viewer sits in has a character reply its host can rewrite (root ${root.ownerId})`);
}

/** The viewer's own display script on the model's replies, attached globally so it reaches the room. */
async function addBannerScript(viewer: Caller): Promise<void> {
  const script = await viewer.regex.createScript({
    input: { name: "Scene banner", findRegex: BANNER_FIND, replaceString: BANNER_TEMPLATE, targets: ["AI_OUTPUT"], passes: ["display"] },
  });
  await viewer.regex.attachGlobal({ scriptId: script.id });
}

/** The room's reads under `viewer`, and the install's auth config exactly as the root serves it to that viewer now. */
async function serveRoom(page: Page, root: Root, viewer: Caller, viewerId: Root["ownerId"]): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(viewerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(viewer, TRANSCRIPT_READS));
}

/** Both notices on the row: the inert card's and the styled reply's. */
function notices(page: Page): { readonly card: Locator; readonly reply: Locator } {
  return { card: page.locator(`${INERT_CARD} ${NOTICE}[data-placement="card"]`), reply: page.locator(`${NOTICE}[data-placement="reply"]`) };
}

async function expectVerdict(notice: Locator, reason: PlainReason, remedy: PlainRemedy): Promise<void> {
  await expect(notice).toHaveAttribute("data-reason", reason);
  await expect(notice).toHaveAttribute("data-remedy", remedy);
  // The reason is visible text, never a tooltip.
  await expect(notice.locator("p")).toBeVisible();
}

/** Two people in one room, made after the multi-user switch, which a caller reads when it is built. */
async function sharedRoomPeople(
  root: Root,
  corpus: CorpusPlayback,
): Promise<{ readonly owner: Caller; readonly member: Caller; readonly memberId: Root["ownerId"] }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  return { owner: await root.internalCallerFor(root.ownerId), member: await root.internalCallerFor(memberId), memberId };
}

test("a character set to plain text names her, and the host's control opens her Trust tab", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  await addBannerScript(owner);
  const room = await plainRoom(root, owner, owner);
  await owner.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  const { card, reply } = notices(page);
  await expectVerdict(card, "character", "character-trust");
  await expectVerdict(reply, "character", "character-trust");
  // Her name as her own library card spells it, a different read from the room roster the row is drawn from.
  await expect(card).toContainText((await owner.character.get({ characterId: room.characterId })).name);
  const control = card.locator(NOTICE_ACTION);
  await expect(control).toHaveRole("button");
  await control.click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "characters");
  await expect(readout).toHaveAttribute("data-character", room.characterId);
  await expect(readout).toHaveAttribute("data-context-tab", CHARACTER_TRUST_TAB_ID);
  // The section switch closes any slide-over; the reveal lands after it, so the panel it asked for stays open.
  await expect(readout).toHaveAttribute("data-overlay", "context");
});

test("an install that renders HTML plain, for a character who inherits it, sends an admin to the media and trust settings", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  await addBannerScript(owner);
  const room = await plainRoom(root, owner, owner);
  await owner.character.update({ characterId: room.characterId, input: { trustHtml: null, interactiveHtml: null } });
  await owner.settings.updateAppSettings({ partial: { trustHtml: false, allowInteractiveCards: false } });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  const { card, reply } = notices(page);
  await expectVerdict(card, "install", "system-trust");
  await expectVerdict(reply, "install", "system-trust");
  await card.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "config");
  await expect(readout).toHaveAttribute("data-config-target", `admin/${MEDIA_TRUST_CONFIG_SUB}/${TRUST_HTML_CONFIG_SETTING}`);
});

test("a member who cannot change the setting is told to ask the host, with no control, for either cause", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { owner, member, memberId } = await sharedRoomPeople(root, corpus);
  await addBannerScript(member);
  const room = await plainRoom(root, owner, member);
  // The shared room is a game, and its immersive HTML switch is the room's own consent to the sandboxed tier; with it
  // off the row's tier is its character's alone.
  await owner.rpg.updateConfig({ chatId: room.chatId, patch: { immersiveHtml: false } });
  const { card, reply } = notices(page);

  await owner.character.update({ characterId: room.characterId, input: { trustHtml: false, interactiveHtml: false } });
  await serveRoom(page, root, member, memberId);
  const characterOff = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectVerdict(card, "character", "ask-host");
  await expectVerdict(reply, "character", "ask-host");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
  await characterOff.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await owner.character.update({ characterId: room.characterId, input: { trustHtml: null, interactiveHtml: null } });
  await owner.settings.updateAppSettings({ partial: { trustHtml: false, allowInteractiveCards: false } });
  await serveRoom(page, root, member, memberId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectVerdict(card, "install", "ask-host");
  await expectVerdict(reply, "install", "ask-host");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
});
