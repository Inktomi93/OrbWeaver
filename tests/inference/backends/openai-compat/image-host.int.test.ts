// @subject packages/inference/src/backends/openai-compat/images.ts
// @subject packages/contracts/src/inference/builtin-providers.ts
// A built-in row whose service answers images on another host than chat names that host beside the row, and the image
// call goes there with the row's key. The host comes only from the built-in row's id, so a Custom connection on the
// same chat base URL, or a plugin row under the same name, keeps its own base URL.
import { builtinImageBaseUrl, GENERATION_FLOOR } from "@orb/contracts/inference";
import type { ImageGenerateResult, ProviderError, Resolved } from "@orb/inference";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { z } from "zod";
import { settledProviderError } from "../../conformance/runtime.fixtures.ts";
import { createRuntimeRoot, generationCapability, RUNTIME_KEY, wireConnection } from "../../roles/runtime.fixtures.ts";

const LITEROUTER_CHAT_BASE = "https://api.literouter.com/v1";
const IMAGE_MODEL = "sdxl-turbo";
const PICTURE = "aGk=";
const SIZE = { width: 512, height: 512 };

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown> | null;
}

/** The list answers one image row; the images route answers one picture, or `refusal` with its status. */
function service(seen: Seen[], refusal?: { readonly status: number; readonly body: unknown }): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const body = request.method === "POST" ? z.record(z.string(), z.unknown()).parse(await request.json()) : null;
    seen.push({ url: request.url, authorization: request.headers.get("authorization"), body });
    if (request.method === "GET") {
      return Response.json({ object: "list", data: [{ id: IMAGE_MODEL, ["display_name"]: "SDXL Turbo", object: "model", type: "image", variant: "base" }] });
    }
    return refusal === undefined ? Response.json({ created: 1, data: [{ ["b64_json"]: PICTURE }] }) : Response.json(refusal.body, { status: refusal.status });
  };
}

async function literouterImage(root: ServerTestHarness): Promise<Resolved<"generateImage">> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: "literouter", key: RUNTIME_KEY });
  const row = await root.services.connection.create({ principal, providerId: "literouter", credentialId: credential.id, baseUrl: null, model: IMAGE_MODEL });
  const signal = new AbortController().signal;
  await root.services.connection.capabilities({ principal, connectionId: row.id, signal });
  const { resolved } = await root.app.runtime.resolve({ signal, principal, task: "generateImage", connectionId: row.id, cachedFacts: true });
  return { ...resolved, task: "generateImage" };
}

function generate(root: ServerTestHarness, connection: Resolved<"generateImage">): Promise<ImageGenerateResult> {
  return root.app.runtime.executor.generateImage({ signal: new AbortController().signal, connection, prompt: "a lake at dusk", size: SIZE });
}

test("a LiteRouter image goes to its image host with the row's key, in the OpenAI images shape", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot({ providerFetch: service(seen) });
  const result = await generate(root, await literouterImage(root));
  expect(result.images.map((image) => image.base64)).toEqual([PICTURE]);
  const posts = seen.filter((request) => request.body !== null);
  expect(posts).toEqual([
    {
      url: `${builtinImageBaseUrl("literouter")}/images/generations`,
      authorization: `Bearer ${RUNTIME_KEY}`,
      body: expect.objectContaining({ model: IMAGE_MODEL, prompt: "a lake at dusk", n: 1, size: `${SIZE.width}x${SIZE.height}` }),
    },
  ]);
  // The model list is still read from the chat host.
  expect(seen.filter((request) => request.body === null).map((request) => new URL(request.url).origin)).toEqual([new URL(LITEROUTER_CHAT_BASE).origin]);
});

test("a Custom connection on LiteRouter's chat base URL sends its image to that base URL, never the image host", async () => {
  const seen: Seen[] = [];
  await using root = await createRuntimeRoot({ providerFetch: service(seen) });
  const connection = await wireConnection(root, {
    task: "generateImage",
    providerId: "custom-openai",
    model: IMAGE_MODEL,
    baseUrl: LITEROUTER_CHAT_BASE,
    key: RUNTIME_KEY,
    capability: generationCapability({ output: { ...GENERATION_FLOOR.output, modalities: ["image"] } }),
    declaredFeatures: { images: "images-api" },
  });
  await generate(root, connection);
  expect(seen.filter((request) => request.body !== null).map((request) => request.url)).toEqual([`${LITEROUTER_CHAT_BASE}/images/generations`]);
});

test("only a bare built-in id names an image host, so a plugin row under the LiteRouter name has none", () => {
  expect({
    builtin: builtinImageBaseUrl("literouter"),
    plugin: builtinImageBaseUrl("plugin:router/literouter"),
    custom: builtinImageBaseUrl("custom-openai"),
  }).toEqual({
    builtin: "https://image.literouter.com/v1",
    plugin: undefined,
    custom: undefined,
  });
});

test("an image refusal reads in the service's words with the key scrubbed", async () => {
  const seen: Seen[] = [];
  const refusal = { status: 400, body: { error: { message: `size not allowed for key ${RUNTIME_KEY}`, type: "invalid_request_error" } } };
  await using root = await createRuntimeRoot({ providerFetch: service(seen, refusal) });
  const connection = await literouterImage(root);
  const settled = await settledProviderError(() => generate(root, connection));
  const error: ProviderError = present(settled.error);
  expect({ kind: error.kind, named: error.message.includes("size not allowed") }).toEqual({ kind: "invalid", named: true });
  expect(error.message).not.toContain(RUNTIME_KEY);
});
