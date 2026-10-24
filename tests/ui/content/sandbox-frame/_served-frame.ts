// Real responses for the sandbox-frame cases: the card document comes from the production mint and serve routes, and the
// embedding app policy from the production security headers, both through the composed HTTP app.
import type { CardFrameMintResponse } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { test as corpusTest } from "@orb/testkit/ct-corpus";
import type { createCorpusHarness } from "@orb/testkit/node/composed";
import { captureCookieAuth, createCorpusHarness as openCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

const VIEWER_PASSWORD = "sandbox-frame-viewer-password";
const CSP_HEADER = "content-security-policy";

export interface ServedFrame {
  readonly url: string;
  readonly granted: CardFrameMintResponse["granted"];
  /** The card document's own `Content-Security-Policy`, exactly as the route sent it. */
  readonly csp: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface FrameRoom {
  /** Mint a card for the room's character and read back what the serve route answers with. */
  readonly serve: (html: string, characterId?: CharacterId | null, themeTokens?: Readonly<Record<string, string>>) => Promise<ServedFrame>;
  /** The policy the app document is served under: what any page embedding a card frame carries. */
  readonly appPolicy: () => Promise<string>;
}

async function openFrameRoom(root: Root, chatId: ChatId, defaultCharacterId: CharacterId): Promise<FrameRoom> {
  const admitted = await captureCookieAuth(root, await root.principalFor(root.ownerId), VIEWER_PASSWORD);
  const headers = { cookie: admitted.cookie, [CSRF_HEADER]: "1", "content-type": "application/json", forwarded: "" };
  return {
    serve: async (html, characterId = defaultCharacterId, themeTokens = {}): Promise<ServedFrame> => {
      const minted = await root.http.request(CARD_FRAME_ROUTE, { method: "POST", headers, body: JSON.stringify({ chatId, characterId, html, themeTokens }) });
      if (minted.status !== 200) {
        throw new Error(`the card-frame mint refused with ${String(minted.status)}`);
      }
      const mint = cardFrameMintResponseSchema.parse(await minted.json());
      const served = await root.http.request(mint.url, { headers });
      const policy = served.headers.get(CSP_HEADER);
      if (policy === null) {
        throw new Error("the card-frame serve route sent no Content-Security-Policy");
      }
      return {
        url: mint.url,
        granted: mint.granted,
        csp: policy,
        status: served.status,
        headers: Object.fromEntries(served.headers),
        body: await served.text(),
      };
    },
    appPolicy: async (): Promise<string> => {
      const response = await root.http.request("/api/auth/config", { headers });
      await response.arrayBuffer();
      const policy = response.headers.get(CSP_HEADER);
      if (policy === null) {
        throw new Error("the app document carries no Content-Security-Policy");
      }
      return policy;
    },
  };
}

/** Answer the frame's URL with the recorded real response, so the browser enforces the bytes the server sent. */
export async function routeServedFrame(page: Page, frame: ServedFrame): Promise<void> {
  await page.route(`**${frame.url}`, async (route) => {
    await route.fulfill({ status: frame.status, headers: frame.headers, body: frame.body });
  });
}

/** The corpus test with a `room` fixture: a real root, its chat, and the card-frame routes over it. */
export const test = corpusTest.extend<{ room: FrameRoom }>({
  room: async ({ corpus }, use) => {
    await using root = await openCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const chat = corpus.reads["chat.getChat"][0]?.output;
    if (chat === undefined) {
      throw new Error("Committed corpus omitted a chat");
    }
    const detail = await caller.chat.getChat({ chatId: chat.id });
    const seat = detail.participants.find((participant) => participant.characterId !== null);
    if (seat?.characterId === null || seat === undefined) {
      throw new Error("Committed corpus chat seats no character");
    }
    await use(await openFrameRoom(root, detail.id, seat.characterId));
  },
});
