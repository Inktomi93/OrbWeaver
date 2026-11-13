// @subject packages/inference/src/backends/openai-compat/reachability.ts
// @subject packages/inference/src/resolve/availability.ts
// The composer's pre-send verdict against a physical endpoint: the model list says a server is up or down, and the
// sleep route, which many OpenAI-compatible servers and proxies do not serve, says only whether it is asleep.
import type { RoomSendAvailability } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";

const ENGINE_PROVIDER = "vllm";
const MODELS_PATH = "/v1/models";
const HTTP_NOT_FOUND = 404;
const HTTP_UNAVAILABLE = 503;

/** A captured llama-swap `GET /v1/models` body: extra fields beside the OpenAI row, and no `max_model_len`. */
const LLAMA_SWAP_MODELS = String.raw`{"data":[{"id":"qwen3.8-27b","object":"model","created":1794058770,"owned_by":"llama-swap","description":"Qwen3.8-27B Orca uncensored INT8, both GPUs, 262K, MTP-2","architecture":{"input_modalities":["text"],"modality":"text-\u003etext","output_modalities":["text"]},"context_length":262144,"context_window":262144,"meta":{"llamaswap":{"type":"model","upstream":"vllm"},"n_ctx":262144},"status":{"value":"loaded"}},{"id":"qwen3.8-27b-solo","object":"model","created":1794058770,"owned_by":"llama-swap","description":"Qwen3.8-27B Orca INT8 on GPU 1 only, 64K; coexists with ComfyUI on GPU 0","architecture":{"input_modalities":["text"],"modality":"text-\u003etext","output_modalities":["text"]},"context_length":65536,"context_window":65536,"meta":{"llamaswap":{"type":"model","upstream":"vllm"},"n_ctx":65536},"status":{"value":"unloaded"}},{"id":"qwen3.8-flash-next","object":"model","created":1794058770,"owned_by":"llama-swap","description":"Qwen3.8-Flash-Next Orca uncensored, both GPUs, 262K, MTP-3","architecture":{"input_modalities":["text"],"modality":"text-\u003etext","output_modalities":["text"]},"context_length":262144,"context_window":262144,"meta":{"llamaswap":{"aliases":["qwen3.8-flash-next-low","qwen3.8-flash-next-medium","qwen3.8-flash-next-high","qwen3.8-flash-next-xhigh"],"type":"model","upstream":"vllm"},"n_ctx":262144},"status":{"value":"unloaded"}}],"object":"list"}`;
const LISTED_IDS = ["qwen3.8-27b", "qwen3.8-27b-solo", "qwen3.8-flash-next"];
const FIRST_LISTED = "qwen3.8-27b";

function sleepPath(): string {
  const path = builtinProvider(ENGINE_PROVIDER)?.features?.sleep?.isSleepingPath;
  if (path === undefined) {
    throw new Error(`the ${ENGINE_PROVIDER} row no longer names a sleep route`);
  }
  return path;
}

function routeMissing(): Response {
  return new Response("404 page not found\n", { status: HTTP_NOT_FOUND, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function serviceDown(): Response {
  return new Response("upstream is down", { status: HTTP_UNAVAILABLE });
}

function modelsListed(): Response {
  return new Response(LLAMA_SWAP_MODELS, { headers: { "content-type": "application/json" } });
}

function reportsAsleep(): Response {
  return Response.json({ ["is_sleeping"]: true });
}

interface EngineAnswers {
  readonly models: () => Response;
  readonly sleep: () => Response;
}

interface EngineReading {
  readonly verdict: RoomSendAvailability;
  /** Every path the server dialled before the verdict, so a case can prove the read it depends on happened. */
  readonly asked: readonly string[];
}

/** A row on the engine provider at a loopback server, bound to chat as a user binds one, read through the room's gate. */
async function readVerdict(answers: EngineAnswers): Promise<EngineReading> {
  const asked: string[] = [];
  await using engine = await servePhysicalPeer((request) => {
    const { pathname } = new URL(request.url);
    asked.push(pathname);
    if (pathname === MODELS_PATH) {
      return Promise.resolve(answers.models());
    }
    return Promise.resolve(pathname === sleepPath() ? answers.sleep() : routeMissing());
  });
  await using root = await createServerHarness({ providerFetch: fetch });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: ENGINE_PROVIDER,
    credentialId: null,
    baseUrl: `${engine.origin}/v1`,
    model: FIRST_LISTED,
    modelCheck: "listed",
    allowBackground: true,
  });
  await root.services.connection.setBinding({ principal, task: "chat", connectionId: row.id });
  const chatId = (await root.services.chat.startChat({ principal, characterIds: [], opening: "none" })).chat.id;
  return { verdict: await root.services.chat.checkSendAvailability({ principal, chatId }), asked };
}

test("a server that does not serve the sleep route reads available when its model list answers", async () => {
  const { verdict, asked } = await readVerdict({ models: modelsListed, sleep: routeMissing });
  expect(asked).toContain(sleepPath());
  expect(verdict).toEqual({ available: true });
});

test("a llama-swap listing lists its models for the connection pane", async () => {
  await using engine = await servePhysicalPeer((request) => Promise.resolve(new URL(request.url).pathname === MODELS_PATH ? modelsListed() : routeMissing()));
  await using root = await createServerHarness({ providerFetch: fetch });
  const principal = await root.principalFor(root.ownerId);
  const listing = await root.services.connection.draftCatalogModels({ principal, providerId: ENGINE_PROVIDER, baseUrl: `${engine.origin}/v1` });
  expect(listing.listed ? listing.models.map(({ id }) => id) : listing.reason).toEqual(LISTED_IDS);
});

test("a server whose model list does not answer reads unreachable, whatever its sleep route says", async () => {
  const { verdict, asked } = await readVerdict({ models: serviceDown, sleep: routeMissing });
  expect(asked).toContain(MODELS_PATH);
  expect(verdict).toEqual({ available: false, cause: "endpoint-unreachable" });
});

test("a sleeping server reads available without its model list, because the turn wakes it", async () => {
  const { verdict, asked } = await readVerdict({ models: serviceDown, sleep: reportsAsleep });
  expect(asked).toContain(sleepPath());
  expect(verdict).toEqual({ available: true });
});
