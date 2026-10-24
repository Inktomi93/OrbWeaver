// The Scene tab's card archive: its loading, error, empty and populated states, with the error arm rendered as
// the shared recoverable error state directly under the section root. Reads come from a real corpus root.
import type { ChatId } from "@orb/kit/ids";
import { createTimeLib, UTC_TIME_ZONE } from "@orb/kit/time";
import type { TrpcRoutes, TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusWire } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { RpgSceneCardsStory } from "./_scene-cards-stories.tsx";

const STORY = "tests/client/features/rpg/components/_scene-cards-stories/RpgSceneCardsStory";
const ARCHIVE = '[data-slot="rpg-card-archive"]';
const PHONE_WIDTH = 430;
const CARD_TITLE = "The harbour ledger";
const FOCUSED_STATUS_KEY = "__focusedStatusText";
const CARD_FENCE = `:::card title="${CARD_TITLE}"\n<p>Tide tables for the quay.</p>\n:::`;

interface ArchiveRoom {
  readonly chatId: ChatId;
  readonly detail: TrpcWireOutput<"chat.getChat">;
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
    detail,
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
  await expect(error.getByRole("status")).toHaveText("Couldn't load this game's cards.");
  await expect(archive.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(archive).not.toHaveRole("region");

  failing = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
  await expect(archive.locator('[data-slot="query-error"]')).toHaveCount(0);
});

test("Retry on a failed archive read keeps keyboard focus inside the archive and announces the pending read", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  await room.plantCard();
  const settled = await room.messages();
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await archiveRoom(root, (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id);
  const retried = trpcHold<"chat.listMessages">();
  const otherRead = trpcHold<"chat.listMessages">();
  let failing = true;
  await routeTrpc(page, {
    ...room.reads,
    "chat.getChat": (input) => (input.chatId === other.chatId ? other.detail : room.detail),
    "chat.listMessages": (input) => {
      if (input.chatId === other.chatId) {
        return otherRead;
      }
      return failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : retried;
    },
  });
  const component = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  const retry = archive.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();

  failing = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await retried.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  await expect(archive.getByRole("status")).toHaveText(/\S/);

  retried.release(settled);
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
  await expect(archive.locator('[data-slot="rpg-card-row"]')).toBeFocused();

  // A later, unrelated suspend under the same boundary is not a retried read and announces nothing.
  await component.update({ chatId: other.chatId });
  await otherRead.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  await expect(archive.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(0);
});

test("Retry that settles on an empty archive lands focus on the announced recovery", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  const settled = await room.messages();
  let failing = true;
  await routeTrpc(page, {
    ...room.reads,
    "chat.listMessages": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : settled),
  });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  const retry = archive.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();

  // Record what the status says at the moment it takes focus: that is what a screen reader reads out.
  await page.evaluate((key) => {
    document.addEventListener("focusin", (event) => {
      if (event.target instanceof HTMLElement && event.target.matches('[role="status"]')) {
        Reflect.set(globalThis, key, event.target.textContent);
      }
    });
  }, FOCUSED_STATUS_KEY);

  failing = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(archive.getByText("No cards yet", { exact: false })).toBeVisible();
  const focused = archive.locator(":focus");
  await expect(focused).toHaveRole("status");
  await expect(focused).toHaveAccessibleName(/\S/);
  await expect(archive.getByRole("status").filter({ hasText: /\S/ })).toHaveCount(1);
  const settledText = await focused.textContent();
  expect(await page.evaluate((key) => Reflect.get(globalThis, key), FOCUSED_STATUS_KEY)).toBe(settledText);
});

// Where focus sits once the empty archive has settled: the recovery status, or the page after a click on blank space.
const FOCUS_HOLDS = [
  { name: "stays on the recovery status", leave: null, holder: "status" },
  { name: "moves to the page", leave: async (archive: Locator): Promise<void> => archive.click({ position: { x: 1, y: 1 } }), holder: "body" },
] as const;

