// @subject packages/server/src/entry/http/security-headers.ts
// Each registered own-policy route keeps the Content-Security-Policy its handler wrote on the arm that writes one,
// and an arm that writes none leaves with the app document policy. The plugin frame's passive asset is the arm
// that also needs its own `Cross-Origin-Resource-Policy` to survive. This covers the registered routes only: a
// route whose own policy is never registered is overwritten before the response leaves, so no request can see it.
import { spawn } from "node:child_process";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import {
  PLUGIN_FRAME_ROUTE,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ASSETS_DIR,
  pluginFrameAssetUrl,
  pluginFrameMintResponseSchema,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { CARD_FRAME_SANDBOX } from "@orb/kit/card-frame";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, makePluginBundle } from "@orb/testkit/node/composed";

const POLICY = "content-security-policy";
const RESOURCE_POLICY = "cross-origin-resource-policy";
const MINT_HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
// A relay tell: the owner fallback refuses a loopback request that carries one, so the route answers its bare 401.
const RELAYED = { "x-forwarded-for": "203.0.113.9" } as const;
const SURFACE_ID = "ledger";
const ASSET_PATH = `${PLUGIN_UI_ASSETS_DIR}ledger.png`;
const GUEST = `orb.host(1).ui.registerFrame({ id: ${JSON.stringify(SURFACE_ID)}, anchor: "page", title: "Ledger", html: "<p>ledger</p>" });`;
const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

interface Served {
  readonly status: number;
  readonly policy: string | null;
  readonly resourcePolicy: string | null;
}

async function served(root: ServerTestHarness, url: string, headers: Readonly<Record<string, string>> = {}): Promise<Served> {
  const response = await root.http.request(url, { headers });
  await response.arrayBuffer();
  return { status: response.status, policy: response.headers.get(POLICY), resourcePolicy: response.headers.get(RESOURCE_POLICY) };
}

async function openRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({
    pluginSpawn: spawn,
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
}

/** Install a frame plugin that ships one raster asset, and mint its frame through the real route. */
async function mintPluginFrame(root: ServerTestHarness): Promise<string> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "own-policy-ledger",
    name: "Own policy ledger",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers one frame surface with one asset.",
    capabilities: ["ui.surface", "ui.frame"],
  });
  const bundle = makePluginBundle(manifest, GUEST, root.clock.now(), { [ASSET_PATH]: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  const installed = await root.services.plugin.install({ caller, bundle, grant: [...manifest.capabilities] });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const minted = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: MINT_HEADERS,
    body: JSON.stringify({ pluginId: installed.id, surfaceId: SURFACE_ID }),
  });
  expect(minted.status).toBe(OK);
  return pluginFrameMintResponseSchema.parse(await minted.json()).url;
}

async function mintCardFrame(root: ServerTestHarness): Promise<string> {
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await root.services.chat.startChat({ principal, characterIds: [], opening: "none" })).chat.id;
  const minted = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: MINT_HEADERS,
    body: JSON.stringify({ chatId, characterId: null, html: "<p>card</p>" }),
  });
  expect(minted.status).toBe(OK);
  return cardFrameMintResponseSchema.parse(await minted.json()).url;
}

test("each own-policy route keeps its handler's policy on the arm that writes one, and every other arm gets the app policy", { tags: ["slow"] }, async () => {
  await using root = await openRoot();
  const app = await served(root, "/healthz");
  expect(app.status).toBe(OK);
  expect(app.policy).not.toBeNull();
  expect(app.resourcePolicy).toBe("same-origin");

  const cardUrl = await mintCardFrame(root);
  const pluginUrl = await mintPluginFrame(root);
  const handle = pluginUrl.split("/").at(-1) ?? "";
  const assetUrl = pluginFrameAssetUrl(handle, ASSET_PATH);

  for (const url of [cardUrl, pluginUrl]) {
    const document = await served(root, url);
    expect(document.status, url).toBe(OK);
    expect(document.policy, url).not.toBe(app.policy);
    expect(document.policy?.split("; "), url).toContain(`sandbox ${CARD_FRAME_SANDBOX.document}`.trim());
    expect(await served(root, url, RELAYED), url).toEqual({ ...app, status: UNAUTHORIZED });
  }

  const asset = await served(root, assetUrl);
  expect(asset.status).toBe(OK);
  expect(asset.policy).not.toBe(app.policy);
  expect(asset.policy?.split("; ")).toContain("sandbox");
  expect(asset.resourcePolicy).toBe("cross-origin");
  // A path the asset grammar refuses answers a bare 404 that writes no policy, so the app's lands, CORP included.
  expect(await served(root, pluginFrameAssetUrl(handle, `${PLUGIN_UI_ASSETS_DIR}ledger.svg`))).toEqual({ ...app, status: NOT_FOUND });
});
