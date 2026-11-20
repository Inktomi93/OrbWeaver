// An isolated plugin frame's refused host call answers the bare refusal and no reason, even when the server refused it
// with an allowlisted code a scripted guest would receive; a granted call through the same relay answers its value, and a
// call whose arguments pass the server's cap is refused before it is sent. A web
// link in a plugin frame opens nothing and leaves the frame drawn: the pinned frame script hands the click to an embedder
// that has no link listener for plugins.
import { spawn } from "node:child_process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { pluginFrameResultMessage } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_FRAME_CALL_REFUSED,
  PLUGIN_FRAME_ROUTE,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES,
  PLUGIN_UI_HOST_CALL_CODES,
  PLUGIN_UI_ROUTE,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { strToU8 } from "fflate";
import type { PluginFrameTextScaleStory } from "./_consent-layout-stories.tsx";

const STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginFrameTextScaleStory";
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;
const FRAME_TITLE = "Refusal witness: Frame preferences";
const FRAME = `iframe[title="${FRAME_TITLE}"]`;
const LINK_URL = "https://example.test/plugin-docs";
const EXTERNAL_PAGES = "https://*.test/**";
const STORY_WIDTH = 390;
const GRANTED_CALL = "granted";
const REFUSED_CALL = "refused-grant";
const PLUGIN_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "plugin.getSurfaceState",
  "plugin.listBundleAssets",
  "plugin.listDistributed",
  "connection.listBindings",
  "connection.list",
  "plugin.getLog",
  "plugin.checkForUpdates",
  "plugin.uiHostCall",
] as const;
// The frame records every result it is sent, keyed by call id, so the page reads exactly what crossed the bridge.
const FRAME_HTML = `<pre id="results"></pre><script>
const results = {};
addEventListener("message", (event) => {
  const result = event.source === parent && event.data ? event.data.orbPluginFrameResult : undefined;
  if (!result) return;
  results[result.callId] = result;
  document.getElementById("results").textContent = JSON.stringify(Object.fromEntries(Object.entries(results).sort()));
});
parent.postMessage({ orbPluginFrameCall: { callId: ${JSON.stringify(GRANTED_CALL)}, fn: "storage.get", args: ["ledger"] } }, "*");
parent.postMessage({ orbPluginFrameCall: { callId: ${JSON.stringify(REFUSED_CALL)}, fn: "variables.get", args: ["ledger"] } }, "*");
</script>`;
const OVERSIZED_CALL = "oversized";
// The same result recorder, posting the granted call at its ordinary size and again with arguments past the cap the
// server reads them under. The frame's own script builds the long argument, so the frame document stays small.
const OVERSIZED_FRAME_HTML = `${FRAME_HTML.slice(0, FRAME_HTML.indexOf("parent.postMessage"))}parent.postMessage({ orbPluginFrameCall: { callId: ${JSON.stringify(GRANTED_CALL)}, fn: "storage.get", args: ["ledger"] } }, "*");
parent.postMessage({ orbPluginFrameCall: { callId: ${JSON.stringify(OVERSIZED_CALL)}, fn: "storage.get", args: ["x".repeat(${String(PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES)})] } }, "*");
</script>`;
// A frame with one web link and a line that stays only while the frame keeps its own document.
const LINK_FRAME_HTML = `<p id="still-here">Plugin preferences</p><a id="docs-link" href="${LINK_URL}">Docs</a>`;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** Install and enable a plugin whose one frame on the settings anchor holds `html`, and route its frame documents and the
 *  plugin reads to `root` under the owner's session. */
