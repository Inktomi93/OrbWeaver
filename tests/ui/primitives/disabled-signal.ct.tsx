// @subject packages/ui/src/lib/disabled-state.ts
// A disabled control differs from its enabled twin by a second signal besides opacity (D355, ui-surface-and-interaction-rules §3),
// on light and dark seeds and custom themes. A fill-less control drops to the muted ink and dims. A form control and a
// selection control swap their box to the muted fill and never dim it, so their edge keeps its 3:1; a field's content and an
// off switch's knob render at the derived step instead, which is the signal on a dark palette, where the muted fill sits
// within a few percent of the field fill. A disabled switch keeps the muted track on and off, and its knob carries the
// state, so it is never louder than an enabled one. A control dims once, by its scope's derived step, never by that step
// again at a part.

import type { Rgb } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { DARK_CUSTOM_THEME, LIGHT_TONE_THEME } from "@orb/testkit/iso";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CustomThemeDisabledSignalStory, SeedDisabledSignalStory } from "./_disabled-signal-stories.tsx";
import type { SignalCase } from "./disabled-signal-cases.ts";
import { SIGNAL_CASES } from "./disabled-signal-cases.ts";

const STORIES = "tests/ui/primitives/_disabled-signal-stories";
const PERCENT = 100;

type Paint = "color" | "backgroundColor";

interface PartRead {
  /** The painted part, found inside the case box. */
  readonly part: string;
  readonly paint: Paint;
  /** Read the paint of this pseudo-element instead of the part's own. */
  readonly pseudo?: "::placeholder";
}

interface CaseRead extends PartRead {
  /** A fill-less control still dims; a form or selection control swaps instead. */
  readonly dims: boolean;
  /** The muted pair member the part swaps to, when it is not the one the part paints with: a slider range or a checked track fills with the muted ink. */
  readonly pair?: Paint;
  /** The content inside a box that never dims, which renders at the derived step instead. */
  readonly content?: PartRead;
}

const READS = {
  "outline button": { part: "button", paint: "color", dims: true },
  "ghost button": { part: "button", paint: "color", dims: true },
  "list row": { part: '[data-slot="list-row-title"]', paint: "color", dims: true },
  "selected list row": { part: '[data-slot="list-row-title"]', paint: "color", dims: true },
  "option strip": { part: '[data-slot="option-strip-label"]', paint: "color", dims: true },
  "active tab": { part: '[data-slot="tabs-tab"]', paint: "color", dims: true },
  "active rail cell": { part: '[data-slot="tabs-tab"]', paint: "color", dims: true },
  "pressed toggle": { part: '[data-slot="toggle"]', paint: "backgroundColor", dims: false },
  "color field": {
    part: '[data-slot="color-field-trigger"]',
    paint: "backgroundColor",
    dims: false,
    content: { part: '[data-slot="color-field-swatch"]', paint: "backgroundColor" },
  },
  "text field": { part: '[data-slot="input-root"]', paint: "backgroundColor", dims: false, content: { part: '[data-slot="input-root"]', paint: "color" } },
  "empty text field": {
    part: '[data-slot="input-root"]',
    paint: "backgroundColor",
    dims: false,
    content: { part: '[data-slot="input-root"]', paint: "color", pseudo: "::placeholder" },
  },
  "number field": {
    part: '[data-slot="number-field-group"]',
    paint: "backgroundColor",
    dims: false,
    content: { part: '[data-slot="number-field-input"]', paint: "color" },
  },
  "select trigger": {
    part: '[data-slot="select-trigger"]',
    paint: "backgroundColor",
    dims: false,
    content: { part: '[data-slot="select-icon"]', paint: "color" },
  },
  "checked switch": { part: '[data-slot="switch-root"]', paint: "backgroundColor", dims: false },
  "quiet checked switch": { part: '[data-slot="switch-root"]', paint: "backgroundColor", dims: false },
  "off switch": {
    part: '[data-slot="switch-root"]',
    paint: "backgroundColor",
    dims: false,
    content: { part: '[data-slot="switch-thumb"]', paint: "backgroundColor" },
  },
  "checked checkbox": { part: '[data-slot="checkbox-root"]', paint: "backgroundColor", dims: false },
  "checked radio": { part: '[data-slot="radio-group-item"]', paint: "backgroundColor", dims: false },
  slider: { part: '[data-slot="slider-indicator"]', paint: "backgroundColor", dims: false, pair: "color" },
} as const satisfies Record<SignalCase, CaseRead>;

