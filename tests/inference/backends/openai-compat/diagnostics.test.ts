// The LIVE OpenAI-compatible credential probe. These pins replace the retired server-local `/models`
// classifier with the behavior the provider runtime actually calls: auth refusals revoke, every other
// failure is unreachable, and no upstream prose may carry configured credential literals to the result.

import { probeOpenAiCompat } from "../../../../packages/inference/src/backends/openai-compat/diagnostics.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const API_KEY = "sk-probe-not-a-real-key";
const HEADER_SECRET = "header-probe-not-a-real-secret";

function connection(): Parameters<typeof probeOpenAiCompat>[0]["connection"] {
  return fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "m",
    capability: generationCapability(),
    baseUrl: "https://byo.example.com/v1",
    secret: fakeApiKeySecret(API_KEY),
    transport: { headers: { "x-api-key": HEADER_SECRET } },
  });
}

function responseFetch(status: number, body: string, capture?: { url?: string; headers?: Headers }): typeof fetch {
  return (input, init) => {
    if (capture !== undefined) {
      capture.url = String(input);
      capture.headers = new Headers(init?.headers);
    }
    return Promise.resolve(new Response(body, { status, headers: { "content-type": "application/json" } }));
  };
}

test.each([401, 403])("an authenticated HTTP %s refusal is revoked and its reason is credential-safe", async (status) => {
  const seen: { url?: string; headers?: Headers } = {};
  const body = JSON.stringify({ error: `<b>Bearer ${API_KEY}</b> custom=${HEADER_SECRET}` });

  const health = await probeOpenAiCompat({ connection: connection() }, { fetch: responseFetch(status, body, seen), now: () => NOW });

  expect(seen.url).toBe("https://byo.example.com/v1/models");
  expect(seen.headers?.get("authorization")).toBe(`Bearer ${API_KEY}`);
  expect(seen.headers?.get("x-api-key")).toBe(HEADER_SECRET);
  expect(health).toMatchObject({ status: "revoked", checkedAt: NOW });
  if (health.status !== "revoked") {
    throw new Error(`expected revoked credential health, received ${health.status}`);
  }
  expect(health.reason).toContain(`HTTP ${status}`);
  expect(health.reason).not.toContain(API_KEY);
  expect(health.reason).not.toContain(HEADER_SECRET);
  expect(health.reason).not.toContain("<b>");
});

test("a non-auth HTTP 500 is unreachable, not the retired unchecked verdict", async () => {
  const body = JSON.stringify({ error: "temporary outage: invalid api key cache is unavailable" });

  const health = await probeOpenAiCompat({ connection: connection() }, { fetch: responseFetch(500, body), now: () => NOW });

  expect(health).toMatchObject({ status: "unreachable", checkedAt: NOW });
  if (health.status !== "unreachable") {
    throw new Error(`expected unreachable credential health, received ${health.status}`);
  }
  expect(health.reason).toContain("HTTP 500");
  expect(health.reason).toContain("invalid api key cache is unavailable");
});
