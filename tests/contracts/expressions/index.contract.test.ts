import {
  characterSpriteViewSchema,
  EXPRESSION_LABELS,
  expressionLabelSchema,
  generateSpriteSheetSchema,
  setSpriteSchema,
} from "@orb/contracts/expressions";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("EXPRESSION_LABELS is the GoEmotions 28 seed set (neutral last)", () => {
  expect(EXPRESSION_LABELS).toHaveLength(28);
  expect(EXPRESSION_LABELS).toContain("joy");
  expect(EXPRESSION_LABELS.at(-1)).toBe("neutral");
});

test("expressionLabelSchema normalizes then validates (trim → NFKC → lowercase)", () => {
  expect(expressionLabelSchema.parse("  Joy  ")).toBe("joy");
  expect(expressionLabelSchema.parse("ANGER")).toBe("anger");
  // custom label allowed
  expect(expressionLabelSchema.parse("smug")).toBe("smug");
  expect(expressionLabelSchema.parse("battle-ready")).toBe("battle-ready");
});

test("expressionLabelSchema rejects spaces, empties, and over-length labels", () => {
  expect(expressionLabelSchema.safeParse("my label").success).toBe(false);
  expect(expressionLabelSchema.safeParse("").success).toBe(false);
  expect(expressionLabelSchema.safeParse("a".repeat(33)).success).toBe(false);
  // 32 chars is the ceiling — accepted.
  expect(expressionLabelSchema.safeParse("a".repeat(32)).success).toBe(true);
});

test("setSpriteSchema requires a branded character + asset id and a valid label", () => {
  const parsed = setSpriteSchema.parse({
    characterId: mintTypeId(ID_PREFIX.character),
    label: "Joy",
    assetId: mintTypeId(ID_PREFIX.asset),
  });
  expect(parsed.label).toBe("joy");
  const bad = setSpriteSchema.safeParse({ characterId: "nope", label: "joy", assetId: "x" });
  expect(bad.success).toBe(false);
});

test("generateSpriteSheetSchema bounds labels 1..8, style ≤600, matte defaults flood", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  const ok = generateSpriteSheetSchema.parse({ characterId, labels: ["joy", "anger"] });
  expect(ok.matte).toBe("flood");
  expect(generateSpriteSheetSchema.safeParse({ characterId, labels: [] }).success).toBe(false);
  expect(
    generateSpriteSheetSchema.safeParse({
      characterId,
      labels: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    }).success,
  ).toBe(false);
  expect(
    generateSpriteSheetSchema.safeParse({
      characterId,
      labels: ["joy"],
      stylePrompt: "x".repeat(601),
    }).success,
  ).toBe(false);
});

test("characterSpriteViewSchema round-trips the { kind:'asset', id } render payload", () => {
  const view = {
    characterId: mintTypeId(ID_PREFIX.character),
    label: "joy",
    asset: { kind: "asset" as const, id: mintTypeId(ID_PREFIX.asset) },
  };
  expect(characterSpriteViewSchema.parse(view)).toEqual(view);
});
