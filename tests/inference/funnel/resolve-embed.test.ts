// funnel/resolve-embed — the embed width rule: the owner's space is the embedder's own stated width, so
// nothing is padded. An MRL model is asked for its stated width (which is how a declared shorter width is
// honoured); any other model is never shortened and is taken at the width it returns. An instruction rides
// only on an instruction-aware model, else a warning.

import type { EmbeddingCapability } from "@orb/contracts/inference";
import { resolveEmbed } from "../../../packages/inference/src/funnel/resolve-embed.ts";
import { expect, test } from "../../support/fixtures.ts";

function cap(dims: number, mrl: boolean, instructionAware = false): EmbeddingCapability {
  return { dims, mrl, maxInputTokens: 8192, input: ["text"], output: ["vector"], instructionAware };
}

test("an MRL model is asked for its stated width, so a declared shorter width reaches the wire", () => {
  expect(resolveEmbed({}, cap(3072, true))).toEqual({ dimensions: 3072, warnings: [] });
  expect(resolveEmbed({}, cap(512, true))).toEqual({ dimensions: 512, warnings: [] });
});

test("a non-MRL model is never asked for or cut to a width", () => {
  expect(resolveEmbed({}, cap(1536, false))).toEqual({ warnings: [] });
});

test("a narrower embedder is admitted at its own width", () => {
  expect(resolveEmbed({}, cap(384, false))).toEqual({ warnings: [] });
  expect(resolveEmbed({}, cap(768, true))).toEqual({ dimensions: 768, warnings: [] });
});

test("instruction and inputType ride per the capability", () => {
  const aware = resolveEmbed({ instruction: "Represent the query", inputType: "query" }, cap(1024, false, true));
  expect(aware).toEqual({ instruction: "Represent the query", inputType: "query", warnings: [] });
  const deaf = resolveEmbed({ instruction: "Represent the query" }, cap(1024, false, false));
  expect(deaf.instruction).toBeUndefined();
  expect(deaf.warnings.map((w) => w.code)).toEqual(["sampling_knob_dropped"]);
});
