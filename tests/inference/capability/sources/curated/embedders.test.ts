// Curated kinds — a family row and a model row can both match one id. Rows compose in file order and a later row
// refines an earlier one, so a Qwen embedder or reranker reads as its own kind, not the Qwen family's generation.

import { curatedKind } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a Qwen embedder or reranker takes its own row's kind over the Qwen family's generation", () => {
  const kinds = Object.fromEntries(
    ["Qwen/qwen3-embedding-8b", "qwen3-embedding:8b", "Qwen/Qwen3-VL-Embedding-2B", "Qwen/Qwen3-VL-Reranker-2B", "Qwen/Qwen3-32B"].map((model) => [
      model,
      curatedKind({ model }),
    ]),
  );
  expect(kinds).toEqual({
    "Qwen/qwen3-embedding-8b": "embedding",
    "qwen3-embedding:8b": "embedding",
    "Qwen/Qwen3-VL-Embedding-2B": "embedding",
    "Qwen/Qwen3-VL-Reranker-2B": "rerank",
    "Qwen/Qwen3-32B": "generation",
  });
});
