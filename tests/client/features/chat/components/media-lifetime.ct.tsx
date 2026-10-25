import { blobUrl } from "@orb/contracts/assets";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { TideMediaLifetimeStory } from "./_media-lifetime-stories.tsx";

test.use({ trace: "on" });

const ROOM_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listReactions",
  "chat.listMessages",
  "chat.previewContextFit",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
] as const;

test("Tide retains zoom for identical snapshots and closes obsolete media on message replacement", async ({
  corpus,
  corpusMedia,
  mount,
  page,
  baseURL,
}, testInfo) => {
  if (baseURL === undefined) {
    throw new Error("The component gallery has no configured base URL");
  }
  const hashes = corpus.reads["character.list"][0]?.output.items.flatMap((item) => (item.avatarHash === null ? [] : [item.avatarHash]));
  if (hashes?.[0] === undefined || hashes[1] === undefined) {
    throw new Error("Committed library must include two real images");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { chatStyle: "tide" } });
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  const capturedChat = corpus.reads["chat.getChat"][0]?.output;
  if (capturedChat === undefined) {
    throw new Error("Committed corpus omitted a chat");
  }
  const chatId = (await caller.chat.getChat({ chatId: capturedChat.id })).id;
  const firstUrl = new URL(blobUrl(hashes[0]), baseURL).href;
  const secondUrl = new URL(blobUrl(hashes[1]), baseURL).href;
  const existing = await caller.chat.listMessages({ chatId });
  const message = existing.messages.find((row) => row.role === "user");
  if (message === undefined) {
    throw new Error("Committed chat omitted its user message");
  }
  await caller.chat.editMessage({ chatId, messageId: message.id, content: `Lead paragraph\n\n![First witness](${firstUrl})`, timeZone: UTC_TIME_ZONE });
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeTrpc(page, serveCorpusProcedures(caller, ROOM_READS));
  await corpusMedia();
  const component = await mount<typeof TideMediaLifetimeStory>("tests/client/features/chat/components/_media-lifetime-stories/TideMediaLifetimeStory", {
    chatId,
  });
  await expect(page.locator('[data-slot="message-bubble-train"]').filter({ hasText: "Lead paragraph" })).toBeVisible();
  await page.getByRole("button", { name: /^External media — load from / }).click();
  const firstImage = page.getByRole("img", { name: "First witness", exact: true });
  await expect.poll(() => firstImage.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(
    await firstImage.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "First witness", exact: true }).click();
  const zoom = page.getByRole("dialog");
  await expect(zoom).toBeVisible();
  await zoom.getByRole("button", { name: /^External media — load from / }).click();
  await expect
    .poll(() =>
      zoom.getByRole("img", { name: "First witness", exact: true }).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  expect(
    await zoom.getByRole("img", { name: "First witness", exact: true }).evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  await component.update({ chatId, revision: 1 });
  await expect(page.locator('output[aria-label="Read revision"]')).toHaveText("1");
  await expect(zoom).toBeVisible();
  const before = testInfo.outputPath("unchanged-media-zoom.png");
  await page.screenshot({ path: before });
  await testInfo.attach("unchanged-media-zoom", { path: before });
  await caller.chat.editMessage({ chatId, messageId: message.id, content: `Lead paragraph\n\n![Replacement witness](${secondUrl})`, timeZone: UTC_TIME_ZONE });
  await component.update({ chatId, revision: 2 });
  await expect(page.locator('output[aria-label="Read revision"]')).toHaveText("2");
  await expect(zoom).toHaveCount(0);
  await page.getByRole("button", { name: /^External media — load from / }).click();
  const replacement = page.getByRole("img", { name: "Replacement witness", exact: true });
  await expect.poll(() => replacement.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  expect(
    await replacement.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Replacement witness", exact: true }).click();
  await expect(zoom).toBeVisible();
  await zoom.getByRole("button", { name: /^External media — load from / }).click();
  await expect
    .poll(() =>
      zoom.getByRole("img", { name: "Replacement witness", exact: true }).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0),
    )
    .toBe(true);
  expect(
    await zoom.getByRole("img", { name: "Replacement witness", exact: true }).evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.naturalWidth > 0;
    }),
  ).toBe(true);
  const enlarged = testInfo.outputPath("replacement-media-enlarged.png");
  await page.screenshot({ path: enlarged });
  await testInfo.attach("replacement-media-enlarged", { path: enlarged });
  await page.keyboard.press("Escape");
  await expect(zoom).toHaveCount(0);
  const after = testInfo.outputPath("replacement-media.png");
  await page.screenshot({ path: after });
  await testInfo.attach("replacement-media", { path: after });
});
