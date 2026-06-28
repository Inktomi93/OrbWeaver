// backends/openrouter rerank — the HOSTED arm is a typed not-supported throw (the "rerank-hosted gap"
// decision: flagged, not faked). The local backends remain the rerank path.

import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RerankRequest } from "@orb/server/infra/providers";
import { ProviderError } from "@orb/server/infra/providers";
import { runRerank } from "@orb/server/infra/providers/backends/openrouter";
import { describe, expect, test } from "vitest";

const CRED = {
  source: "openrouter",
  apiKey: "sk-or-secret",
  credentialId: null,
} as unknown as ResolvedCredential;

const RERANK_MODEL = "qwen/qwen3-reranker";
const MODEL_IN_MESSAGE = /qwen\/qwen3-reranker/;

const REQ: RerankRequest = {
  credential: CRED,
  model: castId<ModelId>(RERANK_MODEL),
  query: "q",
  documents: [{ id: "d1", text: "a" }],
};

describe("runRerank", () => {
  test("rejects with a typed not-supported ProviderError naming the model", async () => {
    await expect(runRerank(REQ)).rejects.toBeInstanceOf(ProviderError);
    await expect(runRerank(REQ)).rejects.toMatchObject({ kind: "invalid", retryable: false });
    await expect(runRerank(REQ)).rejects.toThrow(MODEL_IN_MESSAGE);
  });
});
