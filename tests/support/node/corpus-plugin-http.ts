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
export const CORPUS_PLUGIN_FRAME_TEXT = "Native frame ledger";
const FRAME_ASSET = "ui/assets/ledger.png";
const FRAME_GUEST_SOURCE = `const h = orb.host(1); h.ui.registerFrame({ id: "frame", anchor: "page", title: "Ledger frame", html: ${JSON.stringify(`<p>${CORPUS_PLUGIN_FRAME_TEXT}</p>`)} });`;

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
    bundle: makePluginBundle(manifest, FRAME_GUEST_SOURCE, root.clock.now(), {
      [PLUGIN_UI_ENTRY]: strToU8(CORPUS_PLUGIN_UI_SOURCE),
      [FRAME_ASSET]: expectedImage,
    }),
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

interface MintedFrame {
  readonly frame: PluginFrameMintResponse;
  readonly assetUrl: string;
}

interface FrameDocumentCapture {
  readonly response: Response;
  readonly text: string;
}

interface FrameAssetCapture {
  readonly response: Response;
  readonly bytes: Uint8Array;
}

export interface CorpusPluginFrameLifetime {
  readonly baseline: CorpusPluginHttp;
  readonly first: MintedFrame;
  readonly anonymousAsset: FrameAssetCapture;
  readonly beforeBoundary: FrameDocumentCapture;
  readonly pastInitialExpiry: FrameDocumentCapture;
  readonly expired: FrameDocumentCapture;
  readonly expiredAsset: FrameAssetCapture;
  readonly noCsrf: Response;
  readonly foreignDelete: Response;
  readonly afterForeignDelete: FrameDocumentCapture;
  readonly deleted: Response;
  readonly deletedDocument: FrameDocumentCapture;
  readonly deletedAsset: FrameAssetCapture;
  readonly narrowed: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly revokedDocument: FrameDocumentCapture;
  readonly revokedAsset: FrameAssetCapture;
  readonly upgrade: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["upgrade"]>>;
  readonly survivingAssets: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["listBundleAssets"]>>;
  readonly removedSurfaceDocument: FrameDocumentCapture;
  readonly removedSurfaceAsset: FrameAssetCapture;
  readonly beforeUninstall: FrameDocumentCapture;
  readonly uninstalledDocument: FrameDocumentCapture;
  readonly uninstalledAsset: FrameAssetCapture;
}

