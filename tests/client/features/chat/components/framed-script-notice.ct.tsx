// A framed card or styled reply whose controls need scripts the frame's posture does not run says why, naming the
// install's interactive-card switch, the character's step or the viewer's own script setting, with a control only for a
// viewer who may change it: the real transcript (`MessageListSurface`) over a corpus room, its reads, `/api/auth/config`
// and the card-frame mint and serve answered by the corpus root, so the frame's posture is the server's own. A static
// card shows none, and a card whose scripts run shows none while its script visibly runs.

import type { FramedScriptReason, PlainRemedy } from "@orb/client/lib";
import { ALLOW_INTERACTIVE_CARDS_CONFIG_SETTING, CHARACTER_TRUST_TAB_ID, MEDIA_TRUST_CONFIG_SUB } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHAT_MESSAGE_HANDLING_SUBCATEGORY } from "#client/features/chat/lib/chat-behavior-message-handling-model.ts";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
type UserId = Root["ownerId"];

const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "framed-script-viewer-password";
const NOTICE = '[data-slot="plain-notice"]';
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const READOUT = '[data-slot="navigation-readout"]';
const CARD_FRAME = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"]';
const REPLY_FRAME = '[data-slot="reply-frame"] [data-slot="sandbox-frame"]';
const STATIC_TEXT = "The tide clock is still.";
const RAN_TEXT = "The tide clock is wound.";
// A card whose own script rewrites its text: the text says whether the frame ran it.
const SCRIPTED_CARD = `:::card title="Tide clock"\n<p id="clock">${STATIC_TEXT}</p>\n<script>document.getElementById("clock").textContent = "${RAN_TEXT}";</script>\n:::`;
const STATIC_CARD = `:::card title="Tide clock"\n<details><summary>Tide</summary><p>${STATIC_TEXT}</p></details>\n:::`;
// A display script draws a styled panel whose own script rewrites it, so the reply frames and carries script.
const CLOCK_FIND = String.raw`/<tide_clock \/>/g`;
const CLOCK_TEMPLATE = `<div class="tide-clock" style="border-left:2px solid #F4A261"><p id="clock">${STATIC_TEXT}</p><script>document.getElementById("clock").textContent = "${RAN_TEXT}";</script></div>`;
const STYLED_REPLY = "<tide_clock />\n\nGuinevere sets down her goblet.";
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

interface ScriptRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

/** A room `viewer` sits in, hosted by `host`, whose latest character reply now holds `body`. */
async function scriptRoom(host: Caller, viewer: Caller, body: string): Promise<ScriptRoom> {
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
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No room the viewer sits in has a character reply its host can rewrite");
}

/** The three consents the frame's script posture reads: the install ceiling, the character's step and the viewer's own. */
async function setConsents(
  owner: Caller,
  viewer: Caller,
  room: ScriptRoom,
  consents: { readonly install: boolean; readonly interactive: boolean; readonly viewerRuns: boolean },
): Promise<void> {
  await owner.settings.updateAppSettings({ partial: { allowInteractiveCards: consents.install } });
  // The character renders trusted HTML either way, so the card keeps its sandboxed frame on every posture.
  await owner.character.update({ characterId: room.characterId, input: { trustHtml: true, interactiveHtml: consents.interactive } });
  await viewer.settings.updateUserSettingsSection({ section: "chat", patch: { runCardScripts: consents.viewerRuns } });
}

/** The room's reads and card frames under `viewer`, with the install's auth config as the root serves it now. */
async function serveRoom(page: Page, root: Root, viewer: Caller, viewerId: UserId): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(viewerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(viewer, TRANSCRIPT_READS));
  await routeCardFrames(page, root, cookie);
}

async function expectVerdict(page: Page, reason: FramedScriptReason, remedy: PlainRemedy): Promise<Locator> {
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

test("a scripted card held by the install's interactive switch names it, and the admin's control opens that switch", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await scriptRoom(owner, owner, SCRIPTED_CARD);
  await setConsents(owner, owner, room, { install: false, interactive: true, viewerRuns: true });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  // The frame drew the card and ran none of its script.
  await expect(page.frameLocator(CARD_FRAME).getByText(STATIC_TEXT)).toBeVisible();
  const notice = await expectVerdict(page, "install-scripts", "system-trust");
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "config");
  await expect(readout).toHaveAttribute("data-config-target", `admin/${MEDIA_TRUST_CONFIG_SUB}/${ALLOW_INTERACTIVE_CARDS_CONFIG_SETTING}`);
  await page.unrouteAll({ behavior: "wait" });
});

