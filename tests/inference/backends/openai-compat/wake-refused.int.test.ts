// @subject packages/inference/src/backends/openai-compat/reachability.ts
// A wake POST the endpoint never takes is a transport failure, as the probe reads its own: the task falls through to
// the bounded wake poll, and the poll decides. Here the server's egress refuses the POST (its host resolves to a
// never-admissible address for that one request) while another client wakes the engine, so the poll finds it up and
// the task runs. A wake POST that rejected the task with the raw refusal would skip the poll.
import type { ProviderError, Resolved } from "@orb/inference";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions } from "@orb/testkit/node/composed";
import { settledProviderError } from "../../conformance/runtime.fixtures.ts";
import { createRuntimeRoot, RUNTIME_KEY, wireConnection } from "../../roles/runtime.fixtures.ts";

const ENGINE_HOST = "box.local";
const ENGINE_ROOT = `http://${ENGINE_HOST}`;
const LOOPBACK = "127.0.0.1";
// Link-local, the cloud-metadata class the egress never admits, however the operator spells the allowlist.
const NEVER_ADMISSIBLE = "169.254.169.254";
const ASLEEP_PATH = "/is_sleeping";
const WAKE_PATH = "/wake_up";

interface Engine {
  readonly options: ServerHarnessOptions;
  readonly seen: string[];
  readonly refusals: () => number;
}

/** A vLLM-shaped engine that starts asleep. The request after a sleep check that answered asleep is the wake POST: its
 *  host resolves to a never-admissible address for that request alone, and another client wakes the engine at that
 *  moment, so only the poll that follows can learn it is up. */
function engine(): Engine {
  const seen: string[] = [];
  let asleep = true;
  let refuseNext = false;
  let refusals = 0;
  const options: ServerHarnessOptions = {
    providerFetch: (input, init): Promise<Response> => {
      const request = new Request(input, init);
      seen.push(new URL(request.url).pathname);
      const { pathname } = new URL(request.url);
      if (pathname.endsWith(ASLEEP_PATH)) {
        refuseNext = asleep;
        return Promise.resolve(Response.json({ ["is_sleeping"]: asleep }));
      }
      if (pathname.endsWith("/models")) {
        return Promise.resolve(Response.json({ object: "list", data: [{ id: "vendor/reranker", object: "model" }] }));
      }
      return Promise.resolve(Response.json({ results: [{ index: 0, ["relevance_score"]: 0.5 }] }));
    },
    networkExecution: {
      resolver: (hostname): Promise<string[]> => {
        if (hostname !== ENGINE_HOST) {
          return Promise.resolve([]);
        }
        if (refuseNext) {
          refuseNext = false;
          asleep = false;
          refusals += 1;
          return Promise.resolve([NEVER_ADMISSIBLE]);
        }
        return Promise.resolve([LOOPBACK]);
      },
    },
  };
  return { options, seen, refusals: () => refusals };
}

async function rerankOn(subject: Engine): Promise<ProviderError | null> {
  await using root = await createRuntimeRoot(subject.options);
  const connection = await wireConnection(root, {
    task: "rerank",
    providerId: "vllm",
    model: "vendor/reranker",
    baseUrl: ENGINE_ROOT,
    key: RUNTIME_KEY,
    declared: { kind: "rerank", rerank: { maxInputTokens: 8192, input: ["text"], instructionAware: false }, features: { detectServer: false } },
  });
  const sleeping: Resolved<"rerank"> = { ...connection, features: { ...connection.features, sleep: { isSleepingPath: ASLEEP_PATH, wakePath: WAKE_PATH } } };
  const settled = await settledProviderError(() =>
    root.app.runtime.executor.rerank({
      signal: new AbortController().signal,
      connection: sleeping,
      query: "control",
      documents: [{ id: "document", text: "control" }],
    }),
  );
  return settled.error;
}

test("a wake POST the egress refuses falls through to the wake poll, which finds the engine up and lets the task run", async () => {
  const subject = engine();

  const error = await rerankOn(subject);

  expect(error).toBeNull();
  expect(subject.refusals()).toBe(1);
  // The refused POST never reached the engine; the poll's sleep check and model list did, then the task.
  expect(subject.seen).toEqual([ASLEEP_PATH, ASLEEP_PATH, "/v1/models", "/rerank"]);
});
