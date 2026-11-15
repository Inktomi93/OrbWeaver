// @subject packages/inference/src/backends/openai-compat/diagnostics.ts
// The key check reads a route that needs the key. NanoGPT's models list answers without one, so its row names the
// personalized list; a wrong route fails safe as unreachable. LiteRouter's and NanoGPT's 403 is no verdict on the key
// unless its structured code names the key, the same rule a chat turn strikes by.
// A declared path never carries the key off the row's origin, and a refusal's reason shows its decoded words, clean.
import type { CredentialHealth } from "@orb/contracts/credentials";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions, ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, ESCAPED_HAZARD_WORDS, NANOGPT_FORBIDDEN_BODIES, RUNTIME_KEY, wireConnection } from "../../roles/runtime.fixtures.ts";

const NANOGPT_KEY_CHECK_URL = "https://api.nano-gpt.com/api/personalized/v1/models";
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
}

/** Answers `keyCheckStatus` on `keyCheckUrl` and an empty list everywhere else, as a list that needs no key does. */
function host(seen: Seen[], keyCheckUrl: string, keyCheckStatus: number, body: unknown = { error: { message: "refused" } }): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    seen.push({ url: request.url, authorization: request.headers.get("authorization") });
    if (request.url === keyCheckUrl) {
      return Promise.resolve(Response.json(body, { status: keyCheckStatus }));
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

// The bodies the chat turn's strike cases read (`hosted-openai-compat-wire.int.test.ts`): the same code, the same verdict.
const CODED_FORBIDDEN_CHECKS = [
  { answer: "a code naming a wrong key", body: NANOGPT_FORBIDDEN_BODIES.wrongKey, status: "revoked" },
  { answer: "a code naming a missing key", body: NANOGPT_FORBIDDEN_BODIES.missingKey, status: "revoked" },
  { answer: "a code naming a model the account cannot use", body: NANOGPT_FORBIDDEN_BODIES.unsupportedModel, status: "unreachable" },
  { answer: "words alone that name the key", body: NANOGPT_FORBIDDEN_BODIES.keyWordsOnly, status: "unreachable" },
] as const;

test.for(CODED_FORBIDDEN_CHECKS)("a NanoGPT key check answered 403 with $answer reads $status, as a chat turn judges it", async ({ body, status }) => {
  await using root = await createRuntimeRoot({ providerFetch: host([], NANOGPT_KEY_CHECK_URL, HTTP_FORBIDDEN, body) });
  expect(await keyCheck(root, "nanogpt")).toMatchObject({ status, ...(status === "unreachable" ? { httpStatus: HTTP_FORBIDDEN } : {}) });
});

test("a LiteRouter key check answered 401 reads revoked", async () => {
  await using root = await createRuntimeRoot({ providerFetch: host([], "https://api.literouter.com/v1/models", HTTP_UNAUTHORIZED) });
  expect(await keyCheck(root, "literouter")).toMatchObject({ status: "revoked" });
});

test("a key check's reason shows the refusal's decoded words with no markup, control character, bidi override or key", async () => {
  const refusal = (): Promise<Response> =>
    Promise.resolve(new Response(`{"error":"${ESCAPED_HAZARD_WORDS.wire}"}`, { status: HTTP_UNAUTHORIZED, headers: { "content-type": "application/json" } }));
  await using root = await createRuntimeRoot({ providerFetch: refusal });
  const health = await keyCheck(root, "literouter");
  expect(health.status).toBe("revoked");
  const reason = "reason" in health ? health.reason : "";
  for (const word of ESCAPED_HAZARD_WORDS.visible) {
    expect(reason).toContain(word);
  }
  expect(reason).not.toMatch(/[<>]/u);
  expect(reason).not.toMatch(/\p{Cc}/u);
  expect(reason).not.toMatch(/\p{Bidi_Control}/u);
  expect(reason).not.toContain(ESCAPED_HAZARD_WORDS.keyTail);
});

const TAB = String.fromCodePoint(0x09);
const OFF_ORIGIN_PATHS = [
  { shape: "a protocol-relative host", path: "//evil.example/collect" },
  { shape: "a backslash host", path: "/\\evil.example/collect" },
  { shape: "a tab the URL parser drops", path: `/${TAB}/evil.example/collect` },
] as const;
const NANOGPT_ORIGIN = new URL(NANOGPT_KEY_CHECK_URL).origin;

/** Every host resolves to a public peer and answers an empty list, so a request that leaves the row's origin lands. */
function anyHost(seen: Seen[]): ServerHarnessOptions {
  return {
    providerFetch: (input, init): Promise<Response> => {
      const request = new Request(input, init);
      seen.push({ url: request.url, authorization: request.headers.get("authorization") });
      return Promise.resolve(Response.json({ object: "list", data: [] }));
    },
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) },
  };
}

test.for(OFF_ORIGIN_PATHS)("a key check path with $shape sends nothing past the row's origin and reads unchecked", async ({ path }) => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot(anyHost(seen));
  const connection = await wireConnection(root, { task: "chat", providerId: "nanogpt", model: "vendor/chat-model" });
  const signal = new AbortController().signal;
  // The stored schema refuses these paths (`tests/contracts/inference/declared-path.contract.test.ts`). The resolved
  // features are re-spelled here so the case proves the runtime guard on its own.
  const hostile = await root.app.runtime.diagnostics.probe({ connection: { ...connection, features: { ...connection.features, keyCheckPath: path } }, signal });
  expect(seen).toEqual([]);
  expect(hostile.status).toBe("unchecked");
  expect(await root.app.runtime.diagnostics.probe({ connection, signal })).toMatchObject({ status: "ok" });
  expect(seen).toEqual([{ url: NANOGPT_KEY_CHECK_URL, authorization: `Bearer ${RUNTIME_KEY}` }]);
});

test("a connection that declares an off-origin key check path is refused, and a plain one is checked on the row's origin", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot(anyHost(seen));
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: "nanogpt", key: RUNTIME_KEY });
  // The router's input parse is the boundary a declared feature crosses.
  const caller = await root.internalCallerFor(root.ownerId);
  const fields = { providerId: "nanogpt", credentialId: credential.id, baseUrl: null, model: "vendor/chat-model" };
  await expect(caller.connection.create({ ...fields, declared: { features: { keyCheckPath: "//evil.example/collect" } } })).rejects.toThrow(/keyCheckPath/u);
  expect((await caller.connection.list()).map((connection) => connection.providerId)).not.toContain("nanogpt");
  const row = await caller.connection.create({ ...fields, declared: { features: { keyCheckPath: "/api/v1/check" } } });
  expect(await caller.connection.probe({ connectionId: row.id })).toMatchObject({ status: "ok" });
  expect(seen).toContainEqual({ url: `${NANOGPT_ORIGIN}/api/v1/check`, authorization: `Bearer ${RUNTIME_KEY}` });
  expect(seen.map((request) => new URL(request.url).origin).filter((origin) => origin !== NANOGPT_ORIGIN)).toEqual([]);
});
