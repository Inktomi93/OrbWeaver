// An autosaved press has no way back, so the This-chat tab asks before authored text leaves, over the real composed server.
import type { ChatId } from "@orb/kit/ids";
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  CHAT_ADD_INJECTION_NAME,
  CHAT_INJECTIONS_SECTION_LABEL,
  CHAT_OVERRIDE_SCENARIO_LABEL,
  CHAT_REMOVE_INJECTION_NAME,
  CHAT_REMOVE_INJECTION_TITLE,
  overrideRowName,
} from "#client/features/chat/lib/chat-settings-names.ts";
import { OVERRIDE_CLEAR_VERB } from "#client/features/chat/lib/chat-surface-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
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
  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_INJECTIONS_SECTION_LABEL)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_ADD_INJECTION_NAME, exact: true }).click();
  await expect.poll(async () => (await host.chat.listChatInjections({ chatId })).length).toBe(before + 1);

  const remove = page.getByRole("button", { name: CHAT_REMOVE_INJECTION_NAME, exact: true }).last();
  const confirm = page.getByRole("alertdialog", { name: CHAT_REMOVE_INJECTION_TITLE, exact: true });
  await remove.click();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(await host.chat.listChatInjections({ chatId })).toHaveLength(before + 1);

  await remove.click();
  await confirm.getByRole("button", { name: DIALOG_VERBS.remove, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(async () => (await host.chat.listChatInjections({ chatId })).length).toBe(before);
  // The removed row took its trigger with it; focus stays in the list rather than falling to the page.
  await expect(page.locator(":focus")).toHaveCount(1);
});

test("an override row's name contains its label and its state word", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId } = await hostedRoom(root, page);
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  const row = page.getByRole("button", { name: overrideRowName(CHAT_OVERRIDE_SCENARIO_LABEL, false), exact: true });
  await expect(row).toBeVisible();
  const result = await accessibilityScan(page);
  const mismatched = result.violations.find(({ id }) => id === "label-content-name-mismatch")?.nodes ?? [];
  expect(mismatched.filter(({ html }) => html.includes('data-slot="collapsible-trigger"'))).toEqual([]);
});

test("a set override asks before Clear wipes it, and focus lands on the emptied field", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const { chatId } = await hostedRoom(root, page);
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });
  await page.getByRole("button", { name: overrideRowName(CHAT_OVERRIDE_SCENARIO_LABEL, false), exact: true }).click();
  const scenario = page.getByRole("textbox", { name: CHAT_OVERRIDE_SCENARIO_LABEL, exact: true });
  const clear = page.getByRole("button", { name: OVERRIDE_CLEAR_VERB, exact: true });
  await expect(clear).toBeDisabled();

  await scenario.fill("A storm over the harbour");
  const confirm = page.getByRole("alertdialog", { name: `${OVERRIDE_CLEAR_VERB} ${CHAT_OVERRIDE_SCENARIO_LABEL}?`, exact: true });
  await clear.click();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(scenario).toHaveValue("A storm over the harbour");
  await expect(clear).toBeFocused();

  await clear.click();
  await confirm.getByRole("button", { name: OVERRIDE_CLEAR_VERB, exact: true }).click();
  await expect(scenario).toHaveValue("");
  await expect(scenario).toBeFocused();
  await expect(clear).toBeDisabled();
});