async function serveFramePlugin(
  page: Page,
  root: Root,
  html: string,
): Promise<{
  readonly caller: Caller;
  readonly trpc: TrpcRecorder;
  readonly pluginId: Awaited<ReturnType<Caller["plugin"]["install"]>>["id"];
  readonly capabilities: readonly string[];
}> {
  const caller = await root.internalCallerFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "refusal-witness",
    name: "Refusal witness",
    description: "A frame that makes one granted and one ungranted host call.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    uiEntry: PLUGIN_UI_ENTRY,
    capabilities: ["ui.surface", "ui.frame", "storage.kv"],
  });
  const source = `const host=orb.host(1);host.ui.registerFrame({id:"frame",anchor:"settings",title:"Frame preferences",html:${JSON.stringify(html)}});`;
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8("") })).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  const auth = await captureCookieAuth(root, await root.principalFor(root.ownerId), "plugin-refusal-viewer-password");
  for (const prefix of [PLUGIN_UI_ROUTE, PLUGIN_FRAME_ROUTE]) {
    await page.route(`**${prefix}{,/**}`, async (route) => {
      const request = route.request();
      const response = await root.http.request(new URL(request.url()).pathname, {
        method: request.method(),
        headers: { cookie: auth.cookie, forwarded: "", [CSRF_HEADER]: "1", "content-type": request.headers()["content-type"] ?? "application/json" },
        ...(request.postData() === null ? {} : { body: request.postData() ?? "" }),
      });
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
    });
  }
  return { caller, trpc: await routeTrpc(page, serveCorpusProcedures(caller, PLUGIN_READS)), pluginId: plugin.id, capabilities: manifest.capabilities };
}

test("a frame's refused host call carries no reason, though the server refused it with a code; a granted call answers its value", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const { caller, trpc, pluginId, capabilities } = await serveFramePlugin(page, root, FRAME_HTML);
  // The server refuses the ungranted call with the coded refusal a scripted guest would be told.
  expect(capabilities).not.toContain(HOST_FUNCTION_CAPABILITY["variables.get"]);
  await expect(caller.plugin.uiHostCall({ pluginId, fn: "variables.get", argsJson: '["ledger"]' })).rejects.toMatchObject({
    cause: { code: PLUGIN_UI_HOST_CALL_CODES.notGranted },
  });
  const component = await mount<typeof PluginFrameTextScaleStory>(STORY, { width: STORY_WIDTH, fontScale: 1 });
  try {
    // Keys in the frame's sorted order: "granted" before "refused-grant".
    const expected: Record<string, Parameters<typeof pluginFrameResultMessage>[0]> = {
      [GRANTED_CALL]: { callId: GRANTED_CALL, ok: true, value: null },
      [REFUSED_CALL]: { callId: REFUSED_CALL, ok: false, error: PLUGIN_FRAME_CALL_REFUSED },
    };
    const frame = page.locator(FRAME);
    await frame.scrollIntoViewIfNeeded();
    await expect(frame).toBeVisible();
    const results = page.frameLocator(FRAME).locator("#results");
    await expect(results).toHaveText(JSON.stringify(expected));
    expect(trpc.count("plugin.uiHostCall")).toBe(2);
  } finally {
    await component.unmount();
  }
});

test("a frame's call with arguments past the server's cap is refused before it leaves the browser", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const { trpc } = await serveFramePlugin(page, root, OVERSIZED_FRAME_HTML);
  const component = await mount<typeof PluginFrameTextScaleStory>(STORY, { width: STORY_WIDTH, fontScale: 1 });
  try {
    const expected: Record<string, Parameters<typeof pluginFrameResultMessage>[0]> = {
      [GRANTED_CALL]: { callId: GRANTED_CALL, ok: true, value: null },
      [OVERSIZED_CALL]: { callId: OVERSIZED_CALL, ok: false, error: PLUGIN_FRAME_CALL_REFUSED },
    };
    await page.locator(FRAME).scrollIntoViewIfNeeded();
    await expect(page.frameLocator(FRAME).locator("#results")).toHaveText(JSON.stringify(expected));
    // The ordinary call reached the server; the oversized one never did.
    expect(trpc.count("plugin.uiHostCall")).toBe(1);
  } finally {
    await component.unmount();
  }
});

test("a web link in a plugin frame opens nothing, raises no confirm, and the frame keeps its own document", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  await serveFramePlugin(page, root, LINK_FRAME_HTML);
  const requested: string[] = [];
  await page.context().route(EXTERNAL_PAGES, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "" });
  });
  const popups: string[] = [];
  page.context().on("page", (popup) => popups.push(popup.url()));
  const component = await mount<typeof PluginFrameTextScaleStory>(STORY, { width: STORY_WIDTH, fontScale: 1 });
  try {
    const frame = page.frameLocator(FRAME);
    await page.locator(FRAME).scrollIntoViewIfNeeded();
    await expect(frame.locator("#still-here")).toBeVisible();
    await frame.locator("#docs-link").click();
    // Positive control for the absence below: a frame that had navigated away would have lost its own line.
    await expect(frame.locator("#still-here")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect([requested, popups]).toEqual([[], []]);
  } finally {
    await component.unmount();
  }
});
