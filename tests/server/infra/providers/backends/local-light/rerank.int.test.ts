// biome-ignore-all lint/style/noProcessEnv: this gated E2E reads ONE opt-in env flag to decide whether
// to download real ONNX weights from the Hugging Face Hub. Default-OFF keeps the suite offline-green.
//
// REAL-MODEL integration test for the local-light RERANK role — downloads the default MS MARCO MiniLM
// cross-encoder on first run, so it is GATED behind ORB_LOCAL_LIGHT_E2E=1 (network). Forces device
// "cpu". Asserts the cross-encoder ranks the on-topic document above the off-topic one and preserves
// caller ids.

import process from "node:process";
import type { ModelId } from "@orb/kit/ids";
import type { RerankRequest, RerankResult } from "@orb/server/infra/providers";
import {
  createLocalLightBackend,
  DEFAULT_RERANK_MODEL,
} from "@orb/server/infra/providers/backends/local-light";
import { describe } from "vitest";
import { makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

const RUN = process.env["ORB_LOCAL_LIGHT_E2E"] === "1";
const suite = RUN ? describe : describe.skip;

const CRED = makeResolvedCredential("local-light");
const MODEL = DEFAULT_RERANK_MODEL as ModelId;
const DOWNLOAD_TIMEOUT_MS = 300_000;

const backend = RUN ? createLocalLightBackend({ device: "cpu" }) : null;

function rerankFn(): (req: RerankRequest) => Promise<RerankResult> {
  if (!backend) {
    throw new Error("Backend not initialized");
  }
  const fn = backend.rerank;
  if (fn === undefined) {
    throw new Error("rerank role not wired");
  }
  return fn;
}

suite("local-light rerank (real cross-encoder ONNX inference)", () => {
  test(
    "ranks the on-topic document first and keeps caller ids",
    async () => {
      const res = await rerankFn()({
        credential: CRED,
        model: MODEL,
        query: "What is the capital of France?",
        documents: [
          { id: "off-topic", text: "Bananas are a good source of potassium." },
          { id: "on-topic", text: "Paris is the capital and largest city of France." },
        ],
      });

      expect(res.hits).toHaveLength(2);
      expect(res.hits[0]?.id).toBe("on-topic");
      expect(res.hits[1]?.id).toBe("off-topic");
      // A cross-encoder produces a clearly higher relevance logit for the matching passage.
      expect(res.hits[0]?.score ?? 0).toBeGreaterThan(res.hits[1]?.score ?? 0);
    },
    DOWNLOAD_TIMEOUT_MS,
  );

  test(
    "honors topN by returning only the single best hit",
    async () => {
      const res = await rerankFn()({
        credential: CRED,
        model: MODEL,
        query: "What is the capital of France?",
        topN: 1,
        documents: [
          { id: "off-topic", text: "Bananas are a good source of potassium." },
          { id: "on-topic", text: "Paris is the capital and largest city of France." },
        ],
      });

      expect(res.hits).toHaveLength(1);
      expect(res.hits[0]?.id).toBe("on-topic");
    },
    DOWNLOAD_TIMEOUT_MS,
  );
});
