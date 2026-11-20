// The seed palette reader: what a scope over a seed reads of that seed's own values, never what a carried base would derive.
import { expect, test } from "@orb/testkit/node";
import { PROSE_INK_FIELDS } from "@orb/ui/lib";
import type { TOKENS } from "@orb/ui/tokens";
import { seedInksOf, seedReadingHosts, seedTonePalette } from "../../../../packages/ui/src/content/theme-scope/seed-palette.ts";
import { parsed, SEED_PAGES } from "./tone-scope-misses.ts";

/** The token each prose field takes its seed ink from. */
const INK_TOKENS = {
  speaker: "color.speaker",
  dialogueColor: "color.dialogue",
  narrationColor: "color.narration",
  bodyColor: "color.prose-body",
} as const satisfies Record<(typeof PROSE_INK_FIELDS)[number], keyof typeof TOKENS>;

/** The surfaces a pick is read on over a seed. */
const READING_TOKENS = ["color.card", "color.user-bubble", "color.ai-bubble", "color.system-bubble"] as const satisfies readonly (keyof typeof TOKENS)[];

const UNPAINTED = "oklch(0.5 0.01 60)";

for (const { name, background, polarity, value } of SEED_PAGES) {
  test(`the ${name} palette names its own prose inks`, () => {
    expect(seedInksOf(background)).toEqual(Object.fromEntries(PROSE_INK_FIELDS.map((field) => [field, value(INK_TOKENS[field])])));
  });

  test(`the ${name} palette is read on the card and the three bubble fills it paints`, () => {
    expect(seedReadingHosts(background)).toEqual(READING_TOKENS.map((token) => parsed(value(token))));
  });

  test(`the ${name} palette's tone palette is the seed's own hosts, composited over its page`, () => {
    const palette = seedTonePalette(background);
    if (palette === null) {
      throw new Error(`${name} paints no seed palette`);
    }
    const { l, c, h } = parsed(value("color.card"));
    expect(palette.hosts.card).toEqual({ l, c, h });
    expect(palette.polarity).toBe(polarity);
    // The border is translucent over the page, so its pixel is not its authored lightness.
    expect(palette.hosts.border.l).not.toBe(parsed(value("color.border")).l);
  });
}

test("a base no seed paints, or none at all, has no seed palette, inks or reading hosts", () => {
  for (const base of [UNPAINTED, undefined]) {
    expect(seedTonePalette(base)).toBeNull();
    expect(seedInksOf(base)).toEqual({});
    expect(seedReadingHosts(base)).toBeNull();
  }
});
