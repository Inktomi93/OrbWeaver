// funnel/resolve-embed — embed admission (§10): exact width ⇒ nothing; wider + MRL ⇒ `dimensions`; wider
// non-MRL ⇒ client-side `truncateTo`; NARROWER ⇒ refused (a padded vector poisons the store, #1635); an
// instruction rides only on an instruction-aware model, else a warning.

import type { EmbeddingCapability } from "@orb/contracts/inference";
import { ProviderError } from "../../../packages/inference/src/contract/errors.ts";
import { resolveEmbed } from "../../../packages/inference/src/funnel/resolve-embed.ts";
import { expect, test } from "../../support/fixtures.ts";

function cap(dims: number, mrl: boolean, instructionAware = false): EmbeddingCapability {
  return { dims, mrl, maxInputTokens: 8192, input: ["text"], output: ["vector"], instructionAware };
}

test("exact width asks for nothing", () => {
  expect(resolveEmbed({}, cap(1024, false), 1024)).toEqual({ warnings: [] });
});

test("a wider MRL model is asked for the space width; a wider non-MRL model is truncated client-side", () => {
  expect(resolveEmbed({}, cap(2048, true), 1024)).toEqual({ dimensions: 1024, warnings: [] });
  expect(resolveEmbed({}, cap(1536, false), 1024)).toEqual({ truncateTo: 1024, warnings: [] });
});

function caught(fn: () => unknown): unknown {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  return thrown;
}

test("a narrower model is refused up front — never padded", () => {
  const err = caught(() => resolveEmbed({}, cap(768, true), 1024));
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "invalid", retryable: false });
});

test("instruction and inputType ride per the capability", () => {
  const aware = resolveEmbed({ instruction: "Represent the query", inputType: "query" }, cap(1024, false, true), 1024);
  expect(aware).toEqual({ instruction: "Represent the query", inputType: "query", warnings: [] });
  const deaf = resolveEmbed({ instruction: "Represent the query" }, cap(1024, false, false), 1024);
  expect(deaf.instruction).toBeUndefined();
  expect(deaf.warnings.map((w) => w.code)).toEqual(["sampling_knob_dropped"]);
});
