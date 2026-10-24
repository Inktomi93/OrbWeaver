// The Scene tab's card archive: its loading, error, empty and populated states, with the error arm rendered as
// the shared recoverable error state directly under the section root. Reads come from a real corpus root.
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { RpgSceneCardsStory } from "./_scene-cards-stories.tsx";

const STORY = "tests/client/features/rpg/components/_scene-cards-stories/RpgSceneCardsStory";
const ARCHIVE = '[data-slot="rpg-card-archive"]';
const CARD_TITLE = "The harbour ledger";
const CARD_FENCE = `:::card title="${CARD_TITLE}"\n<p>Tide tables for the quay.</p>\n:::`;

interface ArchiveRoom {
  readonly chatId: ChatId;
  readonly reads: TrpcRoutes<"sessions.me" | "settings.getUserSettings" | "chat.getChat">;
  readonly messages: () => Promise<TrpcWireOutput<"chat.listMessages">>;
  readonly plantCard: () => Promise<void>;
}

/** The corpus room read through the owner's real caller; `plantCard` edits its user message to carry a card. */
async function archiveRoom(root: Awaited<ReturnType<typeof createCorpusHarness>>, chatId: TrpcWireOutput<"chat.getChat">["id"]): Promise<ArchiveRoom> {
  const caller = await root.internalCallerFor(root.ownerId);
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  const detail = await caller.chat.getChat({ chatId });
  return {
    chatId: detail.id,
    reads: { "sessions.me": () => viewer, "settings.getUserSettings": () => settings, "chat.getChat": () => detail },
    messages: () => caller.chat.listMessages({ chatId: detail.id }),
    plantCard: async (): Promise<void> => {
      const user = (await caller.chat.listMessages({ chatId: detail.id })).messages.find((row) => row.role === "user");
      if (user === undefined) {
        throw new Error("Committed corpus chat omitted its user message");
      }
      await caller.chat.editMessage({ chatId: detail.id, messageId: user.id, content: CARD_FENCE, timeZone: UTC_TIME_ZONE });
    },
  };
}

function corpusChatId(corpus: CorpusWire): TrpcWireOutput<"chat.getChat">["id"] {
  const chat = corpus.reads["chat.getChat"][0]?.output;
  if (chat === undefined) {
    throw new Error("Committed corpus omitted a chat");
  }
  return chat.id;
}

test("a failed archive read renders the shared error state directly under the section, and Retry recovers it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  await room.plantCard();
  const settled = await room.messages();
  let failing = true;
  await routeTrpc(page, {
    ...room.reads,
    "chat.listMessages": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : settled),
  });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  const error = archive.locator(':scope > [data-slot="query-error"]');
  await expect(error.getByRole("status")).toHaveText("Couldn't load the card archive.");
  await expect(archive.getByText("Cards", { exact: true })).toHaveCount(0);

  failing = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
  await expect(archive.locator('[data-slot="query-error"]')).toHaveCount(0);
});

test("a pending archive read shows the labelled skeleton, then the settled card list with its count", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  await room.plantCard();
  const messages = trpcHold<"chat.listMessages">();
  await routeTrpc(page, { ...room.reads, "chat.listMessages": messages });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await messages.requested;
  const archive = page.locator(ARCHIVE);
  await expect(archive.getByText("Cards", { exact: true })).toBeVisible();
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();

  messages.release(await room.messages());
  await expect(archive.getByText("Cards — 1", { exact: true })).toBeVisible();
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
  await expect(archive.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("a later archive read holds the box this device saw the archive settle at", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  await room.plantCard();
  const settled = await room.messages();
  let pending: ReturnType<typeof trpcHold<"chat.listMessages">> | null = null;
  await routeTrpc(page, { ...room.reads, "chat.listMessages": () => pending ?? settled });
  const archive = page.locator(ARCHIVE);
  const height = async (): Promise<number> => (await archive.boundingBox())?.height ?? Number.NaN;

  const first = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await expect(archive.getByText("Cards — 1", { exact: true })).toBeVisible();
  const settledHeight = await height();
  await first.unmount();

  const later = trpcHold<"chat.listMessages">();
  pending = later;
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await later.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  expect(await height()).toBeCloseTo(settledHeight, 0);

  later.release(settled);
  await expect(archive.getByText("Cards — 1", { exact: true })).toBeVisible();
  expect(await height()).toBeCloseTo(settledHeight, 0);
});

test("an archive with no cards yet renders the empty doorway under its label", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  const settled = await room.messages();
  await routeTrpc(page, { ...room.reads, "chat.listMessages": () => settled });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  await expect(archive.getByText("Cards", { exact: true })).toBeVisible();
  await expect(archive.getByText("No cards yet", { exact: false })).toBeVisible();
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toHaveCount(0);
});
