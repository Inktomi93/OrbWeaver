// A switch's OFF thumb carries no information, so it is the one mark that may never out-shout an ON state: measured from
// the framebuffer, its loudest member (thumb against track, track against host) stays under the quiet ON tone's, on
// every seed and both pane hosts, while the thumb still holds the 3:1 non-text floor against its track.
import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SwitchThumbCeilingStory } from "./_thumb-ceiling-stories.tsx";

const STORY = "tests/ui/primitives/switch/_thumb-ceiling-stories/SwitchThumbCeilingStory";

/** The thumb's colour and the track's, read where each is on show: the track is sampled at the end the thumb is not parked at. */
async function members(page: Page, host: Locator, label: string, checked: boolean): Promise<{ thumbOnTrack: number; trackOnHost: number }> {
  const control = host.getByRole("switch", { name: label, exact: true });
  const thumb = await pixelSurface(page, control.locator('[data-slot="switch-thumb"]'), { region: { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 } });
  const trackEnd = checked ? { x0: 0.06, x1: 0.14, y0: 0.3, y1: 0.7 } : { x0: 0.86, x1: 0.94, y0: 0.3, y1: 0.7 };
  const track = await pixelSurface(page, control, { region: trackEnd });
  const ground = await pixelSurface(page, host, { region: { x0: 0, x1: 0.02, y0: 0, y1: 0.2 } });
  return { thumbOnTrack: wcagContrastRatio(thumb.rgb, track.rgb), trackOnHost: wcagContrastRatio(track.rgb, ground.rgb) };
}

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: the OFF thumb stays under the quiet ON state on both hosts and holds 3:1 against its track`, async ({ mount, page }) => {
    const component = await mount<typeof SwitchThumbCeilingStory>(STORY, props);
    const hosts = await component.locator("[data-host]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-host") ?? ""));
    expect(hosts).toEqual(["background", "card"]);
    for (const host of hosts) {
      const pane = component.locator(`[data-host="${host}"]`);
      const off = await members(page, pane, `off on ${host}`, false);
      const quiet = await members(page, pane, `on quiet on ${host}`, true);
      const loudest = (state: { thumbOnTrack: number; trackOnHost: number }): number => Math.max(state.thumbOnTrack, state.trackOnHost);
      expect(loudest(off), `${host}: OFF loudest ${JSON.stringify(off)} under ON quiet ${JSON.stringify(quiet)}`).toBeLessThan(loudest(quiet));
      expect(off.thumbOnTrack, `${host}: the OFF thumb on its track`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
