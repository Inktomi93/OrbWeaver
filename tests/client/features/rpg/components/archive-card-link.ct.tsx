// A link in the card archive's card opens only through the shared confirm: the real archive (`RpgSceneCards`) over a
// corpus room whose latest reply is one `:::card` with a link, its card-frame mint and serve answered by the corpus
// root's own HTTP entry.
import { CARD_FRAME_ROUTE, rendersTrustedHtml } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import { FRAMED_LINK_CONFIRM_LABEL } from "#client/components/framed-link-names.ts";
import type { RpgSceneCardsStory } from "./_scene-cards-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const STORY = "tests/client/features/rpg/components/_scene-cards-stories/RpgSceneCardsStory";
const ARCHIVE_ROW = '[data-slot="rpg-card-row"]';
const ROUTED_CARD = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const VIEWER_PASSWORD = "archive-card-link-viewer-password";
const LINK_URL = "https://example.test/tide-tables";
const EXTERNAL_PAGES = "https://*.test/**";
const CARD = `:::card title="Tide tables"\n<p>High water at dusk.</p><a id="tide-link" href="${LINK_URL}">Full tables</a>\n:::`;
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

test("a link in the archive's card opens nothing until the confirm, and Open opens exactly its address", async ({ corpus, mount, page }) => {
  const room = await openCardRoom();
  await using root = room.root;
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, ARCHIVE_READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const sent = await request.allHeaders();
    const headers: Record<string, string> = { cookie, forwarded: "" };
    for (const name of [CSRF_HEADER, "content-type"]) {
      const value = sent[name.toLowerCase()];
      if (value !== undefined) {
        headers[name] = value;
      }
    }
    const body = request.postData();
    const response = await root.http.request(new URL(request.url()).pathname, { method: request.method(), headers, ...(body === null ? {} : { body }) });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
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
