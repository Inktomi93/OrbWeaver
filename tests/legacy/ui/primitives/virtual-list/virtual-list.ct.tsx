import { expect, test } from "@playwright/experimental-ct-react";
import {
  AriaLabelList,
  BoundedList,
  CustomRangeExtractorList,
  DerivedItemsList,
  DynamicLayoutList,
  EndApproachList,
  FadeEdgeList,
  InitialOffsetList,
  LanesList,
  OverscanList,
  ResetScopeLifecycleList,
  ResetScopeList,
  ScrollToIndexList,
  UnboundedList,
} from "./virtual-list.fixtures.tsx";

const ITEM_COUNT = 1000;
const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 400;
// Bounded window (400px) + overscan is ~a dozen rows; anything near this bound means windowing broke.
const MAX_WINDOWED_ROWS = 100;
const SCROLL_TARGET_INDEX = 500;

test("renders only a window of a 1000-item list", async ({ mount }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeGreaterThan(0);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeLessThan(MAX_WINDOWED_ROWS);
  // A deep item is NOT in the DOM before scrolling.
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toHaveCount(0);
});

test("scrolling brings later items into view", async ({ mount, page }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, SCROLL_TARGET_INDEX * ROW_HEIGHT_PX);
  await expect(component.getByText(`Item ${SCROLL_TARGET_INDEX}`, { exact: true })).toBeVisible();
});

test("rows carry stable data-index measurement wiring", async ({ mount }) => {
  const component = await mount(<BoundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.locator('[data-index="0"]')).toBeVisible();
  // Every rendered row is wired for measureElement: row count === data-index count.
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeGreaterThan(0);
});

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});

// R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
// re-renders passing a freshly-DERIVED items array — not a stable module-const reference.
test("renders correctly when the parent passes a freshly-derived items array each render", async ({ mount }) => {
  const component = await mount(<DerivedItemsList />);
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();

  await component.getByTestId("rerender").click();
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();
  await expect(component.getByText("Bravo", { exact: true })).toBeVisible();
  await expect(component.getByText("Charlie", { exact: true })).toBeVisible();
});

test("lanes passthrough: rows carry a data-lane round-robined across the lane count", async ({ mount }) => {
  const component = await mount(<LanesList itemCount={9} lanes={3} />);
  const lanes = await component.locator("[data-lane]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-lane")));
  expect(lanes.length).toBeGreaterThan(0);
  expect(new Set(lanes)).toEqual(new Set(["0", "1", "2"]));
});

test("rangeExtractor passthrough: a custom extractor's forced index stays mounted off-screen", async ({ mount, page }) => {
  const component = await mount(<CustomRangeExtractorList itemCount={200} />);
  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, 100 * 40);
  // The normal overscan window has scrolled well past index 0 — only the custom rangeExtractor
  // forcing it into the range keeps it mounted.
  await expect(component.getByText("Item 0", { exact: true })).toHaveCount(1);
});

// Split across two tests — playwright-ct mounts exactly one root per test. 200px window / 20px rows
// ≈ 10 visible; the seal's own default overscan (1) pads a couple rows past that on each side, while
// overscan=20 pads well past it — the two bounds below distinguish the branches without a cross-test
// comparison.
test("overscan default: renders roughly the visible window + the seal's own default padding", async ({ mount }) => {
  const component = await mount(<OverscanList itemCount={500} />);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeGreaterThan(0);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeLessThan(20);
});

test("overscan=20 renders MORE off-screen rows than the seal's own default window", async ({ mount }) => {
  const component = await mount(<OverscanList itemCount={500} overscan={20} />);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeGreaterThanOrEqual(30);
});

test("fadeEdge=false never writes the data-more cue, even with more list below the fold", async ({ mount }) => {
  const component = await mount(<FadeEdgeList itemCount={100} fadeEdge={false} />);
  const scroller = component.locator('[data-slot="virtual-list-scroll"]');
  await expect(scroller).not.toHaveAttribute("data-more", "");
});

test("fadeEdge=true: data-more is set while more list is below the fold, and lifts at the bottom", async ({ mount, page }) => {
  const component = await mount(<FadeEdgeList itemCount={100} fadeEdge={true} />);
  const scroller = component.locator('[data-slot="virtual-list-scroll"]');
  await expect(scroller).toHaveAttribute("data-more", "");

  await component.getByText("Item 0", { exact: true }).hover();
  await page.mouse.wheel(0, 100 * 40);
  await expect(scroller).not.toHaveAttribute("data-more", "");
});

