// @subject packages/inference/src/backends/openai-compat/diagnostics.ts
// The key check reads a route that needs the key. NanoGPT's models list answers without one, so its row names the
// personalized list; a wrong route fails safe as unreachable. LiteRouter's and NanoGPT's 403 is no verdict on the key.
import type { CredentialHealth } from "@orb/contracts/credentials";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_KEY } from "../../roles/runtime.fixtures.ts";

const NANOGPT_KEY_CHECK_URL = "https://api.nano-gpt.com/api/personalized/v1/models";
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
}

/** Answers `keyCheckStatus` on `keyCheckUrl` and an empty list everywhere else, as a list that needs no key does. */
function host(seen: Seen[], keyCheckUrl: string, keyCheckStatus: number): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization") });
    if (request.url === keyCheckUrl) {
      return Promise.resolve(Response.json({ error: { message: "refused" } }, { status: keyCheckStatus }));
    }
    return Promise.resolve(Response.json({ object: "list", data: [] }));
  };
}

async function keyCheck(root: ServerTestHarness, providerId: string): Promise<CredentialHealth> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: RUNTIME_KEY });
  const row = await root.services.connection.create({ principal, providerId, credentialId: credential.id, baseUrl: null, model: "vendor/chat-model" });
  return await root.services.connection.probe({ signal: new AbortController().signal, principal, connectionId: row.id });
}

test("a NanoGPT key the personalized list refuses reads revoked, though the models list answers keyless", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot({ providerFetch: host(seen, NANOGPT_KEY_CHECK_URL, HTTP_UNAUTHORIZED) });
  expect(await keyCheck(root, "nanogpt")).toMatchObject({ status: "revoked" });
  expect(seen).toContainEqual({ url: NANOGPT_KEY_CHECK_URL, authorization: `Bearer ${RUNTIME_KEY}` });
});

test("a NanoGPT key check whose route is gone reads unreachable with the 404, neither revoked nor healthy", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host([], NANOGPT_KEY_CHECK_URL, HTTP_NOT_FOUND) });
  expect(await keyCheck(root, "nanogpt")).toMatchObject({ status: "unreachable", httpStatus: HTTP_NOT_FOUND });
});

const FORBIDDEN_CHECKS = [
  { providerId: "literouter", url: "https://api.literouter.com/v1/models", status: "unreachable" },
  { providerId: "nanogpt", url: NANOGPT_KEY_CHECK_URL, status: "unreachable" },
  { providerId: "openai", url: "https://api.openai.com/v1/models", status: "revoked" },
] as const;

test.for(FORBIDDEN_CHECKS)("a $providerId key check answered 403 reads $status", async ({ providerId, url, status }) => {
  await using root = await createRuntimeRoot({ providerFetch: host([], url, HTTP_FORBIDDEN) });
  expect(await keyCheck(root, providerId)).toMatchObject({ status });
});

test("a LiteRouter key check answered 401 reads revoked", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host([], "https://api.literouter.com/v1/models", HTTP_UNAUTHORIZED) });
  expect(await keyCheck(root, "literouter")).toMatchObject({ status: "revoked" });
});
