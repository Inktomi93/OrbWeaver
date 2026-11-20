// The card archive's card says why its controls do nothing as the transcript's card does: a scripted card of a
// character below Interactive names her step, and the same card whose scripts run shows no notice while its script
// visibly runs; a card naming an external image the install blocks says so; and the card's body takes the transcript
// card's inset at phone and desktop widths. The real archive (`RpgSceneCards`) over a corpus room whose latest reply is one scripted `:::card`, its
// reads, `/api/auth/config` and the card-frame mint and serve answered by the corpus root, so the posture is the server's.
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { frameTextInsetPx, hostLengthPx } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { RpgSceneCardsStory } from "./_scene-cards-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/rpg/components/_scene-cards-stories/RpgSceneCardsStory";
const ARCHIVE_ROW = '[data-slot="rpg-card-row"]';
const ROUTED_CARD = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const NOTICE = '[data-slot="plain-notice"]';
const VIEWER_PASSWORD = "archive-card-notices-viewer-password";
const STATIC_TEXT = "The tide clock is still.";
const RAN_TEXT = "The tide clock is wound.";
// A card whose own script rewrites its text: the text says whether the frame ran it.
const SCRIPTED_CARD = `:::card title="Tide clock"\n<p id="clock">${STATIC_TEXT}</p>\n<script>document.getElementById("clock").textContent = "${RAN_TEXT}";</script>\n:::`;
// A static card naming an external image, so only the media notice can apply.
const IMAGE_CARD = `:::card title="Tide chart"\n<p>${STATIC_TEXT}</p>\n<img src="https://media.example.test/tide.png" alt="Tide chart">\n:::`;
const ARCHIVE_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings"] as const;

interface CardRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

/** A room the owner hosts whose latest character reply is `card`, its speaker at the given step. */
async function cardRoom(owner: Caller, interactive: boolean, card = SCRIPTED_CARD): Promise<CardRoom> {
  for (const row of (await owner.chat.listChats({ limit: 100 })).items) {
    if (!(await owner.chat.getChat({ chatId: row.id })).viewerIsHost) {
      continue;
    }
    const { messages } = await owner.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null);
    if (reply?.characterId !== undefined && reply.characterId !== null) {
      await owner.chat.editMessage({ chatId: row.id, messageId: reply.id, content: card, timeZone: UTC_TIME_ZONE });
      await owner.settings.updateAppSettings({ partial: { defaultHtmlStep: "interactive" } });
      await owner.character.update({ characterId: reply.characterId, input: { trustHtml: true, interactiveHtml: interactive } });
      await owner.settings.updateUserSettingsSection({ section: "chat", patch: { runCardScripts: true } });
      return { chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No room the owner hosts has a character reply to rewrite");
}

async function serveArchive(page: Page, root: Root, owner: Caller): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(owner, ARCHIVE_READS));
  await routeCardFrames(page, root, cookie);
}

test("an archived scripted card of a character below Interactive names her step under the card", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await cardRoom(owner, false);
  await serveArchive(page, root, owner);
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.frameLocator(ROUTED_CARD).getByText(STATIC_TEXT)).toBeVisible();
  const notice = dialog.locator(NOTICE);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-reason", "character-scripts");
  await expect(notice).toHaveAttribute("data-remedy", "character-trust");
  await expect(notice).toContainText((await owner.character.get({ characterId: room.characterId })).name);
  await page.unrouteAll({ behavior: "wait" });
});

test("an archived scripted card whose scripts run shows no notice while its script runs", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await cardRoom(owner, true);
  await serveArchive(page, root, owner);
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.frameLocator(ROUTED_CARD).getByText(RAN_TEXT)).toBeVisible();
  await expect(dialog.locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

for (const { name, width, height } of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`an archived card's body sits the block step in from its edge at ${name} width`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height });
    await using root = await createCorpusHarness();
    const owner = await root.internalCallerFor(root.ownerId);
    const room = await cardRoom(owner, false, IMAGE_CARD);
    await serveArchive(page, root, owner);
    await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
    await page.locator(ARCHIVE_ROW).first().click();
    const card = page.getByRole("dialog").locator(ROUTED_CARD);
    await expect(card.contentFrame().getByText(STATIC_TEXT)).toBeVisible();
    // Read once the app's stylesheet is on the page, which declares the token.
    const step = await hostLengthPx(page, TOKENS["spacing.block"].cssVar);
    expect(step).toBeGreaterThan(0);
    expect(await frameTextInsetPx(card, STATIC_TEXT)).toBeCloseTo(step, 0);
    await page.unrouteAll({ behavior: "wait" });
  });
}

test("an archived card naming an external image says the install blocks it, and with media allowed says nothing", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await cardRoom(owner, false, IMAGE_CARD);
  await owner.settings.updateAppSettings({ partial: { forbidExternalMedia: true } });
  await serveArchive(page, root, owner);
  const blocked = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.frameLocator(ROUTED_CARD).getByText(STATIC_TEXT)).toBeVisible();
  await expect(dialog.locator(NOTICE)).toHaveCount(1);
  await expect(dialog.locator(NOTICE)).toHaveAttribute("data-reason", "install-media");
  await blocked.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await owner.settings.updateAppSettings({ partial: { forbidExternalMedia: false } });
  await serveArchive(page, root, owner);
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  await expect(page.getByRole("dialog").frameLocator(ROUTED_CARD).getByText(STATIC_TEXT)).toBeVisible();
  await expect(page.getByRole("dialog").locator(NOTICE)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
