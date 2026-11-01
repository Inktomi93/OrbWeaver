// The three attach pickers on the production This-chat tab: a failed library read is a failed read, not an empty library,
// and a refused attach says so in the picker once.
import type { ChatId } from "@orb/kit/ids";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ChatContextTabStory } from "./_chat-forks-stories.tsx";

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

  await page.getByRole("button", { name: /^World books/u }).click();
  await page.getByRole("button", { name: "Attach a world book", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Couldn't load your world books.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("You have no world books yet", { exact: true })).toHaveCount(0);
  failing = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByText("Couldn't load your world books.", { exact: true })).toHaveCount(0);
});

test("a failed bank read in the add-document picker offers a Retry and does not claim the bank is empty", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  await openTab(
    root,
    page,
    host,
    serveCorpusProcedures(host, ["databank.list"], () => trpcError()),
  );
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: /^Documents/u }).click();
  await page.getByRole("button", { name: "Add from your bank", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Couldn't load your documents.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Your bank is empty", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Search your documents", exact: true })).toBeVisible();
});

test("a refused attach is said once, in the picker, with no second toast from the mutation", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, host } = await hostRoom(root);
  const book = await host.worldInfo.createBook({ input: { name: "Pickable book" } });
  await openTab(root, page, host, {
    ...serveCorpusProcedures(host, ["worldInfo.listBooks"]),
    ...serveCorpusProcedures(host, ["worldInfo.attachToChat"], () => trpcError()),
  });
  await corpusMedia();
  await mount<typeof ChatContextTabStory>(TAB_STORY, { chatId });

  await page.getByRole("button", { name: /^World books/u }).click();
  await page.getByRole("button", { name: "Attach a world book", exact: true }).click();
  await page.getByRole("button", { name: `Attach ${book.name} to this chat`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Couldn't attach the world book to this chat.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Attach ${book.name} to this chat`, exact: true })).toBeEnabled();
  // The picker's sentence and the mutation's toast would quote the same text; one match means no toast.
  await expect(page.getByText("Couldn't attach the world book to this chat.", { exact: true })).toHaveCount(1);
});