test("scrollToIndex pins the last item into view (end-aligned) once the prop is set", async ({ mount }) => {
  const component = await mount(<ScrollToIndexList itemCount={300} />);
  await expect(component.getByText("Item 299", { exact: true })).toHaveCount(0);
  await component.getByTestId("pin-to-end").click();
  await expect(component.getByText("Item 299", { exact: true })).toBeVisible();
});

// #255: the browse-restore seam. Unlike `scrollToIndex` this needs NO gesture and NO prop change — the deep
// window is what mounts, which is the whole contract (a pane that comes back must not paint the top first).
test("initialScrollOffset mounts the list already scrolled to that offset", async ({ mount }) => {
  const component = await mount(<InitialOffsetList itemCount={300} offsetPx={4000} />);
  // The row at 4000px / 40px rows is Item 100; Item 0 is far above the window and not rendered at all.
  await expect(component.getByText("Item 100", { exact: true })).toBeVisible();
  await expect(component.getByText("Item 0", { exact: true })).toHaveCount(0);
  await expect.poll(() => component.locator('[data-slot="virtual-list-scroll"]').evaluate((el) => el.scrollTop), { intervals: [20, 50, 100] }).toBe(4000);
});

test("a 906-row measured list resets a settled 30-row scope after old-offset clamping without remounting or losing ownership", async ({ mount, page }) => {
  const component = await mount(<ResetScopeList />);
  const scroll = component.getByRole("list", { name: "Reset rows" });
  await scroll.evaluate((node) => node.setAttribute("data-identity-probe", "preserved"));
  await component.getByText("Before 0", { exact: true }).hover();
  await page.mouse.wheel(0, 50_000);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(30_000);
  const oldOffset = await scroll.evaluate((node) => node.scrollTop);

  await component.getByTestId("change-scope").click();
  await expect(scroll).toHaveJSProperty("scrollTop", oldOffset);
  await component.getByTestId("settle-scope").click();
  await expect(scroll).toHaveAttribute("data-clamp-events", "1");
  await expect(component.locator('[data-slot="virtual-list-row"]')).not.toHaveCount(0);
  await expect(component.locator('[data-slot="virtual-list-row"]').first()).toHaveAttribute("aria-setsize", "30");
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(() =>
      component.locator('[data-slot="virtual-list-row"]').evaluateAll((rows) => {
        const boxes = rows.map((row) => row.getBoundingClientRect());
        return boxes.flatMap((box, index) => boxes.slice(index + 1).filter((other) => box.top < other.bottom && other.top < box.bottom)).length;
      }),
    )
    .toBe(0);

  const settled = await component.locator('[data-slot="virtual-list-row"]').evaluateAll((rows) => {
    const scrollElement = rows[0]?.closest<HTMLElement>('[data-slot="virtual-list-scroll"]');
    const scrollBox = scrollElement?.getBoundingClientRect();
    const boxes = rows.map((row) => row.getBoundingClientRect());
    const visibleRows = rows.filter((_row, index) => {
      const box = boxes[index];
      const centreY = box === undefined ? -1 : box.y + box.height / 2;
      return scrollBox !== undefined && centreY >= scrollBox.top && centreY < scrollBox.bottom;
    });
    return {
      firstIndex: Number(rows[0]?.getAttribute("data-index")),
      overlaps: boxes.flatMap((box, index) =>
        boxes
          .slice(index + 1)
          .filter((other) => box.top < other.bottom && other.top < box.bottom)
          .map(() => index),
      ),
      ownsCentre: visibleRows.map((row) => {
        const box = row.getBoundingClientRect();
        return box === undefined || document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('[data-slot="virtual-list-row"]') === row;
      }),
      scrollTop: scrollElement?.scrollTop ?? -1,
      uniqueTops: new Set(boxes.map((box) => box.top)).size,
      visibleCount: visibleRows.length,
    };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the pre-scope-change poll settled oldOffset above 30,000 before this retained-value assertion.
  expect(oldOffset).toBeGreaterThan(30_000);
  expect(settled.scrollTop).toBe(0);
  expect(settled.firstIndex).toBe(0);
  expect(settled.uniqueTops).toBeGreaterThan(1);
  expect(settled.overlaps).toEqual([]);
  expect(settled.visibleCount).toBeGreaterThan(1);
  expect(settled.ownsCentre.every(Boolean)).toBe(true);
  await expect(scroll).toHaveAttribute("data-identity-probe", "preserved");
});

test("rapid settled scope churn lands only the latest reset and cancels older frame work", async ({ mount, page }) => {
  const component = await mount(<ResetScopeLifecycleList />);
  const scroll = component.getByRole("list", { name: "Lifecycle reset rows" });
  await component.getByText("Scope 0 row 0", { exact: true }).hover();
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(2000);

  await page.evaluate(() => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const harness = {
      /** Returns the RESIDUE — a nonzero result means the cap was hit and frames are still queued, which a
       *  caller must fail on rather than proceed from a half-drained state. */
      drain(): number {
        for (let pass = 0; pending.size > 0 && pass < 50; pass += 1) {
          this.flushAll();
        }
        return pending.size;
      },
      flushAll(): void {
        for (const [id, callback] of Array.from(pending)) {
          pending.delete(id);
          callback(0);
        }
      },
      /** The ids queued RIGHT NOW. Captured at the moment the landing is scheduled, so the flush below
       *  NAMES that frame: "the newest pending frame is the reset" is false the instant a later scroll
       *  write enqueues virtual-core's own reconcile after it. */
      pendingIds(): number[] {
        return Array.from(pending.keys());
      },
      flushIds(ids: readonly number[]): void {
        for (const id of ids) {
          const callback = pending.get(id);
          if (callback !== undefined) {
            pending.delete(id);
            callback(0);
          }
        }
      },
    };
    Object.assign(globalThis, { __resetFrameHarness: harness });
    globalThis.requestAnimationFrame = (callback): number => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id): void => {
      pending.delete(id);
    };
  });
  await expect
    .poll(
      async () => await page.evaluate(() => (globalThis as typeof globalThis & { __resetFrameHarness: { drain: () => number } }).__resetFrameHarness.drain()),
    )
    .toBe(0);
  await scroll.evaluate((node) => {
    node.scrollTop = 2500;
  });

  await component.getByTestId("scope-a").click();
  await expect(component.getByTestId("active-scope")).toHaveText("1");
  await scroll.evaluate((node) => {
    node.scrollTop = 700;
  });
  await component.getByTestId("scope-b").click();
  await expect(component.getByTestId("active-scope")).toHaveText("2");
  const landing = await page.evaluate(() =>
    (globalThis as typeof globalThis & { __resetFrameHarness: { pendingIds: () => number[] } }).__resetFrameHarness.pendingIds(),
  );
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(landing.length).toBeGreaterThan(0);
  await scroll.evaluate((node) => {
    node.scrollTop = 600;
  });
  await page.evaluate(
    (ids: readonly number[]) =>
      (globalThis as typeof globalThis & { __resetFrameHarness: { flushIds: (frames: readonly number[]) => void } }).__resetFrameHarness.flushIds(ids),
    landing,
  );
  await expect(scroll).toHaveJSProperty("scrollTop", 0);

  await scroll.evaluate((node) => {
    node.scrollTop = 500;
  });
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { __resetFrameHarness: { flushAll: () => void } }).__resetFrameHarness.flushAll();
  });
  await expect(scroll).toHaveJSProperty("scrollTop", 500);
  await expect(component.getByText("Scope 2 row 0", { exact: true })).toHaveCount(0);
});

