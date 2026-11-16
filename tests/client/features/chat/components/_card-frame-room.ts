// A corpus room whose latest reply is one card, its card-frame mint and serve answered by the corpus root's own HTTP
// entry, for the cases that drive a routed card through the real transcript.
import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { CardFrameServing, CardFrameTraffic } from "@orb/testkit/ct";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
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
  readonly characterId: CharacterId;
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
      return { root, chatId: row.id, characterId: reply.characterId };
    }
  }
  throw new Error("No corpus room has a reply from a character that renders trusted HTML");
}

/** The room's reads, and its card-frame traffic answered by the root under the viewer's session. Declare it with
 *  `await using` after the root: disposal removes the routes and waits for a handler still answering, so no request
 *  the page makes after the case ends reaches a closed root. */
export async function serveCardRoom(
  page: Page,
  root: Root,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
  serving: CardFrameServing = {},
): Promise<CardFrameTraffic & AsyncDisposable> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, TRANSCRIPT_READS));
  const { cookie } = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const traffic = await routeCardFrames(page, root, cookie, serving);
  return Object.assign(traffic, {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await page.unrouteAll({ behavior: "wait" });
    },
  });
}

export interface ExternalTraffic {
  /** Every external address requested: a popup's page, or a frame that navigated itself. */
  readonly requested: string[];
  /** Every page the context opened. */
  readonly popups: string[];
}

/** External requests land here instead of the network; a page `window.open` would open is counted. */
export async function recordExternal(page: Page): Promise<ExternalTraffic> {
  const traffic: ExternalTraffic = { requested: [], popups: [] };
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    traffic.requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  page.context().on("page", (popup) => traffic.popups.push(popup.url()));
  return traffic;
}
