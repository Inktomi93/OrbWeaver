// Cookies, minted frame credentials and response bytes stay Node-only; every response uses the native HTTP app.
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameMintResponse } from "@orb/contracts/plugin";
import {
  PLUGIN_FRAME_ROUTE,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_ROUTE,
  pluginFrameAssetUrl,
  pluginFrameMintResponseSchema,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { strToU8 } from "fflate";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import { captureCookieAuth } from "./corpus-seed.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import type { ServerTestHarness } from "./server.ts";

export interface CorpusPluginHttp {
  readonly installed: Awaited<ReturnType<typeof seedInstalledPlugin>>;
  readonly granted: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly ownerAuth: Awaited<ReturnType<typeof captureCookieAuth>>;
  readonly foreignAuth: Awaited<ReturnType<typeof captureCookieAuth>>;
  readonly source: Response;
  readonly sourceText: string;
  readonly frame: PluginFrameMintResponse;
  readonly document: Response;
  readonly documentText: string;
  readonly asset: Response;
  readonly assetBytes: Uint8Array;
  readonly expectedImage: Uint8Array;
  readonly noCsrf: Response;
  readonly foreignSource: Response;
  readonly foreignMint: Response;
  readonly foreignDocument: Response;
  readonly revoked: Response;
}

export const CORPUS_PLUGIN_UI_SOURCE = 'orb.ui(1).log.info("Native inert source");';
const FRAME_ASSET = "ui/assets/ledger.png";

/** Authenticate both viewers through native login; ownership, consent, CSRF and handle liveness remain production decisions. */
export async function seedCorpusPluginHttp(root: ServerTestHarness): Promise<CorpusPluginHttp> {
  const caller = await root.principalFor(root.ownerId);
  const foreign = await root.actor();
  const ownerAuth = await captureCookieAuth(root, caller, "native-plugin-owner-password");
  const foreignAuth = await captureCookieAuth(root, await root.principalFor(foreign.id), "native-plugin-foreign-password");
  const ownerHeaders = { cookie: ownerAuth.cookie, forwarded: "" };
  const foreignHeaders = { cookie: foreignAuth.cookie, forwarded: "" };
  const manifest = pluginManifestSchema.parse({
    ...CORPUS_PLUGIN_MANIFEST,
    id: "corpus-http-ledger",
    uiEntry: PLUGIN_UI_ENTRY,
    capabilities: ["ui.surface", "ui.frame"],
  });
  const expectedImage = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const installed = await seedInstalledPlugin(root.db, root.services.plugin.install, {
    caller,
    bundle: makePluginBundle(
      manifest,
      'const h = orb.host(1); h.ui.registerFrame({ id: "frame", anchor: "page", title: "Ledger frame", html: "<p>Native frame ledger</p>" });',
      root.clock.now(),
      { [PLUGIN_UI_ENTRY]: strToU8(CORPUS_PLUGIN_UI_SOURCE), [FRAME_ASSET]: expectedImage },
    ),
    grant: [],
  });
  const granted = await seedPluginGrant(root.db, root.services.plugin.setGrant, {
    caller,
    pluginId: installed.outcome.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const source = await root.http.request(`${PLUGIN_UI_ROUTE}/${installed.outcome.id}`, { headers: ownerHeaders });
  const sourceText = await source.text();
  const mintBody = JSON.stringify({ pluginId: installed.outcome.id, surfaceId: "frame" });
  const noCsrf = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: mintBody,
  });
  await noCsrf.arrayBuffer();
  const minted = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json", [CSRF_HEADER]: "1" },
    body: mintBody,
  });
  const frame = pluginFrameMintResponseSchema.parse(await minted.json());
  const handle = frame.url.split("/").at(-1);
  if (handle === undefined) {
    throw new Error("native frame mint omitted its handle URL");
  }
  const document = await root.http.request(frame.url, { headers: ownerHeaders });
  const documentText = await document.text();
  const asset = await root.http.request(pluginFrameAssetUrl(handle, FRAME_ASSET), { headers: ownerHeaders });
  const assetBytes = new Uint8Array(await asset.arrayBuffer());
  const foreignSource = await root.http.request(`${PLUGIN_UI_ROUTE}/${installed.outcome.id}`, { headers: foreignHeaders });
  await foreignSource.arrayBuffer();
  const foreignMint = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: { ...foreignHeaders, "content-type": "application/json", [CSRF_HEADER]: "1" },
    body: mintBody,
  });
  await foreignMint.arrayBuffer();
  const foreignDocument = await root.http.request(frame.url, { headers: foreignHeaders });
  await foreignDocument.arrayBuffer();
  await root.services.plugin.setEnabled({ caller, pluginId: installed.outcome.id, enabled: false });
  const revoked = await root.http.request(frame.url, { headers: ownerHeaders });
  await revoked.arrayBuffer();
  return {
    installed,
    granted,
    ownerAuth,
    foreignAuth,
    source,
    sourceText,
    frame,
    document,
    documentText,
    asset,
    assetBytes,
    expectedImage,
    noCsrf,
    foreignSource,
    foreignMint,
    foreignDocument,
    revoked,
  };
}