for (const hold of FOCUS_HOLDS) {
  test(`a card that lands after an empty Retry settles leaves focus where it is when focus ${hold.name}`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const room = await archiveRoom(root, corpusChatId(corpus));
    let messages = await room.messages();
    let failing = true;
    await routeTrpc(page, {
      ...room.reads,
      "chat.listMessages": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : messages),
    });
    const component = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
    const archive = page.locator(ARCHIVE);
    const retry = archive.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();

    failing = false;
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(archive.getByText("No cards yet", { exact: false })).toBeVisible();
    await expect(archive.locator(":focus")).toHaveRole("status");
    await hold.leave?.(archive);
    const holder = (): Promise<string | null> =>
      page.evaluate(() => (document.activeElement === document.body ? "body" : (document.activeElement?.getAttribute("role") ?? null)));
    expect(await holder()).toBe(hold.holder);

    // A refetch in place, as a bus invalidation does: the card row mounts without the archive suspending.
    await room.plantCard();
    messages = await room.messages();
    await component.update({ chatId: room.chatId, revision: 1 });
    await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
    expect(await holder()).toBe(hold.holder);
  });
}

test("a retried read's pending box is the first load's pending box", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  await room.plantCard();
  const firstLoad = trpcHold<"chat.listMessages">();
  const retried = trpcHold<"chat.listMessages">();
  let pending = firstLoad;
  await routeTrpc(page, { ...room.reads, "chat.listMessages": () => pending });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  const height = async (): Promise<number> => (await archive.boundingBox())?.height ?? Number.NaN;
  await firstLoad.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  const firstPending = await height();

  firstLoad.release(trpcError({ code: "INTERNAL_SERVER_ERROR" }));
  const retry = archive.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  pending = retried;
  await retry.click();
  await retried.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  expect(await height()).toBeCloseTo(firstPending, 0);
  retried.release(await room.messages());
  await expect(archive.getByRole("button", { name: CARD_TITLE, exact: false })).toBeVisible();
});

test("a Retry that fails again hands keyboard focus to the new Retry button", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const room = await archiveRoom(root, corpusChatId(corpus));
  const retried = trpcHold<"chat.listMessages">();
  let failing = true;
  await routeTrpc(page, {
    ...room.reads,
    "chat.listMessages": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : retried),
  });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  const archive = page.locator(ARCHIVE);
  const retry = archive.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();

  failing = false;
  await retry.focus();
  await page.keyboard.press("Enter");
  await retried.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();

  retried.release(trpcError({ code: "INTERNAL_SERVER_ERROR" }));
  await expect(archive.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(retry).toBeFocused();
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
  await expect(archive.getByText("1 total", { exact: true })).toBeVisible();
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
  await expect(archive.getByText("1 total", { exact: true })).toBeVisible();
  const settledHeight = await height();
  await first.unmount();

  const later = trpcHold<"chat.listMessages">();
  pending = later;
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await later.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  expect(await height()).toBeCloseTo(settledHeight, 0);

  later.release(settled);
  await expect(archive.getByText("1 total", { exact: true })).toBeVisible();
  expect(await height()).toBeCloseTo(settledHeight, 0);
});

