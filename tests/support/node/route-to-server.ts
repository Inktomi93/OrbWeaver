// The Playwright route that sends a page's request to a real server's HTTP door and hands back its answer, so only the
// transport between the browser and the server is the spec's own.

import type { Page } from "@playwright/test";
import type { ServerTestHarness } from "./server.ts";

/** Serve every request the page sends to `path` from `root`; returns how many it sent. */
export async function routeToServer(page: Page, root: ServerTestHarness, path: string): Promise<() => number> {
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
  return (): number => sent;
}
