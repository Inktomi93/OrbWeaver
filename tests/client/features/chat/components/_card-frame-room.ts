// A corpus room whose latest reply is one card, its card-frame mint and serve answered by the corpus root's own HTTP
// entry, for the cases that drive a routed card's links through the real transcript.
import { CARD_FRAME_ROUTE, rendersTrustedHtml } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { captureCookieAuth, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const VIEWER_PASSWORD = "card-frame-room-viewer-password";
const EXTERNAL_PAGES = "https://*.test/**";
const TRANSCRIPT_READS = [...ROOM_PROCEDURES, "sessions.me", "settings.getUserSettings", "plugin.list", "plugin.listSurfaces", "regex.listScripts"] as const;

/** `static` runs only the pinned frame script; `interactive` runs the card's own scripts too. */
export type CardPosture = "static" | "interactive";

export interface CardRoom {
  readonly root: Root;
  readonly chatId: ChatId;
}

/** A corpus room whose latest reply is spoken by a character that renders trusted HTML, rewritten to `content`, with
 *  that character set to `posture`. */
export async function openCardRoom(content: string, posture: CardPosture): Promise<CardRoom> {
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
    if (reply !== undefined && reply.characterId !== null) {
      await caller.character.update({ characterId: reply.characterId, input: { trustHtml: true, interactiveHtml: posture === "interactive" } });
      await caller.chat.editMessage({ chatId: row.id, messageId: reply.id, content, timeZone: UTC_TIME_ZONE });
      construction.move();
      return { root, chatId: row.id };
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

/** The room's reads, and its card-frame mint and serve answered by the root's own HTTP entry under the viewer's session. */
export async function serveCardRoom(
  page: Page,
  root: Root,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
): Promise<AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
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
  return {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}

/** Every external page requested in the context, a popup's included; they land here instead of the network. */
export async function recordExternalPages(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  return requested;
}
