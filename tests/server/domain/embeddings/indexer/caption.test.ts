// analyzeAvatarImage — the ONE avatar-analysis call. Pins the header's load-bearing claim: FAILURE IS THE
// EXISTING SKIP, NOT A HALF ROW — a validated-but-blank caption AND a structured-turn failure both collapse
// to the same facetless skip shape (`caption: "", captionMeta: { model }`), never a captioned-but-facetless
// row (the backfill pre-check reads exactly that shape as "work remaining").

import type { ImageBreakdown } from "@orb/contracts/embeddings";
import { describe } from "vitest";
import { analyzeAvatarImage } from "../../../../../packages/server/src/domain/embeddings/indexer/caption.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRoleClients, TEST_CAPTION } from "../_support.ts";

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

describe("analyzeAvatarImage", () => {
  test("a well-formed breakdown returns the caption plus every facet in captionMeta", async () => {
    const roleClients = makeRoleClients();
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result.caption).toBe(TEST_CAPTION);
    expect(result.captionMeta.model).toBe(roleClients.summarizerModel);
    expect(result.captionMeta).toHaveProperty("artStyle");
  });

  test("a validated-but-blank caption skips (facetless, empty caption) — never a captioned-but-facetless row", async () => {
    const roleClients = makeRoleClients();
    roleClients.summarize.mockResolvedValueOnce({
      items: [{ text: JSON.stringify({ ...VALID_BREAKDOWN, caption: "   " }), usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
      model: roleClients.summarizerModel,
    });
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result).toEqual({ caption: "", captionMeta: { model: roleClients.summarizerModel } });
  });

  test("a structured-turn failure (schema validation fails twice) skips to the same facetless shape", async () => {
    const roleClients = makeRoleClients();
    roleClients.summarize.mockRejectedValue(new Error("backend refused responseFormat"));
    const result = await analyzeAvatarImage(roleClients, BYTES);
    expect(result).toEqual({ caption: "", captionMeta: { model: roleClients.summarizerModel } });
  });

  test("resolves the analysis via the summarize role, passing the image bytes through", async () => {
    const roleClients = makeRoleClients();
    await analyzeAvatarImage(roleClients, BYTES);
    const [call] = roleClients.summarize.mock.calls;
    expect(call?.[0][0]?.images).toEqual([BYTES]);
  });
});
