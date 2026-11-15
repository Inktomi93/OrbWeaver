// @subject packages/inference/src/backends/wire/model-listing.ts
// A model list the provider refused under the key it was read with says so, by the same rule a chat turn strikes a
// key by, so the dialog can name the fix and refuse to save on it; any other failed list says nothing about the key.
// Both doors run through the composed root: the dialog's draft list and a saved connection's list.
import type { ModelListing } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { SECRET_BOX_TEST_KEY } from "@orb/testkit/node/helpers";

const PUBLIC_ADDRESS = "93.184.215.14";
const DRAFT_KEY = "synthetic-draft-key";
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;

const CODED_KEY_BODY = { error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } };
const PROSE_ONLY_BODY = { error: "Invalid API key" };

// `openai` judges every 401 and 403; `nanogpt` reads a 403 as the key's only when its structured code names the key.
const CASES = [
  { provider: "openai", status: HTTP_UNAUTHORIZED, body: CODED_KEY_BODY, keyRefused: true },
  { provider: "openai", status: HTTP_FORBIDDEN, body: PROSE_ONLY_BODY, keyRefused: true },
  { provider: "openai", status: HTTP_SERVER_ERROR, body: CODED_KEY_BODY, keyRefused: false },
  { provider: "nanogpt", status: HTTP_FORBIDDEN, body: CODED_KEY_BODY, keyRefused: true },
  { provider: "nanogpt", status: HTTP_FORBIDDEN, body: PROSE_ONLY_BODY, keyRefused: false },
] as const;

function refusing(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(Response.json(body, { status }));
}

async function rootAnswering(status: number, body: unknown): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  const scripted = refusing(status, body);
  return await createServerHarness({
    startJobs: false,
    secretBoxKey: SECRET_BOX_TEST_KEY,
    providerFetch: scripted,
    networkExecution: { fetch: scripted, resolver: () => Promise.resolve([PUBLIC_ADDRESS]) },
  });
}

function refusalOf(listing: ModelListing): boolean | null {
  return listing.listed ? null : listing.keyRefused === true;
}

test.for(CASES)("a $provider list answered $status reads keyRefused $keyRefused on the draft door", async ({ provider, status, body, keyRefused }) => {
  await using root = await rootAnswering(status, body);
  const caller = await root.internalCallerFor(root.ownerId);
  const listing = await caller.connection.draftCatalogModels({ providerId: providerIdSchema.parse(provider), key: DRAFT_KEY });
  expect(refusalOf(listing)).toBe(keyRefused);
});

// NanoGPT's models list answers without a key, so a draft key is judged by the row's key check, a free keyed read. A
// refusal names the key; a check with no verdict (a 5xx, a 403 that names no key, the network) marks the list
// unchecked and keeps it.
const NANOGPT_KEY_CHECK = BUILTIN_PROVIDERS.find((row) => row.id === "nanogpt")?.features?.keyCheckPath ?? "";
const NETWORK_DOWN = "network";
const KEY_CHECKS = [
  { answer: "a 401", check: { status: HTTP_UNAUTHORIZED, body: CODED_KEY_BODY }, reads: { listed: false, keyRefused: true, keyUnchecked: false } },
  {
    answer: "a 403 coded invalid_api_key",
    check: { status: HTTP_FORBIDDEN, body: CODED_KEY_BODY },
    reads: { listed: false, keyRefused: true, keyUnchecked: false },
  },
  {
    answer: "a 403 that names no key",
    check: { status: HTTP_FORBIDDEN, body: PROSE_ONLY_BODY },
    reads: { listed: true, keyRefused: false, keyUnchecked: true },
  },
  { answer: "a 500", check: { status: HTTP_SERVER_ERROR, body: CODED_KEY_BODY }, reads: { listed: true, keyRefused: false, keyUnchecked: true } },
  { answer: "no answer", check: NETWORK_DOWN, reads: { listed: true, keyRefused: false, keyUnchecked: true } },
  { answer: "a 200", check: { status: 200, body: { object: "list", data: [] } }, reads: { listed: true, keyRefused: false, keyUnchecked: false } },
] as const;

test.for(KEY_CHECKS)("a NanoGPT draft key whose key check answers $answer reads refused or unchecked by that answer", async ({ check, reads }) => {
  const seen: { readonly path: string; readonly authorization: string | null }[] = [];
  const scripted: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    seen.push({ path: pathname, authorization: request.headers.get("authorization") });
    if (pathname !== NANOGPT_KEY_CHECK) {
      return Promise.resolve(Response.json({ object: "list", data: [{ id: "vendor/chat-model", object: "model" }] }));
    }
    return check === NETWORK_DOWN ? Promise.reject(new TypeError("fetch failed")) : Promise.resolve(Response.json(check.body, { status: check.status }));
  };
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: SECRET_BOX_TEST_KEY,
    providerFetch: scripted,
    networkExecution: { fetch: scripted, resolver: () => Promise.resolve([PUBLIC_ADDRESS]) },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const listing = await caller.connection.draftCatalogModels({ providerId: providerIdSchema.parse("nanogpt"), key: DRAFT_KEY });
  const flags = listing.listed
    ? { listed: true, keyRefused: false, keyUnchecked: listing.keyUnchecked === true }
    : { listed: false, keyRefused: listing.keyRefused === true, keyUnchecked: false };
  expect(flags).toEqual(reads);
  // Positive control: the key check went out, under the draft key.
  expect(seen).toContainEqual({ path: NANOGPT_KEY_CHECK, authorization: `Bearer ${DRAFT_KEY}` });
});

test.for(CASES)("a $provider list answered $status reads keyRefused $keyRefused on a saved connection", async ({ provider, status, body, keyRefused }) => {
  await using root = await rootAnswering(status, body);
  const caller = await root.internalCallerFor(root.ownerId);
  const providerId = providerIdSchema.parse(provider);
  const credential = await root.services.credentials.add({ principal: await root.principalFor(root.ownerId), provider: providerId, key: DRAFT_KEY });
  const connection = await caller.connection.create({
    providerId,
    credentialId: credential.id,
    baseUrl: null,
    model: modelIdSchema.parse("vendor/chat-model"),
  });
  const listing = await caller.connection.catalogModels({ connectionId: connection.id });
  expect(refusalOf(listing)).toBe(keyRefused);
});
