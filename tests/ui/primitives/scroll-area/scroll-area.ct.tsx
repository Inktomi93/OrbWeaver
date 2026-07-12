// CT: the scroll-area seal — overflowing content renders inside a genuinely scrollable viewport
// (Base UI preserves native scroll physics; the styled scrollbar overlay is cosmetic).
import { ScrollArea } from "@orb/ui/scroll-area";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders content in a scrollable viewport", async ({ mount, page }) => {
  await mount(
    <ScrollArea style={{ height: 120 }}>
      <div style={{ height: 1200 }}>
        <p>Top marker</p>
        <p>Bottom marker</p>
      </div>
    </ScrollArea>,
  );

  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await expect(viewport).toBeVisible();
  await expect(page.getByText("Top marker")).toBeVisible();

  const overflows = await viewport.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflows).toBe(true);

  await viewport.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] })
    .toBeGreaterThan(0);
});

test("onScroll forwards to the scrolling viewport (chat autoscroll seam)", async ({
  mount,
  page,
}) => {
  // The handler receives a React SyntheticEvent (non-serializable across CT's function-prop
  // boundary), so it just counts invocations — proving onScroll reached the scrolling Viewport
  // rather than dying on the non-scrolling Root.
  let scrolled = 0;
  await mount(
    <ScrollArea
      style={{ height: 120 }}
      viewportProps={{
        onScroll: (): void => {
          scrolled += 1;
        },
      }}
    >
      <div style={{ height: 1200 }}>
        <p>Scrollable</p>
      </div>
    </ScrollArea>,
  );
  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await viewport.evaluate((el) => {
    el.scrollTop = 400;
  });
  await expect.poll(() => scrolled, { intervals: [20, 50, 100] }).toBeGreaterThan(0);
});

test("renders the corner square only on both-axis overflow", async ({ mount, page }) => {
  await mount(
    <ScrollArea style={{ height: 120, width: 200 }}>
      <div style={{ height: 1200, width: 1200 }}>
        <p>Corner check</p>
      </div>
    </ScrollArea>,
  );

  const viewport = page.locator('[data-slot="scroll-area-viewport"]');
  await expect(viewport).toBeVisible();

  const bothAxes = await viewport.evaluate(
    (el) => el.scrollHeight > el.clientHeight && el.scrollWidth > el.clientWidth,
  );
  expect(bothAxes).toBe(true);

  // Base UI renders the Corner (self-sized from the scrollbar thickness) only when both axes overflow.
  await expect(page.locator('[data-slot="scroll-area-corner"]')).toBeVisible();
});

test("no corner when only one axis overflows", async ({ mount, page }) => {
  await mount(
    <ScrollArea style={{ height: 120 }}>
      <div style={{ height: 1200 }}>
        <p>Vertical only</p>
      </div>
    </ScrollArea>,
  );

  await expect(page.locator('[data-slot="scroll-area-viewport"]')).toBeVisible();
  // Base UI returns null for the Corner unless BOTH axes overflow.
  await expect(page.locator('[data-slot="scroll-area-corner"]')).toHaveCount(0);
});

test("the vertical and horizontal scrollbar/thumb data-slots each resolve to exactly one element", async ({
  mount,
  page,
}) => {
  // Both axes overflow so both scrollbars render — the case that previously collided under the
  // shared "scroll-area-scrollbar"/"scroll-area-thumb" data-slot (a Playwright strict-mode locator
  // resolving to 2 elements). Suffixing by orientation gives each a unique locator.
  await mount(
    <ScrollArea style={{ height: 120, width: 200 }}>
      <div style={{ height: 1200, width: 1200 }}>
        <p>Both axes overflow</p>
      </div>
    </ScrollArea>,
  );

  await expect(page.locator('[data-slot="scroll-area-scrollbar-vertical"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="scroll-area-scrollbar-horizontal"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="scroll-area-thumb-vertical"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="scroll-area-thumb-horizontal"]')).toHaveCount(1);
});
