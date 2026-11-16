// The card archive's card frames as the transcript's does: the real archive (`RpgSceneCards`) over a corpus room whose
// latest reply is one `:::card` with a link, its card-frame mint and serve answered by the corpus root's own HTTP entry.
// A forming chip holds the card until its routed frame draws, and a link opens only through the shared confirm.
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameServing } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { FRAMED_LINK_CONFIRM_LABEL } from "#client/components/framed-link-names.ts";
import type { RpgSceneCardsStory } from "./_scene-cards-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/rpg/components/_scene-cards-stories/RpgSceneCardsStory";
const ARCHIVE_ROW = '[data-slot="rpg-card-row"]';
const ROUTED_CARD = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const FORMING_CHIP = '[data-slot="forming-card-chip"]';
const VIEWER_PASSWORD = "archive-card-link-viewer-password";
const LINK_URL = "https://example.test/tide-tables";
const EXTERNAL_PAGES = "https://*.test/**";
const CARD = `:::card title="Tide tables"\n<p id="tide-line">High water at dusk.</p><a id="tide-link" href="${LINK_URL}">Full tables</a>\n:::`;
const ARCHIVE_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings"] as const;

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to carry the card. */
async function openCardRoom(): Promise<{ readonly root: Root; readonly chatId: ChatId }> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness());
  const caller = await root.internalCallerFor(root.ownerId);
  for (const row of (await caller.chat.listChats({ limit: 100 })).items) {
    const detail = await caller.chat.getChat({ chatId: row.id });
    const trusted = new Set(
      detail.participants.flatMap((seat) =>
        seat.characterId !== null && seat.renderPolicy !== undefined && rendersTrustedHtml(seat.renderPolicy.htmlTrust) ? [seat.characterId] : [],
      ),
    );
    const { messages } = await caller.chat.listMessages({ chatId: row.id });
    const reply = messages.findLast((message) => message.role === "assistant" && message.characterId !== null && trusted.has(message.characterId));
    if (reply !== undefined) {
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content: CARD, timeZone: UTC_TIME_ZONE });
      construction.move();
      return { root, chatId: row.id };
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

/** The archive's reads, and its card-frame traffic answered by the root under the viewer's session. */
async function serveArchive(
  page: Page,
  root: Root,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
  serving: CardFrameServing = {},
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, ARCHIVE_READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  await routeCardFrames(page, root, cookie, serving);
}

test("the archive's card shows a forming chip until its routed frame draws", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  const { promise: servesWait, resolve: releaseServes } = Promise.withResolvers<void>();
  await using held = new AsyncDisposableStack();
  // Disposal runs last-in first: the held serve is released before the routes drain, or the drain waits on it forever.
  held.defer(async () => {
    await page.unrouteAll({ behavior: "wait" });
  });
  held.defer(releaseServes);
  await serveArchive(page, root, corpus, { servesWait });
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  const dialog = page.getByRole("dialog");
  // The mint has answered and its document is held: the chip stands in, and the routed frame waits undrawn.
  await expect(dialog.locator(ROUTED_CARD)).toHaveCount(1);
  await expect(dialog.locator(FORMING_CHIP)).toBeVisible();
  await expect(dialog.locator(`${ROUTED_CARD}[data-drawn]`)).toHaveCount(0);
  releaseServes();
  await expect(dialog.frameLocator(ROUTED_CARD).locator("#tide-line")).toHaveText("High water at dusk.");
  await expect(dialog.locator(FORMING_CHIP)).toHaveCount(0);
});

test("a link in the archive's card opens nothing until the confirm, and Open opens exactly its address", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  await serveArchive(page, root, corpus);
  const requested: string[] = [];
  const popups: string[] = [];
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  page.context().on("page", (popup) => popups.push(popup.url()));
  await mount<typeof RpgSceneCardsStory>(STORY, { chatId: room.chatId });
  await page.locator(ARCHIVE_ROW).first().click();
  await page.getByRole("dialog").frameLocator(ROUTED_CARD).locator("#tide-link").click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(LINK_URL);
  expect({ requested, popups }).toEqual({ requested: [], popups: [] });
  await confirm.getByRole("button", { name: FRAMED_LINK_CONFIRM_LABEL, exact: true }).click();
  await expect.poll(() => [...requested]).toEqual([LINK_URL]);
  await page.unrouteAll({ behavior: "wait" });
});
