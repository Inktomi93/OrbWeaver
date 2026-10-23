import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ThemeOverride } from "@orb/contracts/theme";
import { cardEmbeddableSubset, themeBackgroundSchema, themeOverrideSchema } from "@orb/contracts/theme";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const COMPLETE_OVERRIDE = {
  accent: "#bc784a",
  userBubble: { bg: "#102030", fg: "#eeeeee" },
  aiBubble: { bg: "#203040", fg: "#dddddd" },
  systemBubble: { bg: "#304050", fg: "#cccccc" },
  speaker: "#ca9856",
  dialogueColor: "#c0c0c0",
  narrationColor: "#b0b0b0",
  bodyColor: "#e0e0e0",
  font: "Georgia",
  radius: "full",
  background: "#121212",
  borderColor: "#565656",
  density: "compact",
} satisfies Required<ThemeOverride>;

test("every authored card appearance field survives while viewer density does not", () => {
  const { density, ...cardFields } = COMPLETE_OVERRIDE;
  expect(themeOverrideSchema.parse(COMPLETE_OVERRIDE)).toEqual(COMPLETE_OVERRIDE);
  expect(density).toBe("compact");
  expect(cardEmbeddableSubset(COMPLETE_OVERRIDE)).toEqual(cardFields);
  expect(cardEmbeddableSubset({ density })).toEqual({});
});

test("projection preserves absence and omits explicitly undefined fields", () => {
  expect(cardEmbeddableSubset({ accent: COMPLETE_OVERRIDE.accent })).toStrictEqual({ accent: COMPLETE_OVERRIDE.accent });
  expect(cardEmbeddableSubset({ accent: COMPLETE_OVERRIDE.accent, font: undefined, aiBubble: undefined })).toStrictEqual({
    accent: COMPLETE_OVERRIDE.accent,
  });
  expect(cardEmbeddableSubset({ accent: undefined, density: "compact" })).toStrictEqual({});
  expect(cardEmbeddableSubset({})).toStrictEqual({});
});

test("density is the deliberate appearance overlap and chat style stays viewer-owned", () => {
  const appearance = appearanceSettingsSchema.parse({ density: "compact", chatStyle: "flat" });
  const overlap = Object.keys(themeOverrideSchema.shape).filter((key) => Object.hasOwn(appearance, key));
  expect(overlap).toEqual(["density"]);
  expect(appearance.density).toBe("compact");
  expect(appearance.chatStyle).toBe("flat");
  expect(themeOverrideSchema.parse({ chatStyle: "flat" })).toEqual({});
});

test("carried backgrounds keep their source but strip viewer treatment", ({ ids }) => {
  const source = {
    kind: "asset",
    externalUrl: "",
    assetId: ids.next(ID_PREFIX.asset),
    assetHash: "scene-content-hash",
    mime: "image/png",
    provenanceUrl: "https://example.com/scene.png",
  } as const;
  const treatment = { backgroundFit: "contain", backgroundDim: 0.6, backgroundBlur: 4 } as const;
  const appearance = appearanceSettingsSchema.parse(treatment);
  expect(appearance).toMatchObject(treatment);
  expect(themeBackgroundSchema.parse({ ...source, ...treatment, fit: "contain", dim: 0.4, blur: 4 })).toStrictEqual(source);
});
