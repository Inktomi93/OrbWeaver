// An isolated plugin frame's refused host call answers the bare refusal and no reason, even when the server refused it
// with an allowlisted code a scripted guest would receive; a granted call through the same relay answers its value.
import { spawn } from "node:child_process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameResult } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_FRAME_CALL_REFUSED,
  PLUGIN_FRAME_ROUTE,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_HOST_CALL_CODES,
  PLUGIN_UI_ROUTE,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { captureCookieAuth, createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";
import type { PluginFrameTextScaleStory } from "./_consent-layout-stories.tsx";

const STORY = "tests/client/features/plugin/components/_consent-layout-stories/PluginFrameTextScaleStory";
const FRAME_TITLE = "Refusal witness: Frame preferences";
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

test("a frame's refused host call carries no reason, though the server refused it with a code; a granted call answers its value", async ({ page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
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
  const source = `const host=orb.host(1);host.ui.registerFrame({id:"frame",anchor:"settings",title:"Frame preferences",html:${JSON.stringify(FRAME_HTML)}});`;
  const plugin = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8("") })).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: plugin.id, enabled: true });
  // The server refuses the ungranted call with the coded refusal a scripted guest would be told.
  expect(manifest.capabilities).not.toContain(HOST_FUNCTION_CAPABILITY["variables.get"]);
  await expect(caller.plugin.uiHostCall({ pluginId: plugin.id, fn: "variables.get", argsJson: '["ledger"]' })).rejects.toMatchObject({
    cause: { code: PLUGIN_UI_HOST_CALL_CODES.notGranted },
  });

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
  const trpc = await routeTrpc(page, serveCorpusProcedures(caller, PLUGIN_READS));
  const component = await mount<typeof PluginFrameTextScaleStory>(STORY, { width: STORY_WIDTH, fontScale: 1 });
  try {
    // Keys in the frame's sorted order: "granted" before "refused-grant".
    const expected: Record<string, PluginFrameResult> = {
      [GRANTED_CALL]: { callId: GRANTED_CALL, ok: true, value: null },
      [REFUSED_CALL]: { callId: REFUSED_CALL, ok: false, error: PLUGIN_FRAME_CALL_REFUSED },
    };
    const frame = page.locator(`iframe[title="${FRAME_TITLE}"]`);
    await frame.scrollIntoViewIfNeeded();
    await expect(frame).toBeVisible();
    const results = page.frameLocator(`iframe[title="${FRAME_TITLE}"]`).locator("#results");
    await expect(results).toHaveText(JSON.stringify(expected));
    expect(trpc.count("plugin.uiHostCall")).toBe(2);
  } finally {
    await component.unmount();
  }
});