interface PartPaint {
  readonly paint: string;
  /** Its own opacity times every ancestor's up to the case box, as a percent. */
  readonly opacityPercent: number;
  /** That opacity times the paint's own alpha: the strength the colour renders at. */
  readonly inkPercent: number;
}

async function readPart(scope: Locator, name: SignalCase, state: string, read: PartRead): Promise<PartPaint> {
  return await scope
    .locator(`[data-case="${name}"][data-state="${state}"]`)
    .locator(read.part)
    .first()
    .evaluate(
      (node, { paint, pseudo }) => {
        let opacity = 1;
        for (let at: Element | null = node; at !== null && !at.hasAttribute("data-case"); at = at.parentElement) {
          opacity *= Number.parseFloat(getComputedStyle(at).opacity);
        }
        const value = getComputedStyle(node, pseudo ?? null)[paint];
        // A translucent colour serializes its alpha last: `... / a)` in the modern forms, the fourth argument of `rgba()`.
        const alpha = /\/\s*([\d.]+)\)$/u.exec(value)?.[1] ?? /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/u.exec(value)?.[1];
        const percent = (share: number): number => Math.round(share * 100);
        return { paint: value, opacityPercent: percent(opacity), inkPercent: percent(opacity * (alpha === undefined ? 1 : Number.parseFloat(alpha))) };
      },
      { paint: read.paint, pseudo: read.pseudo },
    );
}

interface SignalRead {
  /** The disabled copy paints the muted pair where the enabled one does not. */
  readonly swapsToMuted: boolean;
  /** The opacity percent the enabled part renders at: full. */
  readonly enabledPercent: number;
  /** The opacity percent the disabled part renders at: the scope's derived step for a fill-less control, else full. */
  readonly renderedPercent: number;
  /** The percent the disabled content renders at inside a box that never dims; `null` for a control with no such content. */
  readonly contentPercent: number | null;
}

/** Each case's observed signal, beside the one its kind owes, keyed by case so a failure names the control. */
async function readSignals(scope: Locator): Promise<{ readonly observed: Record<string, SignalRead>; readonly owed: Record<string, SignalRead> }> {
  const { muted, stepPercent } = await scope.locator('[data-probe="muted"]').evaluate((node, stepVar: string) => {
    const style = getComputedStyle(node);
    return { muted: { color: style.color, backgroundColor: style.backgroundColor }, stepPercent: Number.parseFloat(style.getPropertyValue(stepVar)) };
  }, TOKENS["opacity.disabled"].cssVar);
  const observed: Record<string, SignalRead> = {};
  const owed: Record<string, SignalRead> = {};
  for (const name of SIGNAL_CASES) {
    const read: CaseRead = READS[name];
    const swapped = muted[read.pair ?? read.paint];
    const enabled = await readPart(scope, name, "enabled", read);
    const disabled = await readPart(scope, name, "disabled", read);
    const content = read.content === undefined ? null : await readPart(scope, name, "disabled", read.content);
    observed[name] = {
      swapsToMuted: enabled.paint !== swapped && disabled.paint === swapped,
      enabledPercent: enabled.opacityPercent,
      renderedPercent: disabled.opacityPercent,
      contentPercent: content?.inkPercent ?? null,
    };
    owed[name] = {
      swapsToMuted: true,
      enabledPercent: PERCENT,
      renderedPercent: read.dims ? stepPercent : PERCENT,
      contentPercent: read.content === undefined ? null : stepPercent,
    };
  }
  return { observed, owed };
}

