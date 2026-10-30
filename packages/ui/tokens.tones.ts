// D336 tone roles in the token build: the scoped `[data-tone]` blocks, their Tailwind registration, the recipe map
// the clamp and tests read, and the floor check that fails a shipped palette under a role floor.
// A role is never a :root variable: a root formula freezes to the root palette, so it resolves on the stamped element.
import type { CarriedToneHost, Oklch, TonePalette, ToneRoleRecipe, ToneSource } from "@orb/kit/theme-derivation";
import { CARRIED_TONE_HOSTS, compositeSrgb, oklchToSrgb, srgbToOklch, toneFloorMisses } from "@orb/kit/theme-derivation";
import type { ContractToken, DerivedOutput, GeneratedCssValue, TokenContractResult } from "./token-contract.ts";
import { NEUTRAL_TONE, TONE_MIX_GROUP, TONE_ROLE_PREFIX } from "./token-contract.ts";

type MixStep = Exclude<DerivedOutput["colored"], string>;
type Recipe = ToneRoleRecipe<string, string, CarriedToneHost>;

interface ToneRole {
  readonly name: string;
  readonly token: ContractToken;
  readonly derived: DerivedOutput;
  readonly recipe: Recipe;
}

/** The tone vocabulary the vault declares, read once for every emitter below. */
export interface ToneModel {
  readonly tones: readonly string[];
  readonly roles: readonly ToneRole[];
  readonly knobs: readonly string[];
  readonly defaults: Readonly<Record<string, number>>;
}

const DTCG_ALIAS_RE = /^\{([^{}]+)\}$/u;
const OKLCH_COMPONENTS = 3;
const MIX_TARGET_CSS = { foreground: "var(--color-foreground)", background: "var(--color-background)", away: "light-dark(black, white)" } as const;

function aliasTail(alias: string, group: string): string {
  const path = DTCG_ALIAS_RE.exec(alias)?.[1];
  if (path?.startsWith(`${group}.`) !== true) {
    throw new Error(`${alias} escaped tone contract validation (expected a ${group}.* alias)`);
  }
  return path.slice(group.length + 1);
}

function hostOf(alias: string): CarriedToneHost {
  const name = aliasTail(alias, "color");
  const host = CARRIED_TONE_HOSTS.find((candidate) => candidate === name);
  if (host === undefined) {
    throw new Error(`${alias} escaped tone contract validation (not a carried host)`);
  }
  return host;
}

function stepOf(step: MixStep): { readonly mix: string; readonly toward: MixStep["toward"] } {
  return { mix: aliasTail(step.mix, TONE_MIX_GROUP), toward: step.toward };
}

function floorSurface(alias: string): { readonly role: string } | { readonly host: CarriedToneHost } {
  const name = aliasTail(alias, "color");
  return name.startsWith(TONE_ROLE_PREFIX) ? { role: name.slice(TONE_ROLE_PREFIX.length) } : { host: hostOf(alias) };
}

export function toneModel(contract: TokenContractResult): ToneModel {
  const roles = contract.baseTokens.flatMap((token): ToneRole[] => {
    if (token.derived === null || typeof token.value !== "string") {
      return [];
    }
    const { colored, neutral, floor } = token.derived;
    const recipe: Recipe = {
      colored: typeof colored === "string" ? colored : stepOf(colored),
      neutral: neutral === undefined ? { bind: hostOf(token.value) } : { bind: hostOf(token.value), step: stepOf(neutral) },
      floor: (floor ?? []).map(floorSurface),
    };
    return [{ name: (token.path[1] ?? "").slice(TONE_ROLE_PREFIX.length), token, derived: token.derived, recipe }];
  });
  const mixTokens = contract.baseTokens.filter((token) => token.path[0] === TONE_MIX_GROUP);
  const defaults = Object.fromEntries(mixTokens.map((token) => [token.path[1] ?? "", Number(token.value)]));
  return { tones: contract.tones, roles, knobs: Object.keys(defaults), defaults };
}