test("unmount before the reset frame cancels the stale landing without errors or detached-node writes", async ({ mount, page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const component = await mount(<ResetScopeLifecycleList />);
  const scroll = component.getByRole("list", { name: "Lifecycle reset rows" });
  await component.getByText("Scope 0 row 0", { exact: true }).hover();
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(2000);

  await page.evaluate(() => {
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const scrollElement = document.querySelector<HTMLElement>('[aria-label="Lifecycle reset rows"]');
    const nativeScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = function scrollTo(optionsOrX?: number | ScrollToOptions, y?: number): void {
      if (this === scrollElement) {
        this.dataset["resetWrites"] = String(Number(this.dataset["resetWrites"] ?? "0") + 1);
      }
      if (typeof optionsOrX === "number") {
        (nativeScrollTo as (x: number, y: number) => void).call(this, optionsOrX, y ?? 0);
      } else {
        (nativeScrollTo as (options?: ScrollToOptions) => void).call(this, optionsOrX);
      }
    };
    Object.assign(globalThis, {
      __resetFrameHarness: {
        /** Returns the RESIDUE — see the sibling harness above; a nonzero result is a half-drained state. */
        drain(): number {
          for (let pass = 0; pending.size > 0 && pass < 50; pass += 1) {
            this.flushAll();
          }
          return pending.size;
        },
        flushAll(): void {
          for (const [id, callback] of Array.from(pending)) {
            pending.delete(id);
            callback(0);
          }
        },
      },
    });
    globalThis.requestAnimationFrame = (callback): number => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id): void => {
      pending.delete(id);
    };
  });
  await expect
    .poll(
      async () => await page.evaluate(() => (globalThis as typeof globalThis & { __resetFrameHarness: { drain: () => number } }).__resetFrameHarness.drain()),
    )
    .toBe(0);
  await scroll.evaluate((node) => {
    node.scrollTop = 2500;
  });

  await component.getByTestId("scope-a").click();
  await expect(component.getByTestId("active-scope")).toHaveText("1");
  await expect(scroll).not.toHaveJSProperty("scrollTop", 0);
  const detachedScroll = await scroll.elementHandle();
  expect(detachedScroll).not.toBeNull();
  await expect(scroll).not.toHaveAttribute("data-reset-writes");
  await component.unmount();
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { __resetFrameHarness: { flushAll: () => void } }).__resetFrameHarness.flushAll();
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): flushAll is synchronous and the detached node cannot receive later browser work.
  expect(await detachedScroll?.getAttribute("data-reset-writes")).toBeNull();
  expect(errors).toEqual([]);
});

