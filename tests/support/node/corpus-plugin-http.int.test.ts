// @subject tests/support/node/corpus-plugin-http.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { pluginFrameMintResponseSchema } from "@orb/contracts/plugin";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { CORPUS_PLUGIN_FRAME_TEXT, CORPUS_PLUGIN_UI_SOURCE, seedCorpusPluginFrameLifetime, seedCorpusPluginHttp } from "./corpus-plugin-http.ts";

test("native frame handles slide until exact expiry and cease serving documents and passive assets after revocation", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const result = await seedCorpusPluginFrameLifetime(root);
  expect(result.baseline.document.status).toBe(200);
  expect(result.anonymousAsset.response.status).toBe(200);
  expect(Buffer.from(result.anonymousAsset.bytes).equals(Buffer.from(result.baseline.expectedImage))).toBe(true);
  expect(result.beforeBoundary.response.status).toBe(200);
  expect(result.pastInitialExpiry.response.status).toBe(200);
  expect(result.beforeBoundary.text).toBe(result.pastInitialExpiry.text);
  expect(result.expired.response.status).toBe(404);
  expect(result.expired.text).not.toContain(CORPUS_PLUGIN_FRAME_TEXT);
  expect(result.expiredAsset.response.status).toBe(404);
  expect(result.expiredAsset.bytes).toHaveLength(0);
  expect(result.noCsrf.status).toBe(403);
  expect(result.foreignDelete.status).toBe(204);
  expect(result.afterForeignDelete.response.status).toBe(200);
  expect(result.deleted.status).toBe(204);
  expect(result.narrowed.outcome).toMatchObject({ grantedCapabilities: ["ui.surface"], reconsentPending: true, status: "errored" });
  expect(result.narrowed.outcome.lastError).toContain("ui.frame");
  expect(result.upgrade).toMatchObject({ version: "2.0.0", status: "enabled" });
  expect(result.survivingAssets.map(({ path }) => path)).toEqual(result.baseline.installed.assets.map(({ bundlePath }) => bundlePath));
  expect(result.beforeUninstall.response.status).toBe(200);
  for (const document of [result.deletedDocument, result.revokedDocument, result.removedSurfaceDocument, result.uninstalledDocument]) {
    expect(document.response.status).toBe(404);
    expect(document.text).toBe(result.expired.text);
    expect(document.response.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(document.response.headers.get("cache-control")).toContain("no-store");
  }
  for (const asset of [result.deletedAsset, result.revokedAsset, result.removedSurfaceAsset, result.uninstalledAsset]) {
    expect(asset.response.status).toBe(404);
    expect(asset.bytes).toHaveLength(0);
  }
});

test("native HTTP plugin suppliers preserve inert source, scoped frame handles, CSRF and live revocation", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const result = await seedCorpusPluginHttp(root);
  expect(result.granted.outcome.status).toBe("enabled");
  expect(result.source.status).toBe(200);
  expect(result.sourceText).toBe(CORPUS_PLUGIN_UI_SOURCE);
  expect(result.source.headers.get("content-type")).toBe("application/octet-stream");
  expect(result.source.headers.get("x-content-type-options")).toBe("nosniff");
  expect(result.source.headers.get("cache-control")).toBe("private, no-store");
  expect(pluginFrameMintResponseSchema.parse(JSON.parse(JSON.stringify(result.frame)))).toEqual(result.frame);
  expect(result.document.status).toBe(200);
  expect(result.documentText).toContain(CORPUS_PLUGIN_FRAME_TEXT);
  expect(result.document.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
  expect(result.document.headers.get("content-security-policy")).not.toContain("allow-same-origin");
  expect(result.asset.status).toBe(200);
  expect(result.assetBytes).toEqual(result.expectedImage);
  expect(result.asset.headers.get("content-type")).toBe("image/png");
  expect(result.noCsrf.status).toBe(403);
  expect(result.foreignSource.status).toBe(404);
  expect(result.foreignMint.status).toBe(404);
  expect(result.foreignDocument.status).toBe(404);
  expect(result.revoked.status).toBe(404);
});
