// The one reader of a seed palette's static values at scope time. A seed's block retunes its hosts and inks away
// from anything a carried base derives, so a scope over a seed reads them here: its prose inks, the surfaces a
// pick is read on, and the tone palette its accent is judged on (D336, D355).
import type { CarriedToneHost, Oklch, TonePalette } from "@orb/kit/theme-derivation";
import { CARRIED_TONE_HOSTS, surfacePolarity } from "@orb/kit/theme-derivation";
import type { ProseInks } from "#lib";
import { PROSE_INK_FIELDS } from "#lib";
import { SEED_THEME_VALUE_SETS, TOKENS } from "#tokens";
import { compositedBase, toOklch } from "./color-parse.ts";

/** The token each prose field overrides, read for a seed's static value. */
const PROSE_INK_TOKENS = {
  speaker: "color.speaker",
  dialogueColor: "color.dialogue",
  narrationColor: "color.narration",
  bodyColor: "color.prose-body",
} as const satisfies Record<(typeof PROSE_INK_FIELDS)[number], keyof typeof TOKENS>;

/** A seed's value for a token, read through its base: the root palette's, or the value set that paints that base. `null` when no seed paints it. */
function seedValuesOf(background: string | undefined): ((token: keyof typeof TOKENS) => string) | null {
  const backgroundVar = TOKENS["color.background"].cssVar;
  const set = Object.values(SEED_THEME_VALUE_SETS).find(({ vars }) => (vars as Readonly<Record<string, string>>)[backgroundVar] === background);
  if (set === undefined && background !== TOKENS["color.background"].value) {
    return null;
  }
  const seeded = set?.vars as Readonly<Record<string, string>> | undefined;
  return (token) => seeded?.[TOKENS[token].cssVar] ?? TOKENS[token].value;
}

/** A seed's inks are static CSS that no scope hands down, so its base names them. */
export function seedInksOf(background: string | undefined): ProseInks {
  const seed = seedValuesOf(background);
  return seed === null ? {} : Object.fromEntries(PROSE_INK_FIELDS.map((field) => [field, seed(PROSE_INK_TOKENS[field])]));
}

const SEED_READING_HOSTS = ["color.card", "color.user-bubble", "color.ai-bubble", "color.system-bubble"] as const;

/** The surfaces a pick is read on over a seed: the ones it paints, which its generated block retunes away from the derived ramp. */
export function seedReadingHosts(background: string | undefined): readonly Oklch[] | null {
  const seed = seedValuesOf(background);
  return seed === null ? null : SEED_READING_HOSTS.flatMap((token) => toOklch(seed(token)) ?? []);
}

/**
 * The tone palette a seed paints: each ramp host as the pixel it shows over the seed's page, a translucent border
 * composited like the build's own read of the seed. `null` when no seed paints that base.
 */
export function seedTonePalette(background: string | undefined): TonePalette<CarriedToneHost> | null {
  const seed = seedValuesOf(background);
  if (seed === null) {
    return null;
  }
  const pixel = (token: keyof typeof TOKENS): Oklch => {
    const color = compositedBase(seed(token), seed("color.background"));
    if (color === null) {
      throw new Error(`seed token ${token} is not a parseable color`);
    }
    return { l: color.l, c: color.c, h: color.h };
  };
  const page = pixel("color.background");
  return {
    polarity: surfacePolarity(page),
    foreground: pixel("color.foreground"),
    background: page,
    host: page,
    hosts: Object.fromEntries(CARRIED_TONE_HOSTS.map((host) => [host, pixel(`color.${host}`)])) as Record<CarriedToneHost, Oklch>,
  };
}