// Hearth (no `data-theme`) is the default seed and dark; Light is the seed where opacity alone was too weak.
const SEEDS = [
  { name: "the Hearth seed", theme: undefined },
  { name: "the Light seed", theme: "light" },
  { name: "the Mocha seed", theme: "mocha" },
] as const;

const CUSTOM_THEMES = [
  { name: "a light custom theme", tokens: LIGHT_TONE_THEME },
  { name: "a dark custom theme", tokens: DARK_CUSTOM_THEME },
] as const;

// The start of an on switch's root, where its knob is not parked: the track alone.
const ON_TRACK_STRIP = { x0: 0.1, x1: 0.35, y0: 0.3, y1: 0.7 } as const;
// The end of a case box, which no control reaches: the page the switch sits on.
const PAGE_STRIP = { x0: 0.9, x1: 0.98, y0: 0.3, y1: 0.7 } as const;

async function surfaceOf(target: Locator, region: typeof ON_TRACK_STRIP | typeof PAGE_STRIP): Promise<Rgb> {
  await target.scrollIntoViewIfNeeded();
  return (await pixelSurface(target.page(), target, { region })).rgb;
}

function onTrack(scope: Locator, name: SignalCase, state: string): Promise<Rgb> {
  return surfaceOf(scope.locator(`[data-case="${name}"][data-state="${state}"]`).locator('[data-slot="switch-root"]'), ON_TRACK_STRIP);
}

interface SwitchLoudness {
  /** A disabled switch that is on is no louder against the page than an enabled switch that is on, in either tone. */
  readonly quieterThanEnabled: boolean;
  /** Its track stands apart from the enabled quiet-on track by the non-text floor, so the two never read as one state. */
  readonly apartFromQuietOn: boolean;
  readonly ratios: Readonly<Record<string, number>>;
}

/** Measured off the composited pixels, since the loudness is what reaches the screen, not what a class names. */
async function readSwitchLoudness(scope: Locator): Promise<SwitchLoudness> {
  const page = await surfaceOf(scope.locator('[data-case="checked switch"][data-state="enabled"]'), PAGE_STRIP);
  const disabledOn = await onTrack(scope, "checked switch", "disabled");
  const accentOn = await onTrack(scope, "checked switch", "enabled");
  const quietOn = await onTrack(scope, "quiet checked switch", "enabled");
  const ratios = {
    disabledOn: wcagContrastRatio(disabledOn, page),
    accentOn: wcagContrastRatio(accentOn, page),
    quietOn: wcagContrastRatio(quietOn, page),
    disabledOnToQuietOn: wcagContrastRatio(disabledOn, quietOn),
  };
  return {
    quieterThanEnabled: ratios.disabledOn <= Math.min(ratios.accentOn, ratios.quietOn),
    apartFromQuietOn: ratios.disabledOnToQuietOn >= AA_NON_TEXT_RATIO,
    ratios,
  };
}

const OWED_LOUDNESS = { quieterThanEnabled: true, apartFromQuietOn: true } as const;

for (const { name, theme } of SEEDS) {
  test(`every control kind carries a second disabled signal on ${name}`, async ({ mount }) => {
    const component = await mount<typeof SeedDisabledSignalStory>(`${STORIES}/SeedDisabledSignalStory`, theme === undefined ? {} : { theme });
    const { observed, owed } = await readSignals(component);
    expect.soft(observed).toEqual(owed);
    const { ratios, ...loudness } = await readSwitchLoudness(component);
    expect(loudness, JSON.stringify(ratios)).toEqual(OWED_LOUDNESS);
  });
}

for (const { name, tokens } of CUSTOM_THEMES) {
  test(`every control kind carries a second disabled signal under ${name}`, async ({ mount }) => {
    const component = await mount<typeof CustomThemeDisabledSignalStory>(`${STORIES}/CustomThemeDisabledSignalStory`, { tokens });
    const { observed, owed } = await readSignals(component);
    expect.soft(observed).toEqual(owed);
    const { ratios, ...loudness } = await readSwitchLoudness(component);
    expect(loudness, JSON.stringify(ratios)).toEqual(OWED_LOUDNESS);
  });
}
