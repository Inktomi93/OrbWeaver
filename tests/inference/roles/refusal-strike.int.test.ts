// @subject packages/inference/src/roles/executor.ts
// A provider's refusal strikes the stored key by one rule on every task the executor runs: a 401 always, and a 403
// unless the row says its 403 judges nothing and the body names no key code. A NanoGPT embed or rerank, or a LiteRouter
// image, refused for its model leaves the key alone and fails in the service's own words; a row without that rule
// strikes on any 403, as before.
import type { Capability, Task } from "@orb/contracts/inference";
import { GENERATION_FLOOR } from "@orb/contracts/inference";
import type { ProviderErrorKind, Resolved } from "@orb/inference";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { settledProviderError } from "../conformance/runtime.fixtures.ts";
import { createRuntimeRoot, generationCapability, NANOGPT_FORBIDDEN_BODIES, RUNTIME_KEY, wireConnection } from "./runtime.fixtures.ts";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const MODEL = "vendor/model";
const MODEL_REFUSAL = "Model vendor/model is not allowed on this plan";
const LITEROUTER_MISSPELLED = "[LiteRouter] Model 'vendor/model' is not available or misspelled";

type ServedTask = Extract<Task, "embed" | "rerank" | "generateImage">;

const CAPABILITIES: Record<ServedTask, Capability> = {
  embed: { kind: "embedding", embedding: { dims: 3, maxInputTokens: 2048, mrl: true, input: ["text"], output: ["vector"], instructionAware: false } },
  rerank: { kind: "rerank", rerank: { maxInputTokens: 8192, input: ["text"], instructionAware: false } },
  generateImage: generationCapability({ output: { ...GENERATION_FLOOR.output, modalities: ["image"] } }),
};

/** Every read answers the one model; every task request answers `status` with `body`. */
function refusing(status: number, body: unknown): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    return Promise.resolve(
      request.method === "GET" ? Response.json({ object: "list", data: [{ id: MODEL, object: "model" }] }) : Response.json(body, { status }),
    );
  };
}

async function runTask(root: ServerTestHarness, task: ServedTask, providerId: string): Promise<Awaited<ReturnType<typeof settledProviderError>>> {
  const signal = new AbortController().signal;
  const executor = root.app.runtime.executor;
  const connect = <T extends ServedTask>(served: T): Promise<Resolved<T>> =>
    // An endpoint row stores a key only when one is given; each case strikes or keeps one.
    wireConnection(root, { task: served, providerId, model: MODEL, capability: CAPABILITIES[served], key: RUNTIME_KEY });
  switch (task) {
    case "embed": {
      const connection = await connect("embed");
      return await settledProviderError(() => executor.embed({ signal, connection, input: "a memory" }));
    }
    case "rerank": {
      const connection = await connect("rerank");
      return await settledProviderError(() => executor.rerank({ signal, connection, query: "control", documents: [{ id: "document", text: "control" }] }));
    }
    case "generateImage": {
      const connection = await connect("generateImage");
      return await settledProviderError(() => executor.generateImage({ signal, connection, prompt: "a lake at dusk", size: { width: 512, height: 512 } }));
    }
  }
}

interface Case {
  readonly task: ServedTask;
  readonly providerId: string;
  readonly answer: string;
  readonly status: number;
  readonly body: unknown;
  readonly kind: ProviderErrorKind;
  readonly struck: boolean;
  /** The service's words the failure carries. */
  readonly words: string;
}

const MODEL_REFUSAL_BODY = { error: { message: MODEL_REFUSAL, type: "invalid_request_error", code: "model_not_allowed" } };
const UNAUTHORIZED_BODY = { error: { message: "Invalid session", type: "invalid_api_key", code: "invalid_api_key" } };
const { wrongKey, missingKey } = NANOGPT_FORBIDDEN_BODIES;

// The rows that carry the 403 rule, on each task they newly serve, then the rows without it.
const RULED: readonly { readonly task: ServedTask; readonly providerId: string; readonly refusal: unknown; readonly words: string }[] = [
  { task: "embed", providerId: "nanogpt", refusal: MODEL_REFUSAL_BODY, words: MODEL_REFUSAL },
  { task: "rerank", providerId: "nanogpt", refusal: MODEL_REFUSAL_BODY, words: MODEL_REFUSAL },
  { task: "generateImage", providerId: "literouter", refusal: { error: LITEROUTER_MISSPELLED }, words: LITEROUTER_MISSPELLED },
];

const CASES: readonly Case[] = [
  ...RULED.flatMap(({ task, providerId, refusal, words }): Case[] => [
    { task, providerId, answer: "a 403 for the model", status: HTTP_FORBIDDEN, body: refusal, kind: "invalid", struck: false, words },
    {
      task,
      providerId,
      answer: "a 401",
      status: HTTP_UNAUTHORIZED,
      body: UNAUTHORIZED_BODY,
      kind: "auth_failed",
      struck: true,
      words: UNAUTHORIZED_BODY.error.message,
    },
    {
      task,
      providerId,
      answer: "a 403 coded invalid_api_key",
      status: HTTP_FORBIDDEN,
      body: wrongKey,
      kind: "auth_failed",
      struck: true,
      words: wrongKey.error.message,
    },
    {
      task,
      providerId,
      answer: "a 403 coded missing_api_key",
      status: HTTP_FORBIDDEN,
      body: missingKey,
      kind: "auth_failed",
      struck: true,
      words: missingKey.error.message,
    },
  ]),
  ...(["rerank", "generateImage"] as const).map(
    (task): Case => ({
      task,
      providerId: "openrouter",
      answer: "a 403 for the model",
      status: HTTP_FORBIDDEN,
      body: MODEL_REFUSAL_BODY,
      kind: "auth_failed",
      struck: true,
      words: MODEL_REFUSAL,
    }),
  ),
  {
    task: "embed",
    providerId: "custom-openai",
    answer: "a 403 for the model",
    status: HTTP_FORBIDDEN,
    body: MODEL_REFUSAL_BODY,
    kind: "auth_failed",
    struck: true,
    words: MODEL_REFUSAL,
  },
];

test.for(CASES)(
  "a $providerId $task answered $answer fails as $kind, and strikes the key: $struck",
  async ({ task, providerId, status, body, kind, struck, words }) => {
    await using root = await createRuntimeRoot({ providerFetch: refusing(status, body) });
    const settled = await runTask(root, task, providerId);
    // The stored key is this case's subject, so it is read first.
    const [credential, ...others] = await (await root.internalCallerFor(root.ownerId)).credentials.list();
    expect(others).toEqual([]);
    expect(credential?.revokedReason ?? null).toBe(struck ? "auth_failed" : null);
    const error = present(settled.error);
    expect({ kind: error.kind, status: error.apiErrorStatus, named: error.message.includes(words) }).toEqual({ kind, status, named: true });
  },
);
