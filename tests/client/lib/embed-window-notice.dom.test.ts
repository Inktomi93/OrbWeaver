// The text embedder row's small-window notice: which resolved capabilities earn it. The card cap and the threshold
// come from their one contracts home, so a moved threshold moves these cases with it.
import { embedWindowNotice } from "@orb/client/lib";
import type { Capability } from "@orb/contracts/inference";
import { CARD_EMBED_WINDOW_TOKENS, EMBEDDING_FLOOR, GENERATION_FLOOR, LOCAL_TEXT_ENCODING, SMALL_EMBED_WINDOW_TOKENS } from "@orb/contracts/inference";
import { groupThousands } from "@orb/kit/strings";
import { expect, test } from "@orb/testkit/node";

function embedderWithWindow(maxInputTokens: number, local = false): Capability {
  return { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, maxInputTokens, ...(local ? { localTextEncoding: LOCAL_TEXT_ENCODING } : {}) } };
}

test.for([
  { label: "a window one token under the threshold", capability: embedderWithWindow(SMALL_EMBED_WINDOW_TOKENS - 1), shownFor: SMALL_EMBED_WINDOW_TOKENS - 1 },
  {
    label: "the unknown-model floor's guessed window",
    capability: { kind: "embedding", embedding: EMBEDDING_FLOOR },
    shownFor: EMBEDDING_FLOOR.maxInputTokens,
  },
] as const)("$label names the window it reads", ({ capability, shownFor }) => {
  expect(embedWindowNotice(capability)).toContain(groupThousands(shownFor));
});

test.for([
  { label: "a window at the threshold", capability: embedderWithWindow(SMALL_EMBED_WINDOW_TOKENS) },
  { label: "a window one token under the card cap", capability: embedderWithWindow(CARD_EMBED_WINDOW_TOKENS - 1) },
  { label: "a small window on a local encoder, which windows long text without loss", capability: embedderWithWindow(SMALL_EMBED_WINDOW_TOKENS - 1, true) },
  { label: "a capability that is not an embedder", capability: { kind: "generation", generation: GENERATION_FLOOR } },
  { label: "a role with nothing bound", capability: null },
] as const)("$label gets no notice", ({ capability }) => {
  expect(embedWindowNotice(capability)).toBeNull();
});
