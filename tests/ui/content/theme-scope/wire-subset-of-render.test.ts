import { themeOverrideSchema } from "@orb/contracts/theme";
import { expect, test } from "@orb/testkit/node";
import { THEME_OVERRIDE_COLOR_VARS } from "@orb/ui/theme-scope/emit-vars";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";

// The wire schema asks one more question than the render clamp (renderable, not only safe), so a value the wire
// keeps must never be dropped by the render clamp: a stored theme would otherwise vanish at paint time.
const SEED_COLORS = Object.values(SEED_THEME_VALUE_SETS).flatMap((set) => Object.values(set.vars).filter((value) => /^(?:oklch|#)/u.test(value)));
const AUTHORED = [
  "red",
  "rebeccapurple",
  "transparent",
  "currentColor",
  "CanvasText",
  "inherit",
  "#fff",
  "#ffffff80",
  "rgb(1 2 3 / 50%)",
  "rgba(10%, 20%, 30%, .4)",
  "hsl(120deg 50% 50%)",
  "oklch(0.7 0.19 40 / 0.55)",
  "oklab(0.7 0.1 -0.1)",
  " #fff ",
];
const REFUSED_BY_WIRE = ["notacolorxx", "rgb(1..2 0 0)", "rgb(,,)", "hsl(ddd)", "oklch(. . .)", "url(//x)", "red; color: blue", "var(--x)"];
const CORPUS = [...SEED_COLORS, ...AUTHORED, ...REFUSED_BY_WIRE];

interface Probe {
  readonly field: string;
  readonly wire: (color: string) => unknown;
  readonly cssVar: string;
}
const flat = (field: "accent" | "speaker" | "dialogueColor" | "narrationColor" | "bodyColor" | "background" | "borderColor"): Probe => ({
  field,
  wire: (color) => themeOverrideSchema.parse({ [field]: color })[field],
  cssVar: THEME_OVERRIDE_COLOR_VARS[field],
});
const bubble = (field: "userBubble" | "aiBubble" | "systemBubble"): Probe => ({
  field: `${field}.bg`,
  wire: (color) => themeOverrideSchema.parse({ [field]: { bg: color } })[field]?.bg,
  cssVar: THEME_OVERRIDE_COLOR_VARS[field].bg,
});
const PROBES: readonly Probe[] = [
  flat("accent"),
  flat("speaker"),
  flat("dialogueColor"),
  flat("narrationColor"),
  flat("bodyColor"),
  flat("background"),
  flat("borderColor"),
  bubble("userBubble"),
  bubble("aiBubble"),
  bubble("systemBubble"),
];

test.each(PROBES)("every $field value the wire schema keeps survives the render clamp", ({ field, wire, cssVar }) => {
  const kept: string[] = [];
  for (const color of CORPUS) {
    if (wire(color) === undefined) {
      continue;
    }
    kept.push(color);
    const raw = field.endsWith(".bg") ? { [field.slice(0, -3)]: { bg: color } } : { [field]: color };
    expect(clampThemeTokens(raw).vars[cssVar], `${field}: ${color}`).toBeDefined();
  }
  // Non-vacuous: the corpus must hold values the wire keeps, and values only the render clamp would keep.
  expect(kept.length).toBeGreaterThan(REFUSED_BY_WIRE.length);
  expect(kept).not.toContain("notacolorxx");
});

test("the render clamp alone still keeps a safe word the wire schema drops", () => {
  expect(themeOverrideSchema.parse({ borderColor: "notacolorxx" }).borderColor).toBeUndefined();
  expect(clampThemeTokens({ borderColor: "notacolorxx" }).vars["--color-border"]).toBe("notacolorxx");
});
