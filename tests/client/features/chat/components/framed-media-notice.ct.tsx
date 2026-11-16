// A framed card or styled reply whose markup names an external image says why the image is missing when the frame's
// policy refuses it, naming the install's or the character's media setting, with a control only for a viewer who may
// change it: the real transcript (`MessageListSurface`) over a corpus room, its reads, `/api/auth/config` and the
// card-frame mint and serve answered by the corpus root. Every external address routes to a recorder, so no case reaches
// the network: a refused image never asks for its address, and an allowed one is answered by the recorder.

import type { FramedMediaReason, PlainRemedy } from "@orb/client/lib";
import { CHARACTER_TRUST_TAB_ID, FORBID_EXTERNAL_MEDIA_CONFIG_SETTING, MEDIA_TRUST_CONFIG_SUB } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type UserId = Root["ownerId"];

const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "framed-media-viewer-password";
const NOTICE = '[data-slot="plain-notice"]';
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const READOUT = '[data-slot="navigation-readout"]';
const CARD_FRAME = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"]';
const REPLY_FRAME = '[data-slot="reply-frame"] [data-slot="sandbox-frame"]';
// A reserved test host: the context route below answers it, so nothing leaves the machine.
const EXTERNAL_MEDIA = "https://media.example.test/**";
const CARD_TEXT = "High water at dusk.";
const CARD_WITH_IMAGE = `:::card title="Tide tables"\n<p>${CARD_TEXT}</p>\n<img src="https://media.example.test/tide.png" alt="Tide chart">\n:::`;
const CARD_WITHOUT_EXTERNAL = `:::card title="Tide tables"\n<p>${CARD_TEXT}</p>\n<img src="/tide.png" alt="Tide chart">\n:::`;
const REPLY_TEXT = "Guinevere sets down her goblet.";
const BANNER_FIND = String.raw`/<scene_header location="([^"<>]*)" \/>/g`;
const BANNER_TEMPLATE = '<div class="w6p-banner"><img src="https://media.example.test/banner.png" alt=""><strong>$1</strong></div>';
const STYLED_REPLY = `<scene_header location="Camelot · Great Hall" />\n\n${REPLY_TEXT}`;
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

interface MediaRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly messageId: Awaited<ReturnType<Caller["chat"]["listMessages"]>>["messages"][number]["id"];
}

/** A room `viewer` sits in, hosted by `host`, whose latest character reply now holds `body`. */
async function mediaRoom(host: Caller, viewer: Caller, body: string): Promise<MediaRoom> {
  const hostRooms = new Set((await host.chat.listChats({ limit: 100 })).items.map((row) => row.id));
  for (const row of (await viewer.chat.listChats({ limit: 100 })).items) {
    const hosted = hostRooms.has(row.id) && (await host.chat.getChat({ chatId: row.id })).viewerIsHost;
    if (!hosted) {
      continue;
    }
    const { messages } = await host.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await host.chat.editMessage({ chatId: row.id, messageId: reply.id, content: body, timeZone: UTC_TIME_ZONE });
      return { chatId: row.id, characterId: reply.characterId, messageId: reply.id };
    }
  }
  throw new Error("No room the viewer sits in has a character reply its host can rewrite");
}

/** The install's and the character's media settings; the character keeps rendering trusted HTML without scripts. */
async function setMedia(owner: Caller, room: MediaRoom, media: { readonly install: boolean; readonly character: boolean }): Promise<void> {
  await owner.settings.updateAppSettings({ partial: { forbidExternalMedia: media.install } });
  await owner.character.update({ characterId: room.characterId, input: { trustHtml: true, interactiveHtml: false, forbidExternalMedia: media.character } });
}

/** The room's reads and card frames under `viewer`, the install's auth config as the root serves it now, and every
 *  request for the external media host, answered here. Returns the addresses asked for. */
async function serveRoom(page: Page, root: Root, viewer: Caller, viewerId: UserId): Promise<string[]> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(viewerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(viewer, TRANSCRIPT_READS));
  await routeCardFrames(page, root, cookie);
  const requested: string[] = [];
  await page.context().route(EXTERNAL_MEDIA, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 404, body: "" });
  });
  return requested;
}

