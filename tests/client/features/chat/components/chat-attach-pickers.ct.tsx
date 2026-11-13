// The three attach pickers on the production This-chat tab: a failed library read is a failed read, not an empty library,
// and a refused attach says so in the picker once.
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ChatId } from "@orb/kit/ids";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { absenceWindow, holdServed, routeAuthConfig, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  CHAT_ADD_FROM_BANK_NAME,
  CHAT_ATTACH_BOOK_FAILURE,
  CHAT_ATTACH_BOOK_NAME,
  CHAT_ATTACH_SCRIPT_NAME,
  CHAT_ATTACH_SCRIPTS_COMMIT_NAME,
  CHAT_ATTACH_SCRIPTS_FAILURE,
  CHAT_BANK_EMPTY_TITLE,
  CHAT_BOOK_PICKER_EMPTY_TITLE,
  CHAT_BOOK_PICKER_READ,
  CHAT_DOCUMENT_PICKER_READ,
  CHAT_DOCUMENT_SEARCH_NAME,
  chatAttachItemName,
} from "#client/features/chat/lib/chat-attach-names.ts";
import { CHAT_DOCUMENTS_SECTION_LABEL, CHAT_WORLD_BOOKS_SECTION_LABEL } from "#client/features/chat/lib/chat-settings-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

// A dialog that does close has finished its exit transition inside this span.
const DIALOG_EXIT_WINDOW_MS = 800;
const TAB_STORY = "tests/client/features/chat/components/_chat-forks-stories/ChatContextTabStory";

const TAB_PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "chat.listForks",
  "chat.listChatInjections",
  "databank.listActiveForChat",
  "worldInfo.listForChat",
  "regex.listForChat",
  "regex.listRoomDisplayScripts",
  "chat.listEffectiveRegex",
  "chat.getUserMacroPicks",
  "chat.getVariablePicks",
  "preset.get",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

/** A room the owner hosts, so every attach door is offered. */
async function hostRoom(root: Harness): Promise<{ readonly chatId: ChatId; readonly host: Caller }> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    if ((await host.chat.getChat({ chatId: room.id })).viewerIsHost) {
      return { chatId: room.id, host };
    }
  }
  throw new Error("The corpus has no room the owner hosts");
}

async function openTab(root: Harness, page: Page, host: Caller, overrides: TrpcRoutes): Promise<void> {
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, { ...serveCorpusProcedures(host, TAB_PROCEDURES), ...overrides });
}

test("a failed world-book read in the attach picker offers a Retry and does not claim there are no books", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  let failing = true;
  await openTab(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["worldInfo.listBooks"], () => (failing ? trpcError() : undefined)),
  );
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_WORLD_BOOKS_SECTION_LABEL)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_ATTACH_BOOK_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(queryFailedLabel(CHAT_BOOK_PICKER_READ), { exact: true })).toBeVisible();
  await expect(dialog.getByText(CHAT_BOOK_PICKER_EMPTY_TITLE, { exact: true })).toHaveCount(0);
  failing = false;
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(dialog.getByText(queryFailedLabel(CHAT_BOOK_PICKER_READ), { exact: true })).toHaveCount(0);
});

test("a failed bank read in the add-document picker offers a Retry and does not claim the bank is empty", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  let failing = true;
  await openTab(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["databank.list"], () => (failing ? trpcError() : undefined)),
  );
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_DOCUMENTS_SECTION_LABEL)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_ADD_FROM_BANK_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(queryFailedLabel(CHAT_DOCUMENT_PICKER_READ), { exact: true })).toBeVisible();
  await expect(dialog.getByText(CHAT_BANK_EMPTY_TITLE, { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: CHAT_DOCUMENT_SEARCH_NAME, exact: true })).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(dialog.getByText(queryFailedLabel(CHAT_DOCUMENT_PICKER_READ), { exact: true })).toHaveCount(0);
});

test("a refused attach is said in the picker", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const book = await host.worldInfo.createBook({ input: { name: "Pickable book" } });
  await openTab(root, page, host, {
    ...serveCorpusProcedures(host, ["worldInfo.listBooks"]),
    ...serveCorpusProcedures(host, ["worldInfo.attachToChat"], () => trpcError()),
  });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: new RegExp(`^${RegExp.escape(CHAT_WORLD_BOOKS_SECTION_LABEL)}`, "u") }).click();
  await page.getByRole("button", { name: CHAT_ATTACH_BOOK_NAME, exact: true }).click();
  await page.getByRole("button", { name: chatAttachItemName(book.name), exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(CHAT_ATTACH_BOOK_FAILURE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: chatAttachItemName(book.name), exact: true })).toBeEnabled();
});

test("a script attach in flight keeps the picker open, so its failure is said in the picker", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const script = await host.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "Held script", findRegex: "x", replaceString: "y", placement: [] }),
  });
  const hold = holdServed();
  await openTab(root, page, host, {
    ...serveCorpusProcedures(host, ["regex.listScripts"]),
    ...serveCorpusProcedures(host, ["regex.attachToChat"], () => hold),
  });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: /^Regex/u }).click();
  await page.getByRole("button", { name: CHAT_ATTACH_SCRIPT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: chatAttachItemName(script.name), exact: true }).click();
  await dialog.getByRole("button", { name: CHAT_ATTACH_SCRIPTS_COMMIT_NAME, exact: true }).click();
  await hold.requested;
  await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  // Let a dialog that does close finish its exit transition before asserting that this one stayed.
  await absenceWindow(page, DIALOG_EXIT_WINDOW_MS);
  await expect(dialog).toBeVisible();
  hold.fail();
  await expect(dialog.getByText(CHAT_ATTACH_SCRIPTS_FAILURE, { exact: true })).toBeVisible();
});
