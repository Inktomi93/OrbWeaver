// analyzeAvatarImage — the ONE avatar-analysis call. Pins the header's load-bearing claim: FAILURE IS THE
// EXISTING SKIP, NOT A HALF ROW — a validated-but-blank caption AND a structured-turn failure both collapse
// to the same facetless skip shape (`caption: "", captionMeta: { model }`), never a captioned-but-facetless
// row (the backfill pre-check reads exactly that shape as "work remaining").

import type { ImageBreakdown } from "@orb/contracts/embeddings";
import { beforeEach, describe } from "vitest";
import { analyzeAvatarImage } from "../../../../../packages/server/src/domain/embeddings/indexer/caption.ts";
import { __resetAvatarAnalysisAvailability } from "../../../../../packages/server/src/domain/embeddings/substrate/avatar-analysis-availability.ts";
import { ProviderError } from "@orb/inference";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRoleClients, TEST_CAPTION } from "../_support.ts";
import { FAKE_SUMMARIZE_MODEL } from "../../../../support/factories/role-clients.ts";

const BYTES = new Uint8Array([1, 2, 3]);

const VALID_BREAKDOWN = {
  caption: TEST_CAPTION,
  artStyle: "anime",
  palette: "warm",
  mood: "cheerful",
  rating: "safe",
  shotType: "portrait",
  cameraAngle: "eye-level",
  gender: "female",
  coverage: "fully-covered",
  bodyType: "average",
  chestSize: "medium",
  skinTone: "fair",
  outfitType: "casual",
  clothingState: "intact",
  nudityLevel: "none",
  exposedParts: [],
  tags: ["test", "portrait", "fixture"],
} as const satisfies ImageBreakdown;

// The per-process latch is module state, so every test starts from a cold one — otherwise the first test to
// latch a model would decide the outcome of every later test that names the same model.
beforeEach(() => {
  __resetAvatarAnalysisAvailability();
});

describe("analyzeAvatarImage", () => {
  test("a well-formed breakdown returns the caption plus every facet in captionMeta", async () => {
    const roleClients = makeRoleClients();
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result.caption).toBe(TEST_CAPTION);
    expect(result.captionMeta.model).toBe(FAKE_SUMMARIZE_MODEL);
    expect(result.captionMeta).toHaveProperty("artStyle");
  });

  test("a validated-but-blank caption skips (facetless, empty caption) — never a captioned-but-facetless row", async () => {
    const roleClients = makeRoleClients();
    roleClients.structured.mockResolvedValueOnce({
      items: [{ text: JSON.stringify({ ...VALID_BREAKDOWN, caption: "   " }), usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
      model: FAKE_SUMMARIZE_MODEL,
    });
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result).toEqual({ caption: "", captionMeta: { model: FAKE_SUMMARIZE_MODEL } });
  });

  test("a structured-turn failure (schema validation fails twice) skips to the same facetless shape", async () => {
    const roleClients = makeRoleClients();
    roleClients.structured.mockRejectedValue(new Error("backend refused responseFormat"));
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result).toEqual({ caption: "", captionMeta: { model: FAKE_SUMMARIZE_MODEL } });
  });

  test("resolves the analysis via the summarize role, passing the image bytes through", async () => {
    const roleClients = makeRoleClients();
    await analyzeAvatarImage(roleClients, BYTES);
    const [call] = roleClients.structured.mock.calls;
    expect(call?.[0][0]?.images).toEqual([BYTES]);
  });
});

// #2422 — A VERDICT ABOUT THE MODEL IS ASKED ONCE, NOT ONCE PER ASSET. The indexer used to spend one provider
// call per avatar, every sweep, to rediscover the same "that model does not exist" — and on a local engine the
// first of those calls WAKES the fleet. Both arms below assert the CALL COUNT, because the count is the defect:
// the returned skip shape was always correct.
describe("analyzeAvatarImage — the model-level verdicts are process-scoped", () => {
  test("a backend that does not serve the model is asked ONCE, and every later asset skips without a call", async () => {
    const roleClients = makeRoleClients();
    roleClients.structured.mockRejectedValue(
      new ProviderError({ kind: "model_unavailable", retryable: false, message: "model not found", apiErrorStatus: 404, model: FAKE_SUMMARIZE_MODEL }),
    );

    const first = await analyzeAvatarImage(roleClients, BYTES);
    const second = await analyzeAvatarImage(roleClients, BYTES);
    const third = await analyzeAvatarImage(roleClients, BYTES);

    expect(roleClients.summarize).toHaveBeenCalledTimes(1);
    for (const result of [first, second, third]) {
      expect(result).toEqual({ caption: "", captionMeta: { model: FAKE_SUMMARIZE_MODEL } });
    }
  });

  test("a summarize model that declares no image input never reaches the provider at all", async () => {
    const roleClients = makeRoleClients(false);
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(roleClients.summarize).not.toHaveBeenCalled();
    expect(result).toEqual({ caption: "", captionMeta: { model: FAKE_SUMMARIZE_MODEL } });
  });

  test("a vision-capable model still runs the analysis for every asset — the latch is not a blanket off-switch", async () => {
    const roleClients = makeRoleClients();
    const first = await analyzeAvatarImage(roleClients, BYTES);
    const second = await analyzeAvatarImage(roleClients, BYTES);
    expect(roleClients.summarize).toHaveBeenCalledTimes(2);
    expect(first.caption).toBe(TEST_CAPTION);
    expect(second.caption).toBe(TEST_CAPTION);
  });

  test("an ORDINARY failure keeps the retry-next-sweep contract — it is about the image, not the model", async () => {
    const roleClients = makeRoleClients();
    roleClients.structured.mockRejectedValue(new Error("backend refused responseFormat"));
    await analyzeAvatarImage(roleClients, BYTES);
    await analyzeAvatarImage(roleClients, BYTES);
    expect(roleClients.summarize).toHaveBeenCalledTimes(2);
  });
});
