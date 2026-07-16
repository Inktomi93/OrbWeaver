// CT: the MessageList seal — a bottom-anchored TanStack Virtual chat-thread list (ui-package-design
// §6.1/§9, un-parked). Asserts virtualization + bottom-anchor + stick-to-bottom (+ the no-yank flip
// side, + reduced-motion), matching virtual-list.ct.tsx's tripwire test for the shared discipline.
import { expect, test } from "@playwright/experimental-ct-react";
import {
  AppendableList,
  CachedMeasurementsList,
  DerivedItemsMessageList,
  HandleExposingList,
  KeepMountedStateList,
  PrependableList,
  RangeExtractorMessageList,
  TailGrowthList,
  UnboundedMessageList,
} from "./message-list.fixtures";

const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 200; // 5 rows visible
const ITEM_COUNT = 500;
const MAX_WINDOWED_ROWS = 60; // a bounded 200px window + overscan(10) is ~2 dozen rows

test("renders only a window of a 500-item list", async ({ mount }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(MAX_WINDOWED_ROWS);
  // An early item is NOT in the DOM — the window sits at the tail, not the head.
  await expect(component.getByText("Message 0", { exact: true })).toHaveCount(0);
});

test("bottom-anchored: mounts scrolled to the last item, not the first", async ({ mount }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  await expect(component.getByText("Message 0", { exact: true })).toHaveCount(0);
});

test("stick-to-bottom: appending while pinned at the end follows the new item into view", async ({ mount }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  await component.getByTestId("append").click();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toBeVisible();
});

test("a reader scrolled away from the end is NOT yanked when a new item appends", async ({ mount, page }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  // Scroll well away from the tail (up to roughly the middle of the list).
  await component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true }).hover();
  await page.mouse.wheel(0, -(ITEM_COUNT * ROW_HEIGHT_PX) / 2);
  const midIndex = Math.floor(ITEM_COUNT / 2);
  await expect(component.getByText(`Message ${midIndex}`, { exact: true })).toBeVisible();

  await component.getByTestId("append").click();

  // Still reading scrollback — the reader was never yanked to the new tail.
  await expect(component.getByText(`Message ${midIndex}`, { exact: true })).toBeVisible();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toHaveCount(0);
});

// The "sending a message strands you ~130px away from your own message" regression (live-diagnosed
// 2026-07-13). `followOnAppend` re-pins on COUNT growth only; a just-committed row + streaming ghost
// re-measure far past their estimate (a SIZE change), and virtual-core's resize anchor abandons the
// pin once one delta clears `scrollEndThreshold` — so the tail must be re-pinned on resize too.
test("stick-to-bottom on RESIZE: the tail row growing taller keeps the viewport pinned to the end", async ({ mount }) => {
  const component = await mount(<TailGrowthList initialCount={200} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Message 199", { exact: true })).toBeVisible();
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("true");

  // Grow the tail row 40 -> 400px — a size-only change far past the 80px threshold, no count change.
  await component.getByTestId("grow-tail").click();

  // The pin held: still at the true end (pre-fix this read false, stranding the reader ~360px up).
  await expect
    .poll(async () => {
      await component.getByTestId("read-status").click();
      return component.getByTestId("is-at-end").innerText();
    })
    .toBe("true");
});

test("the reader-scrolled-up guard survives a tail RESIZE: growth never yanks a history reader down", async ({ mount, page }) => {
  const component = await mount(<TailGrowthList initialCount={200} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Message 199", { exact: true })).toBeVisible();
  // Scroll up with a real wheel gesture (this is what flips follow OFF — see `stickToBottomRef`).
  await component.getByText("Message 199", { exact: true }).hover();
  await page.mouse.wheel(0, -(200 * ROW_HEIGHT_PX) / 2);
  await expect(component.getByText("Message 100", { exact: true })).toBeVisible();
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");

  await component.getByTestId("grow-tail").click();

  // Still reading history — a tail resize never re-pinned a reader who scrolled up.
  await expect(component.getByText("Message 100", { exact: true })).toBeVisible();
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");
});

// The no-GESTURE scroll channels — scrollbar-thumb drag, AT "scroll to", `scrollIntoView`, any raw
// `scrollTop` write — emit a bare `scroll` event with no wheel/touch/key. A listener-only guard misses
// them and yanks the reader back on the next resize (live-diagnosed 2026-07-13). This drives EXACTLY
// that channel: move scrollTop up + a bare `scroll` event, then a tail resize, and the reader must
// stay put. (Pre-marker: this scrolled the reader back to the tail.)
test("the reader-scrolled-up guard holds for a BARE scroll event (scrollbar/AT — no wheel/touch/key)", async ({ mount }) => {
  const component = await mount(<TailGrowthList initialCount={200} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText("Message 199", { exact: true })).toBeVisible();
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("true");

  // Move the scroll position up and fire ONLY a bare `scroll` event — no gesture of any kind.
  const scroll = component.locator('[data-slot="message-list-scroll"]');
  await scroll.evaluate((el) => {
    el.scrollTop = Math.max(0, el.scrollTop - 800);
    el.dispatchEvent(new Event("scroll"));
  });
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");

  // A new message ARRIVES (append grows the container → the seal's ResizeObserver fires even though
  // the old tail is now unmounted). It must NOT re-pin the externally-scrolled-away reader.
  await component.getByTestId("append-tall").click();
  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");
});

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedMessageList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});