test("each chat reserves its own settled box and never another chat's", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const withCard = await archiveRoom(root, corpusChatId(corpus));
  await withCard.plantCard();
  const caller = await root.internalCallerFor(root.ownerId);
  const empty = await archiveRoom(root, (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat.id);
  const cardPage = await withCard.messages();
  const emptyPage = await empty.messages();
  let pending: ReturnType<typeof trpcHold<"chat.listMessages">> | null = null;
  await routeTrpc(page, {
    ...withCard.reads,
    "chat.getChat": (input) => (input.chatId === empty.chatId ? empty.detail : withCard.detail),
    "chat.listMessages": (input) => pending ?? (input.chatId === empty.chatId ? emptyPage : cardPage),
  });
  const archive = page.locator(ARCHIVE);
  const height = async (): Promise<number> => (await archive.boundingBox())?.height ?? Number.NaN;
  // The reservation's own sentinel attribute: present only while a remembered box holds the fallback.
  const reserved = archive.locator("[data-tile-reserved]");

  const cardMount = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: withCard.chatId });
  await expect(archive.getByText("1 total", { exact: true })).toBeVisible();
  const cardHeight = await height();
  await cardMount.unmount();

  const firstVisit = trpcHold<"chat.listMessages">();
  pending = firstVisit;
  const emptyMount = await mount<typeof RpgSceneCardsStory>(STORY, { chatId: empty.chatId });
  await firstVisit.requested;
  await expect(archive.locator('[aria-busy="true"]')).toBeVisible();
  await expect(reserved).toHaveCount(0);
  expect(await height()).not.toBeCloseTo(cardHeight, 0);
  pending = null;
  firstVisit.release(emptyPage);
  await expect(archive.getByText("No cards yet", { exact: false })).toBeVisible();
  const emptyHeight = await height();
  expect(emptyHeight).not.toBeCloseTo(cardHeight, 0);
  await emptyMount.unmount();

  const revisit = trpcHold<"chat.listMessages">();
  pending = revisit;
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: empty.chatId });
  await revisit.requested;
  await expect(reserved).toHaveCount(1);
  expect(await height()).toBeCloseTo(emptyHeight, 0);
  revisit.release(emptyPage);
  await expect(archive.getByText("No cards yet", { exact: false })).toBeVisible();
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

test.describe("at phone width with a coarse pointer", () => {
  test.use({ viewport: { width: PHONE_WIDTH, height: 900 }, hasTouch: true, isMobile: true });

  test("the archive is a heading, not a region, and its card row is a touch-sized control stamped with an older turn's day and time", async ({
    corpus,
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    const room = await archiveRoom(root, corpusChatId(corpus));
    await room.plantCard();
    const settled = await room.messages();
    const origin = settled.messages.find((message) => message.role === "user");
    if (origin === undefined) {
      throw new Error("Committed corpus chat omitted its user message");
    }
    await routeTrpc(page, { ...room.reads, "chat.listMessages": () => settled });
    await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
    const archive = page.locator(ARCHIVE);
    const row = archive.locator('[data-slot="rpg-card-row"]');
    await expect(row).toBeVisible();

    await expect(archive.getByRole("heading", { level: 3 })).toHaveCount(1);
    await expect(archive).not.toHaveRole("region");
    const kit = createTimeLib({ timeZone: UTC_TIME_ZONE });
    const stamp = `${kit.formatMonthDay(origin.createdAt)}, ${kit.formatTime(origin.createdAt)}`;
    const chip = row.locator('time[data-slot="rpg-turn-ref"]');
    await expect(chip).toHaveText(stamp);
    await expect(chip).toHaveAttribute("datetime", new Date(origin.createdAt).toISOString());
    await expect(chip).toHaveAttribute("title", `Told ${kit.formatDateTime(origin.createdAt)}`);
    // The row's name carries the stamp, so two cards from one earlier day differ to a screen reader too.
    await expect(row).toHaveAccessibleName(`Open card: ${CARD_TITLE}, ${stamp}`);

    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const touchTarget = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.blockSize = "var(--spacing-touch-target)";
      document.body.append(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      return height;
    });
    const box = await row.boundingBox();
    expect(box?.height ?? Number.NaN).toBeGreaterThanOrEqual(touchTarget);
  });

  test("a card from today carries the transcript's time-only stamp in its chip", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const room = await archiveRoom(root, corpusChatId(corpus));
    await room.plantCard();
    const settled = await room.messages();
    const origin = settled.messages.find((message) => message.role === "user");
    if (origin === undefined) {
      throw new Error("Committed corpus chat omitted its user message");
    }
    // The page's clock reads the origin instant, so the origin message is from "today" before the chip renders.
    await page.clock.setFixedTime(origin.createdAt);
    await routeTrpc(page, { ...room.reads, "chat.listMessages": () => settled });
    await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
    const chip = page.locator(ARCHIVE).locator('time[data-slot="rpg-turn-ref"]');
    await expect(chip).toHaveText(createTimeLib({ timeZone: UTC_TIME_ZONE }).formatTime(origin.createdAt));
  });
});