async function addBannerScript(viewer: Caller): Promise<void> {
  const script = await viewer.regex.createScript({
    input: { name: "Scene banner", findRegex: BANNER_FIND, replaceString: BANNER_TEMPLATE, targets: ["AI_OUTPUT"], passes: ["display"] },
  });
  await viewer.regex.attachGlobal({ scriptId: script.id });
}

async function expectVerdict(page: Page, reason: FramedMediaReason, remedy: PlainRemedy): Promise<Locator> {
  const notice = page.locator(NOTICE);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-reason", reason);
  await expect(notice).toHaveAttribute("data-remedy", remedy);
  await expect(notice.locator("p")).toBeVisible();
  return notice;
}

async function sharedRoomPeople(root: Root, corpus: CorpusPlayback): Promise<{ readonly owner: Caller; readonly member: Caller; readonly memberId: UserId }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  return { owner: await root.internalCallerFor(root.ownerId), member: await root.internalCallerFor(memberId), memberId };
}

test("a card's external image refused by the install's setting names it, and the admin's control opens that setting", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await mediaRoom(owner, owner, CARD_WITH_IMAGE);
  await setMedia(owner, room, { install: true, character: false });
  const requested = await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CARD_TEXT)).toBeVisible();
  const notice = await expectVerdict(page, "install-media", "system-trust");
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "config");
  await expect(readout).toHaveAttribute("data-config-target", `admin/${MEDIA_TRUST_CONFIG_SUB}/${FORBID_EXTERNAL_MEDIA_CONFIG_SETTING}`);
  // The frame refused the image before asking for it.
  expect(requested).toEqual([]);
  await page.unrouteAll({ behavior: "wait" });
});

test("a styled reply's external image refused by the character's own setting names her, and the host's control opens her Trust tab", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  await addBannerScript(owner);
  const room = await mediaRoom(owner, owner, STYLED_REPLY);
  await setMedia(owner, room, { install: false, character: true });
  const requested = await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(REPLY_FRAME).getByText(REPLY_TEXT)).toBeVisible();
  const notice = await expectVerdict(page, "character-media", "character-trust");
  await expect(notice).toContainText((await owner.character.get({ characterId: room.characterId })).name);
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "characters");
  await expect(readout).toHaveAttribute("data-character", room.characterId);
  await expect(readout).toHaveAttribute("data-context-tab", CHARACTER_TRUST_TAB_ID);
  expect(requested).toEqual([]);
  await page.unrouteAll({ behavior: "wait" });
});

test("a member who cannot change either media setting is told who can, with no control", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { owner, member, memberId } = await sharedRoomPeople(root, corpus);
  const room = await mediaRoom(owner, member, CARD_WITH_IMAGE);

  await setMedia(owner, room, { install: true, character: false });
  await serveRoom(page, root, member, memberId);
  const installOff = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CARD_TEXT)).toBeVisible();
  await expectVerdict(page, "install-media", "ask-admin");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
  await installOff.unmount();
  await page.unrouteAll({ behavior: "wait" });
  await page.context().unrouteAll({ behavior: "wait" });

  await setMedia(owner, room, { install: false, character: true });
  await serveRoom(page, root, member, memberId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CARD_TEXT)).toBeVisible();
  await expectVerdict(page, "character-media", "ask-host");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("a card whose image may load, or that names no external media, shows no notice", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await mediaRoom(owner, owner, CARD_WITH_IMAGE);
  await setMedia(owner, room, { install: false, character: false });
  const requested = await serveRoom(page, root, owner, root.ownerId);
  const allowed = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CARD_TEXT)).toBeVisible();
  // The policy let the frame ask for the image, which the recorder answered; so nothing was withheld to explain.
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await allowed.unmount();
  await page.unrouteAll({ behavior: "wait" });
  await page.context().unrouteAll({ behavior: "wait" });

  await owner.chat.editMessage({ chatId: room.chatId, messageId: room.messageId, content: CARD_WITHOUT_EXTERNAL, timeZone: UTC_TIME_ZONE });
  await setMedia(owner, room, { install: true, character: true });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(CARD_TEXT)).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