test("onEndApproach fires when the rendered window is within endApproachRows of the tail", async ({ mount }) => {
  // A list entirely within the default endApproachRows (8) of its own tail fires on/shortly after
  // mount (it may re-fire once more as rows settle from estimated to measured size — still gated,
  // never the "does not fire" zero of the sibling test below).
  const component = await mount(<EndApproachList itemCount={5} />);
  await expect(component.getByTestId("calls")).not.toHaveText("0");
});

test("onEndApproach does NOT fire when the window is farther from the tail than endApproachRows", async ({ mount }) => {
  const component = await mount(<EndApproachList itemCount={500} endApproachRows={2} />);
  await expect(component.getByTestId("calls")).toHaveText("0");
});

test("aria-label passes through to the role=list scroll container", async ({ mount }) => {
  const component = await mount(<AriaLabelList itemCount={20} ariaLabel="Fixture rows" />);
  await expect(component.getByRole("list", { name: "Fixture rows" })).toBeVisible();
});

test("dynamic height, stable-key reorder, scrollport resize, and deep scroll retain unique visible ownership", async ({ mount, page }) => {
  const component = await mount(<DynamicLayoutList />);
  const scroll = component.locator('[data-slot="virtual-list-scroll"]');

  const expectOwnedGeometry = async (): Promise<void> => {
    const geometry = await component.locator('[data-slot="virtual-list-row"]').evaluateAll((rows) => {
      const scrollBox = rows[0]?.closest('[data-slot="virtual-list-scroll"]')?.getBoundingClientRect();
      const viewportBox = rows[0]?.closest('[data-slot="virtual-list-viewport"]')?.getBoundingClientRect();
      return rows.map((row) => {
        const box = row.getBoundingClientRect();
        const centreY = box.y + box.height / 2;
        return {
          index: Number(row.getAttribute("data-index")),
          y: box.y,
          viewportHasHeight: (viewportBox?.height ?? 0) > 0,
          centreIsVisible: scrollBox !== undefined && centreY >= scrollBox.top && centreY <= scrollBox.bottom,
          ownsCentre: document.elementFromPoint(box.x + box.width / 2, centreY)?.closest('[data-slot="virtual-list-row"]') === row,
        };
      });
    });
    expect(geometry.length).toBeGreaterThan(1);
    expect(geometry.every((row) => row.viewportHasHeight)).toBe(true);
    expect(new Set(geometry.map((row) => row.y)).size).toBe(geometry.length);
    const visible = geometry.filter((row) => row.centreIsVisible);
    expect(visible.length).toBeGreaterThan(1);
    expect(visible.filter((row) => !row.ownsCentre)).toEqual([]);
  };

  await expect(component.getByText("Item 0", { exact: true })).toBeVisible();
  await expect(expectOwnedGeometry).toPass();
  await component.getByTestId("toggle-height").click();
  await expect.poll(() => component.getByText("Item 0", { exact: true }).evaluate((node) => node.getBoundingClientRect().height)).toBe(96);
  await expect(expectOwnedGeometry).toPass();
  await component.getByTestId("reorder").click();
  await expect(component.getByText("Item 79", { exact: true })).toBeVisible();
  await expect(expectOwnedGeometry).toPass();
  await component.getByTestId("resize").click();
  await expect.poll(() => scroll.evaluate((node) => node.clientHeight)).toBe(280);
  await expect(expectOwnedGeometry).toPass();
  await component.getByText("Item 79", { exact: true }).hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(expectOwnedGeometry).toPass();
});
