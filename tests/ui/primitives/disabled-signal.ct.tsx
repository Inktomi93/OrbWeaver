// @subject packages/ui/src/lib/disabled-state.ts
// A disabled control differs from its enabled twin by a second signal besides opacity (D355, ui-surface-and-interaction-rules §3),
// on the Light seed and under a light custom theme, where the derived dim alone reads as enabled. A fill-less control drops to the
// muted ink and still dims; a form control and a selection control swap their box to the muted fill and never dim, so their
// edge keeps its 3:1. A control dims once, by its scope's derived step, never by that step again at a part.

import { LIGHT_TONE_THEME } from "@orb/testkit/iso";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CustomThemeDisabledSignalStory, SeedDisabledSignalStory } from "./_disabled-signal-stories.tsx";
import type { SignalCase } from "./disabled-signal-cases.ts";
import { SIGNAL_CASES } from "./disabled-signal-cases.ts";

const STORIES = "tests/ui/primitives/_disabled-signal-stories";
const PERCENT = 100;

type Paint = "color" | "backgroundColor";

interface CaseRead {
  /** The painted part whose colour carries the second signal. */
  readonly part: string;
  readonly paint: Paint;
  /** A fill-less control still dims; a form or selection control swaps instead. */
  readonly dims: boolean;
  /** The muted pair member the part swaps to, when it is not the one the part paints with: a slider range fills with the muted ink. */
  readonly pair?: Paint;
}

const READS = {
  "outline button": { part: "button", paint: "color", dims: true },
  "ghost button": { part: "button", paint: "color", dims: true },
  "list row": { part: '[data-slot="list-row-title"]', paint: "color", dims: true },
  "option strip": { part: '[data-slot="option-strip-label"]', paint: "color", dims: true },
  "text field": { part: '[data-slot="input-root"]', paint: "backgroundColor", dims: false },
  "number field": { part: '[data-slot="number-field-group"]', paint: "backgroundColor", dims: false },
  "number field digits": { part: '[data-slot="number-field-input"]', paint: "color", dims: false },
  "select trigger": { part: '[data-slot="select-trigger"]', paint: "backgroundColor", dims: false },
  "checked switch": { part: '[data-slot="switch-root"]', paint: "backgroundColor", dims: false },
  "checked checkbox": { part: '[data-slot="checkbox-root"]', paint: "backgroundColor", dims: false },
  "checked radio": { part: '[data-slot="radio-group-item"]', paint: "backgroundColor", dims: false },
  slider: { part: '[data-slot="slider-indicator"]', paint: "backgroundColor", dims: false, pair: "color" },
} as const satisfies Record<SignalCase, CaseRead>;

/** The part's paint, and the opacity it renders at: its own times every ancestor's up to the case box. */
async function readPart(scope: Locator, name: SignalCase, state: string): Promise<{ readonly paint: string; readonly opacity: number }> {
  const { part, paint } = READS[name];
  return await scope
    .locator(`[data-case="${name}"][data-state="${state}"]`)
    .locator(part)
    .first()
    .evaluate((node, property: Paint) => {
      let opacity = 1;
      for (let at: Element | null = node; at !== null && !at.hasAttribute("data-case"); at = at.parentElement) {
        opacity *= Number.parseFloat(getComputedStyle(at).opacity);
      }
      return { paint: getComputedStyle(node)[property], opacity };
    }, paint);
}

interface SignalRead {
  /** The disabled copy paints the muted pair where the enabled one does not. */
  readonly swapsToMuted: boolean;
  readonly enabledOpaque: boolean;
  /** The opacity the disabled part renders at, as a percent: the scope's derived step for a fill-less control, else full. */
  readonly renderedPercent: number;
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
    const enabled = await readPart(scope, name, "enabled");
    const disabled = await readPart(scope, name, "disabled");
    observed[name] = {
      swapsToMuted: enabled.paint !== swapped && disabled.paint === swapped,
      enabledOpaque: enabled.opacity === 1,
      renderedPercent: Math.round(disabled.opacity * PERCENT),
    };
    owed[name] = { swapsToMuted: true, enabledOpaque: true, renderedPercent: read.dims ? stepPercent : PERCENT };
  }
  return { observed, owed };
}

test("every control kind carries a second disabled signal on the Light seed", async ({ mount }) => {
  const component = await mount<typeof SeedDisabledSignalStory>(`${STORIES}/SeedDisabledSignalStory`, { theme: "light" });
  const { observed, owed } = await readSignals(component);
  expect(observed).toEqual(owed);
});

test("every control kind carries a second disabled signal under a light custom theme", async ({ mount }) => {
  const component = await mount<typeof CustomThemeDisabledSignalStory>(`${STORIES}/CustomThemeDisabledSignalStory`, { tokens: LIGHT_TONE_THEME });
  const { observed, owed } = await readSignals(component);
  expect(observed).toEqual(owed);
});
