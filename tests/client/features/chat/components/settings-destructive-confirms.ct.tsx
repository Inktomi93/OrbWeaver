// An autosaved press has no way back, so the This-chat tab asks before authored text leaves, over the real composed server.
import type { ChatId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { OVERRIDE_CLEAR_VERB } from "#client/features/chat/lib/chat-surface-names.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "chat.setChatInjection",
  "chat.deleteChatInjection",
  "chat.setRoomOverrides",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

async function hostedRoom(root: Harness, page: Page): Promise<{ readonly chatId: ChatId; readonly host: Caller }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
      await routeTrpc(page, serveCorpusProcedures(host, PROCEDURES));
      return { chatId: room.id, host };
    }
  }
  throw new Error("The corpus has no room the owner hosts");
}

test("Remove injection asks first: Cancel keeps the row, and the verb deletes it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostedRoom(root, page);
  const before = (await host.chat.listChatInjections({ chatId })).length;
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  await page.getByRole("button", { name: /^Injections/u }).click();
  await page.getByRole("button", { name: "Add injection", exact: true }).click();
  await expect.poll(async () => (await host.chat.listChatInjections({ chatId })).length).toBe(before + 1);

  const remove = page.getByRole("button", { name: "Remove injection", exact: true }).last();
  const confirm = page.getByRole("alertdialog", { name: "Remove this injection?", exact: true });
  await remove.click();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(await host.chat.listChatInjections({ chatId })).toHaveLength(before + 1);

  await remove.click();
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(async () => (await host.chat.listChatInjections({ chatId })).length).toBe(before);
});

test("a set override asks before Clear wipes it, and an unset one offers nothing to clear", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId } = await hostedRoom(root, page);
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  await page.getByRole("button", { name: "Scenario, inheriting", exact: true }).click();
  const scenario = page.getByRole("textbox", { name: "Scenario", exact: true });
  const clear = page.getByRole("button", { name: OVERRIDE_CLEAR_VERB, exact: true });
  await expect(clear).toHaveCount(0);

  await scenario.fill("A storm over the harbour");
  const confirm = page.getByRole("alertdialog", { name: `${OVERRIDE_CLEAR_VERB} Scenario?`, exact: true });
  await clear.click();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(scenario).toHaveValue("A storm over the harbour");

  await clear.click();
  await confirm.getByRole("button", { name: OVERRIDE_CLEAR_VERB, exact: true }).click();
  await expect(scenario).toHaveValue("");
  await expect(clear).toHaveCount(0);
});
