// @subject packages/server/src/entry/http/plugin-frame.ts
// A frame handle names a live surface, not the bytes the plugin had at mint. A frame remounted inside the handle's
// lifetime after a non-widening upgrade serves the upgraded bundle's document, through the real HTTP entry and a real
// guest on the production broker.
import { spawn } from "node:child_process";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { PLUGIN_FRAME_ROUTE, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginFrameMintResponseSchema, pluginManifestSchema } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

const HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
const SURFACE_ID = "ledger";
const OK = 200;

function bundle(root: ServerTestHarness, version: string, text: string): ReturnType<typeof makePluginBundle> {
  const manifest = pluginManifestSchema.parse({
    id: "frame-upgrade",
    name: "Frame upgrade",
    version,
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers one frame surface.",
    capabilities: ["ui.surface", "ui.frame"],
  });
  const guest = `orb.host(1).ui.registerFrame({ id: ${JSON.stringify(SURFACE_ID)}, anchor: "page", title: "Ledger", html: ${JSON.stringify(`<p>${text}</p>`)} });`;
  return makePluginBundle(manifest, guest, root.clock.now());
}

async function served(root: ServerTestHarness, url: string): Promise<{ readonly status: number; readonly body: string }> {
  const response = await root.http.request(url);
  return { status: response.status, body: await response.text() };
}

test("a frame remounted after a non-widening upgrade serves the upgraded bundle, not the document minted before it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const caller = await root.principalFor(root.ownerId);
  const installed = await root.services.plugin.install({ caller, bundle: bundle(root, "1.0.0", "first ledger"), grant: ["ui.surface", "ui.frame"] });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });

  const minted = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ pluginId: installed.id, surfaceId: SURFACE_ID }),
  });
  expect(minted.status).toBe(OK);
  const { url } = pluginFrameMintResponseSchema.parse(await minted.json());
  // Positive control: before the upgrade the handle serves the first bundle's frame.
  expect(await served(root, url)).toEqual({ status: OK, body: expect.stringContaining("first ledger") });

  const upgraded = await root.services.plugin.upgrade({ caller, pluginId: installed.id, bundle: bundle(root, "1.1.0", "second ledger") });
  expect(upgraded.status).toBe("enabled");

  const remounted = await served(root, url);
  expect(remounted).toEqual({ status: OK, body: expect.stringContaining("second ledger") });
  expect(remounted.body).not.toContain("first ledger");
});
