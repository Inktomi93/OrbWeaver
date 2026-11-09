import { DIALOG_VERBS } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { holdServed, routeAuthConfig, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHAT_SAVED_REPLIES_DOOR_NAME, CHAT_SAVED_REPLIES_NAME, CHAT_SAVED_REPLY_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { MESSAGE_ACTIONS_MENU_NAME } from "#client/features/chat/lib/message-action-names.ts";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

// The picker reads the slot's stored siblings under its own QueryBoundary, over the real composed server.
const TRANSCRIPT_STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";

const TRANSCRIPT_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "character.get",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.previewContextFit",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

test("a failed saved-replies read retries through its boundary: the picker shows its skeleton, then announces the stored replies", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  const card = (await host.character.list({ limit: 1 })).items[0];
  if (card === undefined) {
    throw new Error("The corpus has no character");
  }
  await host.character.update({ characterId: card.id, input: { greetings: [{ text: "The first card greeting." }, { text: "The second card greeting." }] } });
  const { chat } = await host.chat.startChat({ characterIds: [card.id], opening: "first-message" });
  const greeting = (await host.chat.listMessages({ chatId: chat.id })).messages.at(-1);
  if (greeting === undefined) {
    throw new Error("The card opening committed no greeting");
  }
  // An authored greeting stepped onto a card alternate keeps the authored text as a stored sibling.
  await host.chat.editMessage({ chatId: chat.id, messageId: greeting.id, content: "An authored greeting kept beside the card.", timeZone: UTC_TIME_ZONE });
  await host.chat.setSeededGreeting({ chatId: chat.id, messageId: greeting.id, greetingIndex: 0 });

  let failing = true;
  const retried = holdServed();
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(host, TRANSCRIPT_PROCEDURES),
    ...serveCorpusProcedures(host, ["chat.listMessageVariants"], () => (failing ? trpcError({ code: "BAD_REQUEST" }) : retried)),
  });
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(TRANSCRIPT_STORY, {
    chatId: chat.id,
    width: 960,
    height: 900,
    appearance: appearanceSettingsSchema.parse({}),
    startTurnLabel: "Start a turn",
  });

  const row = page.locator(`[data-message-id="${greeting.id}"]`);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
  await page.getByRole("menuitem", { name: CHAT_SAVED_REPLIES_DOOR_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHAT_SAVED_REPLIES_NAME, exact: true });
  await expect(dialog.locator('[data-slot="query-error"]')).toBeVisible();

  failing = false;
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await retried.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  await expect(dialog.locator('[data-slot="query-error"]')).toHaveCount(0);
  retried.release();
  await expect(dialog.getByRole("combobox", { name: CHAT_SAVED_REPLY_NAME, exact: true })).toBeVisible();
  // The pressed Retry left with the error state, so the boundary's own status announces the recovery.
  await expect(dialog.locator('[data-slot="query-boundary-status"]')).not.toBeEmpty();
});
