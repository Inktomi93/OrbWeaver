// @subject tests/support/node/corpus-plugin-http.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { pluginFrameMintResponseSchema } from "@orb/contracts/plugin";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { CORPUS_PLUGIN_UI_SOURCE, seedCorpusPluginHttp } from "./corpus-plugin-http.ts";

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
  expect(result.documentText).toContain("Native frame ledger");
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