/** Observe sliding business-clock expiry and live revocation on natively minted frame credentials. */
export async function seedCorpusPluginFrameLifetime(root: ServerTestHarness): Promise<CorpusPluginFrameLifetime> {
  const baseline = await seedCorpusPluginHttp(root);
  const caller = await root.principalFor(root.ownerId);
  const pluginId = baseline.installed.plugin.id;
  const ownerHeaders = { cookie: baseline.ownerAuth.cookie, forwarded: "" };
  const foreignHeaders = { cookie: baseline.foreignAuth.cookie, forwarded: "" };
  await root.services.plugin.setEnabled({ caller, pluginId, enabled: true });
  const mint = async (): Promise<MintedFrame> => {
    const response = await root.http.request(PLUGIN_FRAME_ROUTE, {
      method: "POST",
      headers: { ...ownerHeaders, "content-type": "application/json", [CSRF_HEADER]: "1" },
      body: JSON.stringify({ pluginId, surfaceId: "frame" }),
    });
    if (!response.ok) {
      throw new Error(`Native plugin frame mint refused (${response.status})`);
    }
    const frame = pluginFrameMintResponseSchema.parse(await response.json());
    const handle = frame.url.split("/").at(-1);
    if (handle === undefined) {
      throw new Error("Native plugin frame omitted its opaque handle");
    }
    return { frame, assetUrl: pluginFrameAssetUrl(handle, FRAME_ASSET) };
  };
  const readDocument = async (url: string, headers = ownerHeaders): Promise<FrameDocumentCapture> => {
    const response = await root.http.request(url, { headers });
    return { response, text: await response.text() };
  };
  const readAsset = async (url: string): Promise<FrameAssetCapture> => {
    const response = await root.http.request(url, { headers: { forwarded: "" } });
    return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  const first = await mint();
  const anonymousAsset = await readAsset(first.assetUrl);
  root.clock.advance(first.frame.expiresInMs - 1);
  const beforeBoundary = await readDocument(first.frame.url);
  root.clock.advance(1);
  const pastInitialExpiry = await readDocument(first.frame.url);
  root.clock.advance(first.frame.expiresInMs);
  const expired = await readDocument(first.frame.url);
  const expiredAsset = await readAsset(first.assetUrl);

  const disposable = await mint();
  const noCsrf = await root.http.request(disposable.frame.url, { method: "DELETE", headers: ownerHeaders });
  await noCsrf.arrayBuffer();
  const foreignDelete = await root.http.request(disposable.frame.url, { method: "DELETE", headers: { ...foreignHeaders, [CSRF_HEADER]: "1" } });
  await foreignDelete.arrayBuffer();
  const afterForeignDelete = await readDocument(disposable.frame.url);
  const deleted = await root.http.request(disposable.frame.url, { method: "DELETE", headers: { ...ownerHeaders, [CSRF_HEADER]: "1" } });
  await deleted.arrayBuffer();
  const deletedDocument = await readDocument(disposable.frame.url);
  const deletedAsset = await readAsset(disposable.assetUrl);

  const consent = await mint();
  const narrowed = await seedPluginGrant(root.db, root.services.plugin.setGrant, { caller, pluginId, grant: ["ui.surface"], acknowledgedNetHosts: [] });
  const revokedDocument = await readDocument(consent.frame.url);
  const revokedAsset = await readAsset(consent.assetUrl);
  await root.services.plugin.setGrant({ caller, pluginId, grant: ["ui.surface", "ui.frame"], acknowledgedNetHosts: [], enable: true });
  const removed = await mint();
  const upgrade = await root.services.plugin.upgrade({
    caller,
    pluginId,
    bundle: makePluginBundle(pluginManifestSchema.parse({ ...baseline.installed.plugin.manifest, version: "2.0.0" }), "orb.host(1);", root.clock.now(), {
      [PLUGIN_UI_ENTRY]: strToU8(CORPUS_PLUGIN_UI_SOURCE),
      [FRAME_ASSET]: baseline.expectedImage,
    }),
  });
  const survivingAssets = await root.services.plugin.listBundleAssets({ caller, pluginId });
  const removedSurfaceDocument = await readDocument(removed.frame.url);
  const removedSurfaceAsset = await readAsset(removed.assetUrl);
  await root.services.plugin.upgrade({
    caller,
    pluginId,
    bundle: makePluginBundle(pluginManifestSchema.parse({ ...baseline.installed.plugin.manifest, version: "3.0.0" }), FRAME_GUEST_SOURCE, root.clock.now(), {
      [PLUGIN_UI_ENTRY]: strToU8(CORPUS_PLUGIN_UI_SOURCE),
      [FRAME_ASSET]: baseline.expectedImage,
    }),
  });
  const final = await mint();
  const beforeUninstall = await readDocument(final.frame.url);
  await root.services.plugin.uninstall({ caller, pluginId });
  const uninstalledDocument = await readDocument(final.frame.url);
  const uninstalledAsset = await readAsset(final.assetUrl);
  return {
    baseline,
    first,
    anonymousAsset,
    beforeBoundary,
    pastInitialExpiry,
    expired,
    expiredAsset,
    noCsrf,
    foreignDelete,
    afterForeignDelete,
    deleted,
    deletedDocument,
    deletedAsset,
    narrowed,
    revokedDocument,
    revokedAsset,
    upgrade,
    survivingAssets,
    removedSurfaceDocument,
    removedSurfaceAsset,
    beforeUninstall,
    uninstalledDocument,
    uninstalledAsset,
  };
}
