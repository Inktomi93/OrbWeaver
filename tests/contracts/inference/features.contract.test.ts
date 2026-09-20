// contracts/inference/features — the endpoint quirk block and the belt denylist. `foldFeatures` is the
// behaviour: wire default ← provider row ← connection.declared, FIELD-WISE, with `concurrency` merged one
// level deeper. Field-wise is the whole point — a connection that sets only `prefill` must keep the
// provider's `sleep` pair, or overriding one quirk silently disables wake-on-next-turn. The belt list is the
// other half: those eight keys are dropped from a user's `extras`, and `isBeltOwnedBodyKey` is the ONE
// predicate both the server's belt and the client's Extras editor read.

import { BELT_OWNED_BODY_KEYS, endpointFeaturesSchema, foldFeatures, isBeltOwnedBodyKey, WIRE_DEFAULT_FEATURES } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("an empty fold is the WIRE default, not an empty object", () => {
  expect(foldFeatures()).toEqual(WIRE_DEFAULT_FEATURES);
  expect(foldFeatures(undefined, undefined)).toEqual(WIRE_DEFAULT_FEATURES);
});

test("the fold is FIELD-WISE — a connection overriding one quirk keeps the provider's others", () => {
  const providerRow = { prefill: "continue-final-message", sleep: { isSleepingPath: "/is_sleeping", wakePath: "/wake_up" }, rerankPath: "/rerank" } as const;
  const folded = foldFeatures(providerRow, { prefill: "none" });
  expect(folded.prefill).toBe("none");
  expect(folded.sleep, "a row that sets only `prefill` must keep the provider's wake pair").toEqual(providerRow.sleep);
  expect(folded.rerankPath).toBe("/rerank");
});

test("`concurrency` merges ONE LEVEL DEEPER — overriding embed keeps the wire's summarize cap", () => {
  const folded = foldFeatures({ concurrency: { embed: 1 } });
  expect(folded.concurrency?.embed).toBe(1);
  expect(folded.concurrency?.summarize).toBe(WIRE_DEFAULT_FEATURES.concurrency?.summarize);
  expect(folded.concurrency?.imageEmbed).toBe(WIRE_DEFAULT_FEATURES.concurrency?.imageEmbed);
});

test("later layers win, in argument order", () => {
  expect(foldFeatures({ strictJson: "default-on" }, { strictJson: "never" }).strictJson).toBe("never");
  expect(foldFeatures({ strictJson: "never" }, { strictJson: "default-on" }).strictJson).toBe("default-on");
});

test("the schema keeps every quirk enum closed — an unknown spelling is refused, not carried", () => {
  expect(endpointFeaturesSchema.safeParse({ prefill: "continue-final-message" }).success).toBe(true);
  expect(endpointFeaturesSchema.safeParse({ prefill: "prefill" }).success).toBe(false);
  expect(endpointFeaturesSchema.safeParse({ strictJson: "always" }).success).toBe(false);
  expect(endpointFeaturesSchema.safeParse({ outputCapField: "max_output_tokens" }).success).toBe(false);
  expect(endpointFeaturesSchema.safeParse({ images: "images-api" }).success).toBe(true);
  expect(endpointFeaturesSchema.safeParse({ sleep: { isSleepingPath: "/is_sleeping" } }).success, "the sleep pair is both paths or neither").toBe(false);
});

test("`reasoningKeys` is an ORDERED non-empty-string list — the 0.26 rename is read in order", () => {
  expect(endpointFeaturesSchema.parse({ reasoningKeys: ["reasoning", "reasoning_content"] }).reasoningKeys).toEqual(["reasoning", "reasoning_content"]);
  expect(endpointFeaturesSchema.safeParse({ reasoningKeys: [""] }).success).toBe(false);
});

test("the belt list is the eight wire-owned keys, and the predicate agrees with it", () => {
  expect([...BELT_OWNED_BODY_KEYS].toSorted()).toEqual(
    [
      "add_generation_prompt",
      "continue_final_message",
      "messages",
      "model",
      "stream",
      "stream_options",
      "truncate_prompt_tokens",
      "truncation_side",
    ].toSorted(),
  );
  for (const key of BELT_OWNED_BODY_KEYS) {
    expect(isBeltOwnedBodyKey(key), `${key} must be belt-owned`).toBe(true);
  }
  for (const userKey of ["temperature", "top_p", "max_tokens", "stop", ""]) {
    expect(isBeltOwnedBodyKey(userKey), `${userKey} is the user's to set`).toBe(false);
  }
});