test("a scripted card of a character below Interactive names her, and the host's control opens her Trust tab", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await scriptRoom(owner, owner, SCRIPTED_CARD);
  await setConsents(owner, owner, room, { install: true, interactive: false, viewerRuns: true });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(STATIC_TEXT)).toBeVisible();
  const notice = await expectVerdict(page, "character-scripts", "character-trust");
  await expect(notice).toContainText((await owner.character.get({ characterId: room.characterId })).name);
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "characters");
  await expect(readout).toHaveAttribute("data-character", room.characterId);
  await expect(readout).toHaveAttribute("data-context-tab", CHARACTER_TRUST_TAB_ID);
  await page.unrouteAll({ behavior: "wait" });
});

test("a styled reply whose panel carries script, viewed with the viewer's own scripts off, sends them to that setting", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const script = await owner.regex.createScript({
    input: { name: "Tide clock", findRegex: CLOCK_FIND, replaceString: CLOCK_TEMPLATE, targets: ["AI_OUTPUT"], passes: ["display"] },
  });
  await owner.regex.attachGlobal({ scriptId: script.id });
  const room = await scriptRoom(owner, owner, STYLED_REPLY);
  await setConsents(owner, owner, room, { install: true, interactive: true, viewerRuns: false });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(REPLY_FRAME).getByText(STATIC_TEXT)).toBeVisible();
  const notice = await expectVerdict(page, "viewer-scripts", "own-scripts");
  await notice.locator(NOTICE_ACTION).click();
  const readout = page.locator(READOUT);
  await expect(readout).toHaveAttribute("data-section", "config");
  const runScripts = CHAT_MESSAGE_HANDLING_SUBCATEGORY.settings?.find((setting) => setting.key === "runCardScripts")?.id;
  await expect(readout).toHaveAttribute("data-config-target", `chat-behavior/${CHAT_MESSAGE_HANDLING_SUBCATEGORY.id}/${runScripts ?? ""}`);
  await page.unrouteAll({ behavior: "wait" });
});

test("a member who cannot change the character's step is told who can, with no control", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const { owner, member, memberId } = await sharedRoomPeople(root, corpus);
  const room = await scriptRoom(owner, member, SCRIPTED_CARD);
  await setConsents(owner, member, room, { install: true, interactive: false, viewerRuns: true });
  await serveRoom(page, root, member, memberId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText(STATIC_TEXT)).toBeVisible();
  await expectVerdict(page, "character-scripts", "ask-host");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("a scripted card whose scripts run shows no notice, and neither does a static card on a script-dead frame", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await scriptRoom(owner, owner, SCRIPTED_CARD);
  await setConsents(owner, owner, room, { install: true, interactive: true, viewerRuns: true });
  await serveRoom(page, root, owner, root.ownerId);
  const running = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  // The script ran inside the frame, so its controls work and there is nothing to explain.
  await expect(page.frameLocator(CARD_FRAME).getByText(RAN_TEXT)).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await running.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await owner.chat.editMessage({ chatId: room.chatId, messageId: await latestReplyId(owner, room), content: STATIC_CARD, timeZone: UTC_TIME_ZONE });
  await setConsents(owner, owner, room, { install: false, interactive: false, viewerRuns: false });
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expect(page.frameLocator(CARD_FRAME).getByText("Tide", { exact: true })).toBeVisible();
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

async function latestReplyId(host: Caller, room: ScriptRoom): Promise<Awaited<ReturnType<Caller["chat"]["listMessages"]>>["messages"][number]["id"]> {
  const { messages } = await host.chat.listMessages({ chatId: room.chatId });
  const reply = messages.findLast((message) => message.role === "assistant" && message.characterId === room.characterId);
  if (reply === undefined) {
    throw new Error("The room's character reply is gone");
  }
  return reply.id;
}
