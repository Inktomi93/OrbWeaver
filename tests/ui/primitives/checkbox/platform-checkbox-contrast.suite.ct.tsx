// D159: every form-control carrier's resting edge holds WCAG 1.4.11's 3:1 against the surface it sits on and the fill it
// paints around, and stays below the focus ring on the card, under each seed and under custom ThemeScopes near the crossover.
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { keysOf } from "@orb/testkit/iso";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { CarrierEdgeStory } from "./_checkbox-contrast-stories.tsx";
import { CUSTOM_LIGHT_MID_TONE, CUSTOM_MID_GREY, INHERITED_ACCENT, STRONG_ACCENT } from "./carrier-scopes.ts";

const STORY = "tests/ui/primitives/checkbox/_checkbox-contrast-stories/CarrierEdgeStory";
const CARRIERS = [
  { label: "Checkbox", role: "checkbox" },
  { label: "Radio choice", role: "radio" },
  { label: "Switch", role: "switch" },
  { label: "Input", role: "textbox" },
] as const;
const CASES = [
  { name: "hearth seed" },
  ...keysOf(SEED_THEME_VALUE_SETS).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey ThemeScope", background: CUSTOM_MID_GREY, accent: STRONG_ACCENT },
  { name: "custom mid-grey ThemeScope with the inherited app accent", background: CUSTOM_MID_GREY, ambientAccent: INHERITED_ACCENT },
  { name: "custom light mid-tone ThemeScope", background: CUSTOM_LIGHT_MID_TONE, ambientAccent: INHERITED_ACCENT },
] as const;

function borderColorOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).borderTopColor);
}

for (const { name, ...props } of CASES) {
  test(`${name}: every carrier edge holds 3:1 against its host and sits below the focus ring on the card`, async ({ mount, page }) => {
    const component = await mount<typeof CarrierEdgeStory>(STORY, props);
    const edge = component.locator('[data-swatch="edge"]');
    const ring = component.locator('[data-swatch="ring"]');
    await expect(edge).toBeVisible();
    const edgePixel = await pixelSurface(page, edge);
    const ringPixel = await pixelSurface(page, ring);
    const edgeColor = await edge.evaluate((element) => getComputedStyle(element).backgroundColor);
    const grounds = new Map<string, Awaited<ReturnType<typeof pixelSurface>>>();
    const hosts = await component.locator("[data-host]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-host") ?? ""));
    expect(hosts).toContain("card");
    for (const host of hosts) {
      const ground = await pixelSurface(page, component.locator(`[data-host="${host}"]`), { region: { x0: 0, x1: 0.02, y0: 0, y1: 0.2 } });
      grounds.set(host, ground);
      expect(wcagContrastRatio(edgePixel.rgb, ground.rgb), `${host}: edge ${edgePixel.describe} on ${ground.describe}`).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
      for (const { label, role } of CARRIERS) {
        const control = component.getByRole(role, { name: `${label} on ${host}`, exact: true });
        // A carrier paints the token itself: its computed edge is the swatch's computed fill.
        expect(await borderColorOf(control), `${label} on ${host}`).toBe(edgeColor);
      }
      const field = await pixelSurface(page, component.getByRole("textbox", { name: `Input on ${host}`, exact: true }), {
        region: { x0: 0.4, x1: 0.6, y0: 0.4, y1: 0.6 },
      });
      expect(wcagContrastRatio(edgePixel.rgb, field.rgb), `${host}: edge ${edgePixel.describe} on the field ${field.describe}`).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
    }
    const card = grounds.get("card");
    if (card === undefined) {
      throw new Error("the card host was not sampled");
    }
    expect(wcagContrastRatio(edgePixel.rgb, card.rgb), `edge ${edgePixel.describe} on card ${card.describe}`).toBeLessThan(
      wcagContrastRatio(ringPixel.rgb, card.rgb),
    );
  });
}
