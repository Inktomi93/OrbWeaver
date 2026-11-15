// The Playwright route that sends a page's request to a real server's HTTP door and hands back its answer, so only the
// transport between the browser and the server is the spec's own.

import type { Page } from "@playwright/test";
import type { ServerTestHarness } from "./server.ts";

/** What a routed path reports back to the spec. */
export interface ServerRoute {
  /** How many requests the page has sent to the path. */
  readonly sent: () => number;
  /** Resolves once the page has received the server's answer to its next request to the path. The route answers only after the server's
   *  work has run, so a long job is awaited here on its own deadline, not by an assertion's default budget. Start it before the action that
   *  sends the request and await it after, so the answer is not missed. A request that never gets an answer fails at `timeout`. */
  readonly answered: (timeout: number) => Promise<void>;
}

/** Serve every request the page sends to `path` from `root`. */
export async function routeToServer(page: Page, root: ServerTestHarness, path: string): Promise<ServerRoute> {
  let sent = 0;
  await page.route(`**${path}`, async (route) => {
    sent += 1;
    const incoming = route.request();
    const upload = incoming.postDataBuffer();
    const answer = await root.http.request(
      new Request(`http://127.0.0.1${path}`, { method: incoming.method(), headers: incoming.headers(), body: upload === null ? null : new Uint8Array(upload) }),
    );
    await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body: Buffer.from(await answer.arrayBuffer()) });
  });
  return {
    sent: (): number => sent,
    answered: async (timeout): Promise<void> => {
      await page.waitForResponse((response) => new URL(response.url()).pathname === path, { timeout });
    },
  };
}
