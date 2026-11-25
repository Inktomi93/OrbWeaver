// Resource-hint links a card or a plugin authored open no connection from its frame. The embedding page carries the
// policy the production security headers serve and each frame the document the production serve route sends, so a
// connection would be the browser acting on served bytes. A planted TCP listener counts connections, because a
// preconnect opens a socket and sends no request a route could see. Each absence sits beside a control: the same
// markup in a page with no policy reaches the listener in this engine. The markup carries every link spelling and a
// nested srcdoc frame whose escaped link the browser decodes into a live one.
// Engines: the default CT project (Chromium), `pnpm test:ct:webkit` and `pnpm test:ct:firefox`. Only WebKit can turn
// a frame row red: Chromium and Firefox open nothing from a frame for these hints even with the hold removed, so on
// those two engines the frame rows are no-leak controls, not proofs of the hold.
import { spawn } from "node:child_process";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { PLUGIN_FRAME_ROUTE, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginFrameMintResponseSchema, pluginManifestSchema } from "@orb/contracts/plugin";
import { CARD_FRAME_SANDBOX } from "@orb/kit/card-frame";
import { expect } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { SandboxFrameStory } from "./_frame-stories.tsx";
import type { ServedFrame } from "./_served-frame.ts";
import { routeServedFrame, test } from "./_served-frame.ts";

const PARENT_URL = "/__resource-hints-parent";
const CONTROL_URL = "/__resource-hints-control";
const BARRIER_URL = "/__resource-hints-barrier";
const CSP_HEADER = "content-security-policy";
const MARKER = "hint-card";
const MARKER_TEXT = "Tide table";
const FRAME_SURFACE_ID = "hints";
const PLUGIN_VIEWER_PASSWORD = "resource-hints-viewer-password";
const FLOOR_STORY = "tests/ui/content/sandbox-frame/_frame-stories/SandboxFrameStory";
const FRAME = '[data-slot="sandbox-frame"]';

interface PlantedListener extends AsyncDisposable {
  readonly origin: string;
  /** Sockets the listener has accepted so far. */
  readonly connections: () => number;
}

/** A listener on a loopback port no page names but the markup below, answering any request it reads with 204. */
async function plantListener(): Promise<PlantedListener> {
  let accepted = 0;
  const open = new Set<Socket>();
  const server: Server = createServer((socket) => {
    accepted += 1;
    open.add(socket);
    socket.on("close", () => open.delete(socket));
    socket.on("error", () => undefined);
    socket.once("data", () => {
      socket.end("HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the planted listener has no port");
  }
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    connections: (): number => accepted,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      // A preconnected socket stays open idle, and `close` waits on every open socket.
      for (const socket of open) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}

/** Every resource hint a frame could author toward `origin`, in the spellings the tokenizer reads as a link tag, and in
 *  a nested srcdoc document under both entity spellings. */
function hintMarkup(origin: string): string {
  return [
    `<p id="${MARKER}">${MARKER_TEXT}</p>`,
    `<iframe srcdoc="&lt;link rel=preconnect href=${origin}&gt;"></iframe>`,
    `<iframe srcdoc="&#60;link rel=preconnect href=${origin}&#62;"></iframe>`,
    `<link rel="preconnect" href="${origin}">`,
    `<LINK rel=dns-prefetch href="${origin}">`,
    `<link/rel=prefetch/href="${origin}/prefetch">`,
    `<link rel="preload" as="image" href="${origin}/preload.png">`,
    `<link rel="preload" as="fetch" crossorigin href="${origin}/preload">`,
  ].join("");
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** Anything the frame's parse queued has been handed to the network: the barrier request is ordered after it. */
async function settleNetwork(page: Page): Promise<void> {
  await settle(page);
  await page.evaluate(async (url: string) => {
    await fetch(url).catch(() => undefined);
  }, BARRIER_URL);
  await settle(page);
}

/** Embed `served` under `parentPolicy`, the way the app embeds a routed frame, and wait until the frame has drawn. */
async function embed(page: Page, served: Pick<ServedFrame, "url" | "status" | "headers" | "body">, parentPolicy: string): Promise<void> {
  await routeServedFrame(page, served);
  await page.route(`**${PARENT_URL}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", [CSP_HEADER]: parentPolicy },
      body: `<!doctype html><html><body><iframe id="frame" sandbox="${CARD_FRAME_SANDBOX.document}" src="${served.url}" style="width:300px;height:200px"></iframe></body></html>`,
    });
  });
  await page.route(`**${BARRIER_URL}*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  await page.goto(PARENT_URL);
  await expect(page.frameLocator("#frame").locator(`#${MARKER}`)).toHaveText(MARKER_TEXT);
  await settleNetwork(page);
}

test("control: the hint markup in a page with no policy reaches the planted listener in this engine", async ({ page }) => {
  await using listener = await plantListener();
  await page.route(`**${CONTROL_URL}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><body>${hintMarkup(listener.origin)}</body></html>` });
  });
  await page.goto(CONTROL_URL);
  await expect.poll(() => listener.connections()).toBeGreaterThan(0);
});

for (const [posture, characterId] of [
  ["static", null],
  ["interactive", undefined],
] as const) {
  test(`a ${posture} card's resource hints open no connection from its frame`, async ({ room, page }) => {
    await using listener = await plantListener();
    const served = await room.serve(hintMarkup(listener.origin), characterId);
    expect(served.granted).toMatchObject({ externalMedia: false, interactive: posture === "interactive" });
    await embed(page, served, await room.appPolicy());
    expect(listener.connections()).toBe(0);
  });
}

test("the srcdoc floor's resource hints open no connection from its frame", async ({ mount, page }) => {
  await using listener = await plantListener();
  await page.route(`**${BARRIER_URL}*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  const root = await mount<typeof SandboxFrameStory>(FLOOR_STORY, { html: hintMarkup(listener.origin), title: "floor card" });
  await expect(root.locator(FRAME)).toHaveAttribute("data-delivery", "srcdoc");
  await expect(page.frameLocator(FRAME).locator(`#${MARKER}`)).toHaveText(MARKER_TEXT);
  await settleNetwork(page);
  expect(listener.connections()).toBe(0);
});

test("a plugin frame's resource hints open no connection from its frame", async ({ room, page }) => {
  await using listener = await plantListener();
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "resource-hints",
    name: "Resource hints",
    description: "One frame whose markup names a host in every resource hint.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface", "ui.frame"],
  });
  const frame = { id: FRAME_SURFACE_ID, anchor: "page", title: "Hints", html: hintMarkup(listener.origin) };
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, `orb.host(1).ui.registerFrame(${JSON.stringify(frame)});`, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  const auth = await captureCookieAuth(root, await root.principalFor(root.ownerId), PLUGIN_VIEWER_PASSWORD);
  const headers = { cookie: auth.cookie, forwarded: "", [CSRF_HEADER]: "1", "content-type": "application/json" };
  const minted = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers,
    body: JSON.stringify({ pluginId: plugin.id, surfaceId: FRAME_SURFACE_ID }),
  });
  expect(minted.status).toBe(200);
  const { url } = pluginFrameMintResponseSchema.parse(await minted.json());
  const document = await root.http.request(url, { headers });
  expect(document.headers.get(CSP_HEADER)).toContain("script-src 'unsafe-inline'");
  // The embedding policy is the production one the card room serves, so both frames sit under the same page.
  await embed(page, { url, status: document.status, headers: Object.fromEntries(document.headers), body: await document.text() }, await room.appPolicy());
  expect(listener.connections()).toBe(0);
});
