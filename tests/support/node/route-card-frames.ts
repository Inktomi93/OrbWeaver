// The page's card-frame mint and serve, answered by a real root's HTTP door under one viewer's session cookie. A frame
// case adds only its levers: handles the server has dropped, serves that answer an error status, and gates that hold
// mints or serves until the case releases them.

import type { CardFrameMintResponse } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { Page } from "@playwright/test";
import type { ServerTestHarness } from "./server.ts";

// A well-formed handle no mint ever produced: its serve is the server's own miss notice.
const UNKNOWN_HANDLE = "0".repeat(32);
// The request headers the root reads besides the session cookie.
const FORWARDED_HEADERS = [CSRF_HEADER, "content-type"] as const;

export interface CardFrameServing {
  /** The handles the first this many mints return are dropped: every serve of one gets the server's real miss notice. */
  readonly droppedMints?: number;
  /** Every serve answers this status with no body instead of reaching the root. */
  readonly serveStatus?: number;
  /** Every mint is answered only once this settles. */
  readonly mintsWait?: Promise<void>;
  /** Every serve is answered only once this settles, so a routed frame cannot draw until then. */
  readonly servesWait?: Promise<void>;
}

/** One mint the page sent: whether it asked for the forming cap, and what the root granted (absent when it refused). */
export interface CardFrameMintRecord {
  readonly forming: boolean;
  readonly granted: CardFrameMintResponse["granted"] | undefined;
}

/** How many mints and serves the page has sent so far, how many serves asked for a dropped handle, and each mint. */
export interface CardFrameTraffic {
  readonly mints: number;
  readonly serves: number;
  readonly misses: number;
  readonly minted: readonly CardFrameMintRecord[];
}

function forwardedHeaders(sent: Readonly<Record<string, string>>, cookie: string): Record<string, string> {
  const headers: Record<string, string> = { cookie, forwarded: "" };
  for (const name of FORWARDED_HEADERS) {
    const value = sent[name.toLowerCase()];
    if (value !== undefined) {
      headers[name] = value;
    }
  }
  return headers;
}

type CardFrameRoute = Parameters<Parameters<Page["route"]>[1]>[0];

// The root's own answer to the request at `path`, not yet sent to the page.
async function rootAnswer(
  route: CardFrameRoute,
  root: ServerTestHarness,
  cookie: string,
  path: string,
): Promise<Parameters<CardFrameRoute["fulfill"]>[0] & { readonly body: Buffer }> {
  const request = route.request();
  const body = request.postData();
  const headers = forwardedHeaders(await request.allHeaders(), cookie);
  const response = await root.http.request(path, { method: request.method(), headers, ...(body === null ? {} : { body }) });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) };
}

// What one mint asked for and what the root answered: its record, and the handle's address when the root minted one.
function readMint(
  sentBody: string | null,
  answer: { readonly status?: number; readonly body: Buffer },
): { readonly record: CardFrameMintRecord; readonly url: string | undefined } {
  const sent = cardFrameMintRequestSchema.parse(JSON.parse(sentBody ?? ""));
  const response = answer.status === 200 ? cardFrameMintResponseSchema.parse(JSON.parse(answer.body.toString("utf8"))) : undefined;
  return { record: { forming: sent.forming === true, granted: response?.granted }, url: response?.url };
}

/** Answer every card-frame request the page sends from `root`, as the viewer whose session `cookie` carries. */
export async function routeCardFrames(page: Page, root: ServerTestHarness, cookie: string, serving: CardFrameServing = {}): Promise<CardFrameTraffic> {
  const counts = { mints: 0, serves: 0, misses: 0 };
  const minted: CardFrameMintRecord[] = [];
  const dropped = new Set<string>();
  await page.route(`**${CARD_FRAME_ROUTE}**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      await serving.mintsWait;
      counts.mints += 1;
      const answer = await rootAnswer(route, root, cookie, pathname);
      const { record, url } = readMint(request.postData(), answer);
      minted.push(record);
      // Dropped before the page holds the handle, so its first serve already misses.
      if (url !== undefined && counts.mints <= (serving.droppedMints ?? 0)) {
        dropped.add(new URL(url, request.url()).pathname);
      }
      await route.fulfill(answer);
      return;
    }
    await serving.servesWait;
    counts.serves += 1;
    if (serving.serveStatus !== undefined) {
      await route.fulfill({ status: serving.serveStatus, body: "" });
      return;
    }
    const missed = dropped.has(pathname);
    counts.misses += missed ? 1 : 0;
    await route.fulfill(await rootAnswer(route, root, cookie, missed ? `${CARD_FRAME_ROUTE}/${UNKNOWN_HANDLE}` : pathname));
  });
  return {
    get mints(): number {
      return counts.mints;
    },
    get serves(): number {
      return counts.serves;
    },
    get misses(): number {
      return counts.misses;
    },
    get minted(): readonly CardFrameMintRecord[] {
      return minted;
    },
  };
}
