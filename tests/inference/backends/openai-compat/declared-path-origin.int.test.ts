// @subject packages/inference/src/backends/openai-compat/rerank.ts
// @subject packages/inference/src/backends/openai-compat/reachability.ts
// A row's declared rerank path and sleep pair ride the key, so a URL built from one never leaves the base URL's
// origin. The stored schema admits only a plain path (`tests/contracts/inference/declared-path.contract.test.ts`);
// these cases re-spell the resolved features so the request-time guard is what they prove.
import type { EndpointFeatures } from "@orb/contracts/inference";
import type { ProviderError, Resolved } from "@orb/inference";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerHarnessOptions } from "@orb/testkit/node/composed";
import { settledProviderError } from "../../conformance/runtime.fixtures.ts";
import { createRuntimeRoot, RUNTIME_KEY, wireConnection } from "../../roles/runtime.fixtures.ts";

// A server root with no path and no port, where string concatenation lets `.host` extend the request's host.
const ENGINE_HOST = "box.local";
const ENGINE_ROOT = `http://${ENGINE_HOST}`;
const LOOPBACK = "127.0.0.1";
const OFF_ORIGIN = ".evil.example/collect";

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
}

/** A vLLM-shaped server that answers every route and reports asleep until any wake POST lands, wherever it lands,
 *  behind a resolver that also resolves the other host, so a request that leaves the origin lands and is recorded. */
function engine(seen: Seen[], startsAsleep: boolean): ServerHarnessOptions {
  let asleep = startsAsleep;
  return {
    providerFetch: (input, init): Promise<Response> => {
      const request = new Request(input, init);
      seen.push({ url: request.url, authorization: request.headers.get("authorization") });
      const { pathname } = new URL(request.url);
      if (pathname.endsWith("/is_sleeping")) {
        return Promise.resolve(Response.json({ ["is_sleeping"]: asleep }));
      }
      if (pathname.endsWith("/models")) {
        return Promise.resolve(Response.json({ object: "list", data: [{ id: "vendor/reranker", object: "model" }] }));
      }
      if (!pathname.endsWith("/rerank")) {
        asleep = false;
        return Promise.resolve(Response.json({}));
      }
      return Promise.resolve(Response.json({ results: [{ index: 0, ["relevance_score"]: 0.5 }] }));
    },
    networkExecution: { resolver: (hostname) => Promise.resolve([hostname === ENGINE_HOST ? LOOPBACK : PUBLIC_PEER_ADDRESS]) },
  };
}

function offOrigin(seen: readonly Seen[]): Seen[] {
  return seen.filter((request) => new URL(request.url).origin !== ENGINE_ROOT);
}

async function rerankWith(seen: Seen[], asleep: boolean, features: Partial<EndpointFeatures>): Promise<ProviderError | null> {
  await using root = await createRuntimeRoot(engine(seen, asleep));
  const connection = await wireConnection(root, {
    task: "rerank",
    providerId: "vllm",
    model: "vendor/reranker",
    baseUrl: ENGINE_ROOT,
    key: RUNTIME_KEY,
    declared: { kind: "rerank", rerank: { maxInputTokens: 8192, input: ["text"], instructionAware: false }, features: { detectServer: false } },
  });
  // A state the stored schema refuses, built here so the request-time guard stands alone.
  const respelled: Resolved<"rerank"> = { ...connection, features: { ...connection.features, ...features } };
  const settled = await settledProviderError(() =>
    root.app.runtime.executor.rerank({
      signal: new AbortController().signal,
      connection: respelled,
      query: "control",
      documents: [{ id: "document", text: "control" }],
    }),
  );
  return settled.error;
}

const ASLEEP_PATH = "/is_sleeping";
const WAKE_PATH = "/wake_up";
const CASES = [
  { name: "a rerank path", asleep: false, features: { rerankPath: OFF_ORIGIN }, refused: true },
  { name: "a sleep check path", asleep: false, features: { sleep: { isSleepingPath: OFF_ORIGIN, wakePath: WAKE_PATH } }, refused: false },
  { name: "a wake path", asleep: true, features: { sleep: { isSleepingPath: ASLEEP_PATH, wakePath: OFF_ORIGIN } }, refused: true },
] as const;

test.for(CASES)("$name that resolves off the base URL's origin sends nothing there", async ({ asleep, features, refused }) => {
  const seen: Seen[] = [];
  const error = await rerankWith(seen, asleep, features);
  expect(offOrigin(seen)).toEqual([]);
  // A refused rerank or wake fails the task; a refused sleep check reads awake, and the rerank runs on the origin.
  expect(error?.kind ?? null).toBe(refused ? "invalid" : null);
  expect(seen.length).toBeGreaterThan(0);
});

test("the row's own plain paths send the rerank and the sleep check to the base URL's origin", async () => {
  const seen: Seen[] = [];
  const error = await rerankWith(seen, false, {});
  expect(error).toBeNull();
  expect(seen.map((request) => request.url)).toEqual([`${ENGINE_ROOT}${ASLEEP_PATH}`, `${ENGINE_ROOT}/rerank`]);
  expect(seen.map((request) => request.authorization)).toEqual([`Bearer ${RUNTIME_KEY}`, `Bearer ${RUNTIME_KEY}`]);
});