/** A tone's own step knob, `--tone-mix-<tone>-<knob>`; the generated `toneKnobVar` spells the same name. */
const TONE_KNOB_PREFIX = `--${TONE_MIX_GROUP}`;

function toneKnobVar(tone: string, knob: string): string {
  return [TONE_KNOB_PREFIX, tone, knob].join("-");
}

/** The knobs of the colored steps that mix away from the page ink: the solid steps, which each tone owns. */
function stepKnobs(model: ToneModel): readonly string[] {
  const steps = model.roles.flatMap(({ derived: { colored } }) =>
    typeof colored === "object" && colored.toward === "away" ? [aliasTail(colored.mix, TONE_MIX_GROUP)] : [],
  );
  return [...new Set(steps)];
}

/** A colored solid step reads its tone's own knob, so a clamp can raise one tone's steps and leave the others. */
function mixCss(origin: string, step: MixStep, tone?: string): string {
  const knob = aliasTail(step.mix, TONE_MIX_GROUP);
  const amount = tone !== undefined && step.toward === "away" ? `var(${toneKnobVar(tone, knob)})` : `var(--${TONE_MIX_GROUP}-${knob})`;
  return `color-mix(in oklab, ${origin} ${amount}, ${MIX_TARGET_CSS[step.toward]})`;
}

/** Each colored tone's step knobs default to the scope's on the root; a carried scope re-declares every one. */
export function toneKnobDefaults(model: ToneModel): readonly string[] {
  return model.tones
    .filter((tone) => tone !== NEUTRAL_TONE)
    .flatMap((tone) => stepKnobs(model).map((knob) => `${toneKnobVar(tone, knob)}: var(--${TONE_MIX_GROUP}-${knob});`));
}

function neutralCss(role: ToneRole): string {
  const bound = `var(--color-${hostOf(String(role.token.value))})`;
  return role.derived.neutral === undefined ? bound : mixCss(bound, role.derived.neutral);
}

function coloredCss(role: ToneRole, tone: string): string {
  const { colored } = role.derived;
  if (colored === "base") {
    return `var(--color-${tone})`;
  }
  if (colored === "base-foreground") {
    return `var(--color-${tone}-foreground)`;
  }
  return mixCss(`var(--color-${tone})`, colored, tone);
}

/** One `[data-tone="<tone>"]` block per tone, each declaring every role with its formula. */
export function renderToneBlocks(model: ToneModel): string {
  return model.tones
    .map((tone) => {
      const lines = model.roles.map(
        (role) => `  --color-${TONE_ROLE_PREFIX}${role.name}: ${tone === NEUTRAL_TONE ? neutralCss(role) : coloredCss(role, tone)};`,
      );
      return `\n[data-tone="${tone}"] {\n${lines.join("\n")}\n}\n`;
    })
    .join("");
}

/** The `@theme reference` registration: it mints the `*-tone-*` utilities, and its value is the neutral spelling the
 *  utility falls back to on an unstamped element. */
export function toneReferenceValues(model: ToneModel): readonly GeneratedCssValue[] {
  return model.roles.map((role) => ({ path: role.token.path, value: neutralCss(role), placement: "reference" }));
}

