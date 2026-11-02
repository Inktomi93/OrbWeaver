// A row wraps its actions under the body only when padding, leading, the title floor and the actions cannot share a line:
// a long name truncates beside them and never moves them, and a pane too narrow for even that scrolls nothing sideways.
import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TitleFloorStory } from "./_title-floor-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_title-floor-stories/TitleFloorStory";
const ROOMY = 373;
const CRAMPED = 150;

interface Geometry {
  readonly height: number;
  readonly actionsTop: number;
  readonly bodyBottom: number;
  readonly truncated: boolean;
}

function geometry(row: Locator): Promise<Geometry> {
  return row.evaluate((root) => {
    const part = (slot: string): HTMLElement => {
      const found = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      if (found === null) {
        throw new Error(`list row has no ${slot}`);
      }
      return found;
    };
    const body = part("list-row-body");
    const actions = part("list-row-actions");
    const title = part("list-row-title");
    return {
      height: root.getBoundingClientRect().height,
      actionsTop: actions.getBoundingClientRect().top,
      bodyBottom: body.getBoundingClientRect().bottom,
      truncated: title.scrollWidth > title.clientWidth,
    };
  });
}

test("a long name truncates beside the actions and leaves the row as tall as a short one", async ({ mount, page }) => {
  const component = await mount<typeof TitleFloorStory>(STORY, { width: ROOMY });
  const rows = component.locator('[data-slot="list-row-root"]');
  const [short, long] = [await geometry(rows.nth(0)), await geometry(rows.nth(1))];
  expect(long.truncated).toBe(true);
  expect(long.actionsTop).toBeLessThan(long.bodyBottom);
  expect(long.height).toBe(short.height);
  const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, rows.nth(1));
  const content = await rows.nth(1).locator('[data-slot="list-row-content"]').boundingBox();
  expect(content?.width ?? 0).toBeGreaterThanOrEqual(floor);
});

test("a pane too narrow for the floor and the actions wraps them and scrolls nothing sideways", async ({ mount }) => {
  const component = await mount<typeof TitleFloorStory>(STORY, { width: CRAMPED });
  const rows = component.locator('[data-slot="list-row-root"]');
  const long = await geometry(rows.nth(1));
  expect(long.actionsTop).toBeGreaterThanOrEqual(long.bodyBottom);
  expect(await rows.nth(1).evaluate((root) => root.scrollWidth - root.clientWidth)).toBeLessThanOrEqual(0);
});