test("the scroll wrapper exposes role=log + aria-live=polite (arriving messages are announced)", async ({ mount }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  const log = component.getByRole("log");
  await expect(log).toBeVisible();
  await expect(log).toHaveAttribute("aria-live", "polite");
});

// R7 (ui-primitive-contract, the systemic gap missing from all 3 virtual seals): the parent
// re-renders passing a freshly-DERIVED items array — not a stable module-const reference.
test("renders correctly when the parent passes a freshly-derived items array each render", async ({ mount }) => {
  const component = await mount(<DerivedItemsMessageList />);
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();

  await component.getByTestId("rerender").click();
  await expect(component.getByText("Alpha", { exact: true })).toBeVisible();
  await expect(component.getByText("Bravo", { exact: true })).toBeVisible();
  await expect(component.getByText("Charlie", { exact: true })).toBeVisible();
});

test("prepend stability: the id-keyed anchor keeps a mid-scroll reader's view in place when older history loads", async ({ mount, page }) => {
  const initialCount = 50;
  const component = await mount(<PrependableList initialCount={initialCount} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  // Scroll away from the bottom-anchored mount position to a mid-thread item.
  const midLabel = `Message ${Math.floor(initialCount / 2)}`;
  await component.getByText(`Message ${initialCount - 1}`, { exact: true }).hover();
  await page.mouse.wheel(0, -((initialCount * ROW_HEIGHT_PX) / 2));
  const anchor = component.getByText(midLabel, { exact: true });
  await expect(anchor).toBeVisible();
  const before = await anchor.boundingBox();
  if (before === null) {
    throw new Error("message-list CT: missing bounding box for the prepend-stability anchor");
  }

  await component.getByTestId("prepend").click();

  // The SAME item, by key, is still on screen at (near enough) the SAME viewport position — the
  // reader was never visually yanked by 20 items landing above their scroll position.
  await expect(anchor).toBeVisible();
  const after = await anchor.boundingBox();
  if (after === null) {
    throw new Error("message-list CT: missing bounding box for the prepend-stability anchor");
  }
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  // The newly-loaded older items landed ABOVE the viewport, not yanking the reader up to them.
  await expect(component.getByText("Older 0", { exact: true })).toHaveCount(0);
});

test("the follow-on-append scroll is instant (not smooth) under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors = [];
    const proto = Element.prototype as unknown as {
      scrollTo: (options?: ScrollToOptions) => void;
    };
    const original = proto.scrollTo;
    // A real `function` (not an arrow) — `this` must be the ACTUAL scrolling element for the native
    // call to succeed (calling with `this = Element.prototype` throws "Illegal invocation" and would
    // silently break the real scroll virtual-core depends on for its own follow-up measurements).
    proto.scrollTo = function patchedScrollTo(this: Element, options?: ScrollToOptions): void {
      if (options !== undefined) {
        (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors.push(options.behavior ?? null);
      }
      original.call(this, options);
    };
  });

  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  // Only care about the APPEND-triggered follow call, not the initial mount's own scrollToEnd.
  await page.evaluate(() => {
    (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors = [];
  });

  await component.getByTestId("append").click();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toBeVisible();

  const behaviors = await page.evaluate(() => (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors);
  expect(behaviors.length).toBeGreaterThan(0);
  expect(behaviors.at(-1)).toBe("auto");
});

// PD-119 mechanism (Task #26): the SAME rangeExtractor escape hatch already sealed + CT-proven on
// virtual-list, wired through this seal too.
test("rangeExtractor passthrough: a forced index stays mounted even off-screen of the bottom-anchored viewport", async ({ mount }) => {
  const component = await mount(<RangeExtractorMessageList itemCount={200} />);
  // Bottom-anchored: the viewport sits at the tail on mount, far from index 0.
  await expect(component.getByText("Message 199", { exact: true })).toBeVisible();
  // Only the custom rangeExtractor forcing index 0 into the range keeps it mounted off-screen.
  await expect(component.getByText("Message 0", { exact: true })).toHaveCount(1);
});

// PD-119 keep-mounted path (item-space `keepMounted` predicate). The stateful row holds ONLY local
// React state (a controlled input); off-screen unmount destroys it. These two tests prove the
// MECHANISM: the typed value SURVIVES a scroll-to-tail-and-back iff `keepMounted` matches the row.
const KEEP_MOUNTED_ITEMS = 200;
const KEEP_MOUNTED_SCROLL_PX = KEEP_MOUNTED_ITEMS * ROW_HEIGHT_PX; // clears the full list in one wheel
const TYPED_STATE = "kept-local-state";

test("keepMounted keeps a stateful row mounted off-screen, so its local state survives scroll-away", async ({ mount, page }) => {
  const component = await mount(<KeepMountedStateList keep={true} />);
  // Bottom-anchored: the tail is visible, index 0 (the input row) sits far above the window.
  await expect(component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true })).toBeVisible();
  await component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true }).hover();

  // Scroll to the top, type into the row's input.
  await page.mouse.wheel(0, -KEEP_MOUNTED_SCROLL_PX);
  const input = component.getByTestId("stateful-input");
  await expect(input).toBeVisible();
  await input.fill(TYPED_STATE);
  await expect(input).toHaveValue(TYPED_STATE);

  // Scroll to the tail — the pinned row is off-screen but still a mounted DOM node.
  await page.mouse.wheel(0, KEEP_MOUNTED_SCROLL_PX);
  await expect(component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true })).toBeVisible();
  await expect(component.getByTestId("stateful-input")).toHaveCount(1);

  // Scroll back to the top — the SAME row, its typed state intact (never unmounted).
  await page.mouse.wheel(0, -KEEP_MOUNTED_SCROLL_PX);
  await expect(component.getByTestId("stateful-input")).toHaveValue(TYPED_STATE);
});

