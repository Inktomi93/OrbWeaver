// backends/openai-compat/rerank — the hosted window guard at the resolver's smallest window. The client-side clamp
// reserves a fixed scaffold budget, so a window at the floor leaves the query nothing: the call is refused as invalid
// before anything is sent, never posted as an empty query the engine would score. The floor is a no-op here; this pins it.

import { RERANK_FLOOR, RERANK_MIN_WINDOW_TOKENS } from "@orb/contracts/inference";
import { runOpenAiCompatRerank } from "../../../../packages/inference/src/backends/openai-compat/rerank.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { scriptedJsonFetch } from "../_hosted-support.ts";

const RERANKED = JSON.stringify({ results: [{ index: 0, relevance_score: 0.9 }] });

function hostedReranker(maxInputTokens: number): ReturnType<typeof fakeResolved<"rerank">> {
  return fakeResolved({
    task: "rerank",
    providerId: "openrouter",
    model: "cohere/rerank-v3.5",
    capability: { kind: "rerank", rerank: { ...RERANK_FLOOR, maxInputTokens } },
    secret: fakeApiKeySecret("test-key"),
    declaredFeatures: { rerankPath: "/rerank" },
  });
}

function depsWith(recorded: RecordedRequest[]): Parameters<typeof runOpenAiCompatRerank>[1] {
  return {
    fetch: scriptedJsonFetch([RERANKED], recorded),
    normalize: () => Promise.reject(new Error("no image rides a text rerank")),
    log: fakeDeps().log,
  };
}

test("a hosted reranker at the minimum window is refused before anything is sent", async () => {
  const recorded: RecordedRequest[] = [];
  const request = { connection: hostedReranker(RERANK_MIN_WINDOW_TOKENS), query: "Which planet is red?", documents: [{ id: "a", text: "Mars is red." }] };
  await expect(runOpenAiCompatRerank(request, depsWith(recorded))).rejects.toMatchObject({ kind: "invalid", retryable: false });
  expect(recorded).toEqual([]);
});

test("the same call at an ordinary window is sent", async () => {
  const recorded: RecordedRequest[] = [];
  const request = { connection: hostedReranker(RERANK_FLOOR.maxInputTokens), query: "Which planet is red?", documents: [{ id: "a", text: "Mars is red." }] };
  const result = await runOpenAiCompatRerank(request, depsWith(recorded));
  expect(recorded).toHaveLength(1);
  expect(result.hits.map((hit) => hit.id)).toEqual(["a"]);
});