/** The generated TS surface: the tuples and the recipe map the clamp, the primitives and the tests import. */
export function renderToneTs(model: ToneModel): readonly string[] {
  const tuple = (values: readonly string[]): string => `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
  return [
    "/** The D336 tone tuple, in `[data-tone]` block order. */",
    `export const TONES = ${tuple(model.tones)} as const;`,
    "export type Tone = (typeof TONES)[number];",
    "",
    "/** The D336 roles every tone declares as `--color-tone-<role>`. */",
    `export const TONE_ROLES = ${tuple(model.roles.map((role) => role.name))} as const;`,
    "export type ToneRole = (typeof TONE_ROLES)[number];",
    "",
    "/** The `--tone-mix-*` knobs and their default percents. */",
    `export const TONE_MIX_KNOBS = ${tuple(model.knobs)} as const;`,
    "export type ToneMixKnob = (typeof TONE_MIX_KNOBS)[number];",
    `export const TONE_MIX_DEFAULTS = ${JSON.stringify(model.defaults)} as const satisfies Readonly<Record<ToneMixKnob, number>>;`,
    "",
    "/** A tone's own override of a scope knob, read first by that tone's colored steps. */",
    "export function toneKnobVar(tone: Tone, knob: ToneMixKnob): string {",
    `  return [${JSON.stringify(TONE_KNOB_PREFIX)}, tone, knob].join("-");`,
    "}",
    "",
    "/** Each role's recipe as data, for the numeric twin in `@orb/kit/theme-derivation`. */",
    "export const TONE_ROLE_RECIPES = {",
    ...model.roles.map((role) => `  ${JSON.stringify(role.name)}: ${JSON.stringify(role.recipe)},`),
    "} as const satisfies ToneRoleRecipes<ToneRole, ToneMixKnob, CarriedToneHost>;",
    "",
  ];
}

// ─── The floor check over the shipped palettes ───

function rawColor(value: unknown, path: string): { readonly color: Oklch; readonly alpha: number } {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${path}: expected a resolved color`);
  }
  const { components, alpha } = value as { components?: unknown; alpha?: unknown };
  if (!Array.isArray(components) || components.length !== OKLCH_COMPONENTS) {
    throw new Error(`${path}: expected an OKLCH color`);
  }
  const [l, c, h] = components as [number, number, number];
  return { color: { l, c, h }, alpha: typeof alpha === "number" ? alpha : 1 };
}

/** A seed palette's resolved value for a color path: the value-set's own member, else the base token resolved in the base. */
function seedValue(contract: TokenContractResult, theme: TokenContractResult["themes"][number], path: string): unknown {
  const valueSets = { base: undefined, light: contract.lightTokens, mocha: contract.mochaTokens } as const;
  const seed = valueSets[theme.source]?.get(path);
  if (seed !== undefined) {
    return seed.value;
  }
  const base = contract.baseTokens.find((token) => token.pathString === path);
  const alias = typeof base?.value === "string" ? DTCG_ALIAS_RE.exec(base.value)?.[1] : undefined;
  return alias === undefined ? base?.value : seedValue(contract, { ...theme, source: "base" }, alias);
}

function seedPalette(contract: TokenContractResult, theme: TokenContractResult["themes"][number]): (path: string) => Oklch {
  const background = rawColor(seedValue(contract, theme, "color.background"), "color.background").color;
  return (path) => {
    const { color, alpha } = rawColor(seedValue(contract, theme, path), path);
    return alpha >= 1 ? color : srgbToOklch(compositeSrgb(oklchToSrgb(color), alpha, oklchToSrgb(background)));
  };
}

/** Fails the build when a shipped palette misses a D336 floor at the default mix amounts. */
export function assertShippedToneFloors(contract: TokenContractResult, model: ToneModel): void {
  const recipes = Object.fromEntries(model.roles.map((role) => [role.name, role.recipe]));
  const findings: string[] = [];
  for (const theme of contract.themes) {
    const color = seedPalette(contract, theme);
    const palette: TonePalette<CarriedToneHost> = {
      polarity: theme.colorScheme,
      foreground: color("color.foreground"),
      background: color("color.background"),
      hosts: Object.fromEntries(CARRIED_TONE_HOSTS.map((host) => [host, color(`color.${host}`)])) as Record<CarriedToneHost, Oklch>,
    };
    for (const tone of model.tones) {
      const source: ToneSource = tone === NEUTRAL_TONE ? "neutral" : { base: color(`color.${tone}`), foreground: color(`color.${tone}-foreground`) };
      for (const miss of toneFloorMisses({ recipes, palette }, source, model.defaults)) {
        const over = "role" in miss.over ? `tone-${miss.over.role}` : miss.over.host;
        findings.push(`${theme.id} ${tone}: tone-${miss.role} on ${over} is ${miss.ratio.toFixed(2)}:1`);
      }
    }
  }
  if (findings.length > 0) {
    throw new Error(`D336 tone floors missed on a shipped palette:\n${findings.join("\n")}`);
  }
}