test("WITHOUT keepMounted the same row unmounts off-screen and loses its local state (control)", async ({ mount, page }) => {
  const component = await mount(<KeepMountedStateList keep={false} />);
  await expect(component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true })).toBeVisible();
  await component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true }).hover();

  await page.mouse.wheel(0, -KEEP_MOUNTED_SCROLL_PX);
  const input = component.getByTestId("stateful-input");
  await expect(input).toBeVisible();
  await input.fill(TYPED_STATE);
  await expect(input).toHaveValue(TYPED_STATE);

  // Scroll to the tail — with no keep-mounted policy the row unmounts entirely.
  await page.mouse.wheel(0, KEEP_MOUNTED_SCROLL_PX);
  await expect(component.getByText(`Message ${KEEP_MOUNTED_ITEMS - 1}`, { exact: true })).toBeVisible();
  await expect(component.getByTestId("stateful-input")).toHaveCount(0);

  // Scroll back to the top — the row remounts FRESH, its typed state gone.
  await page.mouse.wheel(0, -KEEP_MOUNTED_SCROLL_PX);
  await expect(component.getByTestId("stateful-input")).toHaveValue("");
});

// §A.4/§F.6 "jump to latest" / reading-history primitives on the imperative handle.
test("isAtEnd/getDistanceFromEnd report the true pinned state, then reflect scrolling away", async ({ mount, page }) => {
  const initialCount = 200;
  const component = await mount(<HandleExposingList initialCount={initialCount} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${initialCount - 1}`, { exact: true })).toBeVisible();

  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("true");
  // Bottom-anchored at mount — the true distance from the end is (near enough) zero.
  const pinnedDistance = Number(await component.getByTestId("distance-from-end").innerText());
  expect(pinnedDistance).toBeLessThanOrEqual(2);

  // Scroll well away from the tail.
  await component.getByText(`Message ${initialCount - 1}`, { exact: true }).hover();
  await page.mouse.wheel(0, -((initialCount * ROW_HEIGHT_PX) / 2));
  const midIndex = Math.floor(initialCount / 2);
  await expect(component.getByText(`Message ${midIndex}`, { exact: true })).toBeVisible();

  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");
  const scrolledDistance = Number(await component.getByTestId("distance-from-end").innerText());
  expect(scrolledDistance).toBeGreaterThan(0);
});

// The exact `useCachedMeasurements` semantics verified against the shipped virtual-core source
// (message-list.tsx's own prop doc): a STATIC bypass, not an automatic hidden-only mode — it
// discards EVERY measurement, including a genuine resize, while true, and resumes real
// measurement the instant it's set back to false.
test("useCachedMeasurements discards a real resize while true, and resumes measuring once false", async ({ mount, page }) => {
  const component = await mount(<CachedMeasurementsList />);
  const viewport = component.locator('[data-slot="message-list-viewport"]');

  async function viewportHeight(): Promise<number> {
    const box = await viewport.boundingBox();
    if (box === null) {
      throw new Error("message-list CT: missing bounding box for the measured viewport");
    }
    return box.height;
  }

  // Two animation-frame turns — the ResizeObserver callback queue (and any React commit it
  // schedules) is flushed by this point in every evergreen browser; a real, un-discarded resize
  // is reliably reflected by here without resorting to an arbitrary sleep.
  async function flushResizeObserver(): Promise<void> {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  }

  // Baseline: NOT frozen — a real resize of row 0 (40 -> 140) is measured for real.
  await component.getByTestId("bump-row0").click();
  await expect.poll(viewportHeight, { intervals: [20, 50, 100] }).toBeGreaterThan(200);
  const grownHeight = await viewportHeight();

  // Freeze, then resize AGAIN (140 -> 240) — the ResizeObserver still fires, but `measureElement`
  // must discard the real entry and keep returning the CACHED (140) size, so the total measured
  // height must not move.
  await component.getByTestId("toggle-frozen").click();
  await component.getByTestId("bump-row0").click();
  await flushResizeObserver();
  expect(await viewportHeight()).toBe(grownHeight);

  // Unfreeze, then a NEW real resize (240 -> 340) is measured for real again.
  await component.getByTestId("toggle-frozen").click();
  await component.getByTestId("bump-row0").click();
  await expect.poll(viewportHeight, { intervals: [20, 50, 100] }).toBeGreaterThan(grownHeight);
});
