import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { DensitySumsStory } from "./_density-sums-stories.tsx";

const STORY = "tests/ui/styles/_density-sums-stories/DensitySumsStory";

interface Sums {
  readonly clearance: number;
  readonly controlPlusRow: number;
  readonly flankFit: number;
  readonly floorPlusSidebarPlusBlock: number;
}

async function sumsIn(scope: string, probe: (name: string) => Locator): Promise<Sums> {
  const width = (name: string): Promise<number> => probe(`${scope}-${name}`).evaluate((node) => node.getBoundingClientRect().width);
  const height = (name: string): Promise<number> => probe(`${scope}-${name}`).evaluate((node) => node.getBoundingClientRect().height);
  const padding = (name: string, side: "paddingTop" | "paddingLeft"): Promise<number> =>
    probe(`${scope}-${name}`).evaluate((node, property) => Number.parseFloat(getComputedStyle(node)[property]), side);
  return {
    clearance: await padding("clearance", "paddingTop"),
    controlPlusRow: (await height("control")) + (await padding("row", "paddingTop")),
    flankFit: await width("flank-fit"),
    floorPlusSidebarPlusBlock: (await width("floor")) + (await width("sidebar")) + (await padding("block", "paddingLeft")),
  };
}

test("the clearance and the flank fit equal their parts at every density, and a density scope moves them", async ({ mount }) => {
  const component = await mount<typeof DensitySumsStory>(STORY);
  const probe = (name: string): Locator => component.locator(`[data-probe="${name}"]`);
  const root = await sumsIn("root", probe);
  const compact = await sumsIn("compact", probe);
  const restored = await sumsIn("restored", probe);
  for (const [scope, sums] of [
    ["root", root],
    ["compact", compact],
    ["restored", restored],
  ] as const) {
    expect(sums.clearance, `${scope} clearance`).toBeCloseTo(sums.controlPlusRow, 1);
    expect(sums.flankFit, `${scope} flank fit`).toBeCloseTo(sums.floorPlusSidebarPlusBlock, 1);
  }
  // The positive control: compact really tightens the spacing the sums read, and a comfortable scope inside it restores them.
  expect(compact.clearance).toBeLessThan(root.clearance);
  expect(compact.flankFit).toBeLessThan(root.flankFit);
  expect(restored.clearance).toBeCloseTo(root.clearance, 1);
  expect(restored.flankFit).toBeCloseTo(root.flankFit, 1);
});
