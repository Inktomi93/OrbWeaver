// CT: the MessageList seal — a bottom-anchored TanStack Virtual chat-thread list (ui-package-design
// §6.1/§9, un-parked). Asserts virtualization + bottom-anchor + stick-to-bottom (+ the no-yank flip
// side, + reduced-motion), matching virtual-list.ct.tsx's tripwire test for the shared discipline.
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import {
  AppendableList,
  BlockPaddedStickyList,
  CachedMeasurementsList,
  DerivedItemsMessageList,
  FractionalEstimateList,
  HandleExposingList,
  KeepMountedStateList,
  PinPromptList,
  PrependableList,
  RangeExtractorMessageList,
  StreamingTailList,
  TailGrowthList,
  UnboundedMessageList,
} from "./message-list.fixtures.tsx";

const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 200; // 5 rows visible
const ITEM_COUNT = 500;
const MAX_WINDOWED_ROWS = 20; // a bounded 200px window + the default two-row overscan stays compact

// ── #204: block breathing lives in the SCROLL CONTENT (`blockPaddingToken`), never as CSS padding on
// the scroll container. Chrome resolves a descendant's `position: sticky; top: 0` against the
// container's CONTENT box, so container padding pins the band `padding-top` below the visible top and a
// strip of the row's own content renders permanently above it, guillotined. With the padding in the
// virtualizer's coordinate space the band pins FLUSH and the first row still breathes off the edge.
test("blockPaddingToken: a sticky top-0 band pins FLUSH at the scrollport top; the breathing rides the content, not the container", async ({ mount }) => {
  const component = await mount(<BlockPaddedStickyList listHeightPx={LIST_HEIGHT_PX} tallRowPx={800} />);
  const scroller = component.locator('[data-slot="message-list-scroll"]');
  // The container itself carries no block padding (the sticky-correctness half).
  await expect(scroller).toHaveCSS("padding-top", "0px");
  await expect(scroller).toHaveCSS("padding-bottom", "0px");
  // Park the viewport mid-way inside the tall first row, where the band must be pinned.
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 400;
  });
  await expect
    .poll(
      async () =>
        await scroller.evaluate((el: HTMLElement) => {
          const band = el.querySelector('[data-testid="sticky-band"]');
          return band === null ? Number.NaN : band.getBoundingClientRect().top - el.getBoundingClientRect().top;
        }),
    )
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(
      async () =>
        await scroller.evaluate((el: HTMLElement) => {
          const band = el.querySelector('[data-testid="sticky-band"]');
          return band === null ? Number.NaN : band.getBoundingClientRect().top - el.getBoundingClientRect().top;
        }),
    )
    .toBeLessThan(1);
  // The breathing half: scrolled to the very top, row 0 sits one spacing.block (12px) inside the edge.
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 0;
  });
  const firstRowGap = await scroller.evaluate((el: HTMLElement) => {
    const row = el.querySelector('[data-slot="message-list-row"]');
    return row === null ? Number.NaN : row.getBoundingClientRect().top - el.getBoundingClientRect().top;
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Math.round(firstRowGap)).toBe(12);
});

test("renders only a window of a 500-item list", async ({ mount }) => {
  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeGreaterThan(0);
  await expect.poll(async () => await component.locator("[data-index]").count()).toBeLessThan(MAX_WINDOWED_ROWS);
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

// PD-147 pin-prompt placement (the deterministic half; the live streaming FEEL is a side-eye pass). The
// pinned row's top must land at the scroll viewport's top after `pinToIndex` — returns that px delta.
async function rowTopDelta(component: import("@playwright/experimental-ct-react").MountResult, rowLabel: string): Promise<number> {
  const scrollBox = await component.locator('[data-slot="message-list-scroll"]').boundingBox();
  const rowBox = await component.getByText(rowLabel, { exact: true }).boundingBox();
  if (scrollBox === null || rowBox === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(rowBox.y - scrollBox.y);
}

// The inverse of rowTopDelta: how far a row's BOTTOM sits from the scroll viewport's bottom edge. Near
// zero means the row is the last thing on screen with no trailing void below it.
async function rowBottomDelta(component: import("@playwright/experimental-ct-react").MountResult, rowLabel: string): Promise<number> {
  const scrollBox = await component.locator('[data-slot="message-list-scroll"]').boundingBox();
  const rowBox = await component.getByText(rowLabel, { exact: true }).boundingBox();
  if (scrollBox === null || rowBox === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(rowBox.y + rowBox.height - (scrollBox.y + scrollBox.height));
}

// The virtualizer's inner sizing div — its height IS the total scrollable size, so the pin spacer
// (`paddingEnd`) shows up here as extra height above the real content and its collapse is visible.
async function viewportSizingHeight(component: import("@playwright/experimental-ct-react").MountResult): Promise<number> {
  const box = await component.locator('[data-slot="message-list-viewport"]').boundingBox();
  return box === null ? Number.NaN : box.height;
}

test("pin-prompt: pinToIndex scrolls a mid-list row to the viewport top", async ({ mount }) => {
  const component = await mount(<PinPromptList count={500} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} pinIndex={250} />);
  // Bottom-anchored on mount — index 250 sits well above the viewport, not at its top.
  await component.getByTestId("pin").click();
  await expect.poll(() => rowTopDelta(component, "Message 250")).toBeLessThan(2);
});

test("pin-prompt: the bottom spacer lets a NEAR-END row still reach the top (short-reply pin)", async ({ mount }) => {
  // Pin the LAST row: its start offset exceeds the un-spaced max scroll, so only the paddingEnd spacer
  // lets it climb to the top. Pre-spacer this row clamps well below the top.
  const lastIndex = 499;
  const component = await mount(<PinPromptList count={500} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} pinIndex={lastIndex} />);
  await component.getByTestId("pin").click();
  await expect.poll(() => rowTopDelta(component, `Message ${lastIndex}`)).toBeLessThan(2);
});

// The other half of "the mode does something": under `follow` the SAME pinToIndex call is a real no-op —
// the sticky tail keeps owning placement, so the target row does NOT climb to the top and the list stays
// pinned to the last row. This is what makes `follow` byte-identical to the pre-PD-147 seal.
test("follow mode: pinToIndex is inert — the list stays at the tail", async ({ mount }) => {
  const component = await mount(<PinPromptList count={500} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} pinIndex={250} scrollMode="follow" />);
  await expect(component.getByText("Message 499", { exact: true })).toBeVisible();
  await component.getByTestId("pin").click();
  // Row 250 never mounts (the window is at the tail) and the last row is still the one on screen.
  await expect(component.getByText("Message 250", { exact: true })).toHaveCount(0);
  await expect(component.getByText("Message 499", { exact: true })).toBeVisible();
  expect(await rowBottomDelta(component, "Message 499")).toBeLessThan(LIST_HEIGHT_PX);
});

// PD-147 void-jump regression: scrollToEnd computes the end offset from getMaxScrollOffset() =
// scrollHeight - clientHeight, which INCLUDES the live pin spacer — so a jump while pinned landed in the
// trailing void, pushing the real content above the fold. The fix: an explicit jump abandons the pin
// (clears the spacer) BEFORE the offset is computed, landing on the last REAL row.
test("pin-prompt: jumping to latest while pinned lands on the last real row, not the spacer void", async ({ mount }) => {
  const lastIndex = 499;
  // Pin a near-end row: rows 498/499 are a SHORT tail below the pin, so the bottom spacer stays armed.
  const component = await mount(<PinPromptList count={500} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} pinIndex={497} />);
  const baselineSizing = await viewportSizingHeight(component);

  await component.getByTestId("pin").click();
  await expect.poll(() => rowTopDelta(component, "Message 497")).toBeLessThan(2);
  // The spacer inflated the total scrollable height past the real content.
  expect(await viewportSizingHeight(component)).toBeGreaterThan(baselineSizing);

  await component.getByTestId("jump").click();
  // The last REAL row sits at the viewport bottom (pre-fix it was shoved above the fold into the void).
  await expect.poll(() => rowBottomDelta(component, `Message ${lastIndex}`)).toBeLessThan(2);
  // The spacer collapsed — total scrollable height is back to the real content size.
  await expect.poll(async () => Math.abs((await viewportSizingHeight(component)) - baselineSizing)).toBeLessThan(2);
});

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedMessageList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});

// The NAMED LOG half. Its `aria-live` half moved to the tail-row test at the foot of this file: the
// wrapper is still the `role="log"` a reader navigates to by landmark, but it is no longer the live
// REGION — see the #1499 note there (and packages/ui/src/primitives/message-list/announce.ts).
test("the scroll wrapper exposes a NAMED role=log a reader can find", async ({ mount }) => {
  const component = await mount(
    <AppendableList ariaLabel="Conversation messages" initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />,
  );
  const log = component.getByRole("log", { name: "Conversation messages" });
  await expect(log).toBeVisible();
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
  // In-page instrumentation below — `globalThis`/`Element.prototype` in the mounted browser context
  // carry no app type; each cast is the monkeypatch scaffolding itself, not a fabricated domain value.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors = [];
    // @orb-waive no-test-fabrication(unknown): in-page Element.prototype scaffolding (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const proto = Element.prototype as unknown as {
      scrollTo: (options?: ScrollToOptions) => void;
    };
    const original = proto.scrollTo;
    // A real `function` (not an arrow) — `this` must be the ACTUAL scrolling element for the native
    // call to succeed (calling with `this = Element.prototype` throws "Illegal invocation" and would
    // silently break the real scroll virtual-core depends on for its own follow-up measurements).
    proto.scrollTo = function patchedScrollTo(this: Element, options?: ScrollToOptions): void {
      if (options !== undefined) {
        // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (see above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
        (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors.push(options.behavior ?? null);
      }
      original.call(this, options);
    };
  });

  const component = await mount(<AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} />);
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  // Only care about the APPEND-triggered follow call, not the initial mount's own scrollToEnd.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (see the mount-time instrumentation above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors = [];
  });

  await component.getByTestId("append").click();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toBeVisible();

  // @orb-waive no-test-fabrication(unknown): in-page globalThis scaffolding (see the mount-time instrumentation above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const behaviors = await page.evaluate(() => (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(behaviors.length).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(pinnedDistance).toBeLessThanOrEqual(2);

  // Scroll well away from the tail.
  await component.getByText(`Message ${initialCount - 1}`, { exact: true }).hover();
  await page.mouse.wheel(0, -((initialCount * ROW_HEIGHT_PX) / 2));
  const midIndex = Math.floor(initialCount / 2);
  await expect(component.getByText(`Message ${midIndex}`, { exact: true })).toBeVisible();

  await component.getByTestId("read-status").click();
  await expect(component.getByTestId("is-at-end")).toHaveText("false");
  const scrolledDistance = Number(await component.getByTestId("distance-from-end").innerText());
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
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

// ── FOLLOW-MODE YIELDS TO THE READER (owner dogfood 2026-08-13) ───────────────────────────────────
//
// "Follow-mode is jumpy when you manually scroll up to read the top mid-generation." Root-caused on a
// LIVE streaming turn (2026-08-14, :5173, with `scrollTo`/`scrollTop` patched to capture stacks): the
// yanker is NOT this seal's ResizeObserver — it is virtual-core's own end-anchor reconciliation,
// reaching the DOM through our `scrollToFn`:
//
//   Object.scrollToFn (packages/ui/src/primitives/message-list/message-list.tsx)
//     | Virtualizer._scrollToOffset | Virtualizer.reconcileScroll
//
// A 500px up-scroll was dragged back by FOUR such writes inside 385ms. Worse, each one records
// `programmaticTopRef`, so the scroll event it produces MATCHES `expected` and the follow-intent
// detector early-returns — the reader's move is never seen at all. The fix is a YIELD keyed on real
// user INPUT (wheel/touch/keys/pointer), not on intent: while the reader's hand is on the axis every
// programmatic write is dropped. Intent detection itself is byte-unchanged.
const STREAM_TAIL_ROWS = 60;
/** A real streaming reply is thousands of px tall — see `StreamingTailListProps.tailStartPx` for why a
 *  SHORT tail makes this whole block green-by-absence. */
const STREAM_TAIL_START_PX = 1600;
/** The fixture re-publishes the container's real scrollTop every frame, so a CT can watch the fight. */
const readScrollTop = async (host: Locator): Promise<number> => Number(await host.getByTestId("scroll-top").innerText());

const streamingTail = (): ReactElement => (
  <StreamingTailList initialCount={STREAM_TAIL_ROWS} listHeightPx={LIST_HEIGHT_PX} rowHeightPx={ROW_HEIGHT_PX} tailStartPx={STREAM_TAIL_START_PX} />
);

/** Park the mouse over the scroll container so `page.mouse.wheel` lands on it. */
async function hoverScroller(host: Locator, page: Page): Promise<void> {
  const box = await host.locator('[data-slot="message-list-scroll"]').boundingBox();
  if (box === null) {
    throw new Error("message-list CT: no box for the streaming scroll container");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The highest scrollTop seen over a fixed sampling trace. THE ASSERTION THAT MATTERS IS STABILITY, not
 * "below where I started": an earlier draft asserted only `max < beforeTheWheel` and passed on the OLD
 * source while the reader was being dragged 12px every 100ms — 1.5s of that is still below a 400px
 * wheel. "Nothing moved me while the stream ran" has no state to wait FOR; the trace IS the assertion.
 */
async function highestScrollTopSeen(host: Locator, page: Page): Promise<number> {
  let highest = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < SETTLE_SAMPLES; i += 1) {
    // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: the sampling interval of a stability trace — there is no state to wait FOR, the absence of movement is the assertion.
    await page.waitForTimeout(SETTLE_SAMPLE_MS);
    highest = Math.max(highest, await readScrollTop(host));
  }
  return highest;
}

const SETTLE_SAMPLE_MS = 75;
/** 20 × 75ms = 1.5s — well past the measured yank window (four writes inside 385ms). */
const SETTLE_SAMPLES = 20;
/** Sub-pixel slack: a fractional scrollTop rounding one px is not a yank. */
const PARKED_SLACK_PX = 2;

test("an up-scroll during streaming is NOT dragged back by the tail march", async ({ mount, page }) => {
  const component = await mount(streamingTail());
  const atMount = await readScrollTop(component);
  await component.getByTestId("start-stream").click();
  // The premise, asserted not assumed: the march is genuinely running before the wheel (the tail keeps
  // growing and the viewport keeps following it down).
  await expect.poll(async (): Promise<number> => readScrollTop(component)).toBeGreaterThan(atMount);

  await hoverScroller(component, page);
  const before = await readScrollTop(component);
  await page.mouse.wheel(0, -400);
  await expect.poll(async (): Promise<number> => readScrollTop(component)).toBeLessThan(before);
  const parked = await readScrollTop(component);

  expect(await highestScrollTopSeen(component, page)).toBeLessThanOrEqual(parked + PARKED_SLACK_PX);
});

// A FENCE, not a defect proof: this one passes on the pre-fix source too (the yank re-pinned the reader
// anyway). It is here because the fix's whole risk is over-yielding — a march that never comes back is
// the regression this catches.
test("following RESUMES once the reader returns to the tail", async ({ mount, page }) => {
  const component = await mount(streamingTail());
  await component.getByTestId("start-stream").click();
  await hoverScroller(component, page);
  const before = await readScrollTop(component);
  await page.mouse.wheel(0, -400);
  await expect.poll(async (): Promise<number> => readScrollTop(component)).toBeLessThan(before);
  const away = await readScrollTop(component);

  // Back to the tail by hand: the geometry-based intent detector re-arms and the march takes over
  // again — the list keeps climbing on its own, past anything the wheel could have produced.
  await page.mouse.wheel(0, 4000);
  await expect.poll(async (): Promise<number> => readScrollTop(component), { intervals: [100, 200, 300, 500], timeout: 8000 }).toBeGreaterThan(away);
  const resumed = await readScrollTop(component);
  await expect.poll(async (): Promise<number> => readScrollTop(component), { intervals: [100, 200, 300, 500], timeout: 8000 }).toBeGreaterThan(resumed);
});

test("the yield holds under prefers-reduced-motion", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(streamingTail());
  await component.getByTestId("start-stream").click();
  await hoverScroller(component, page);
  const before = await readScrollTop(component);
  await page.mouse.wheel(0, -400);
  await expect.poll(async (): Promise<number> => readScrollTop(component)).toBeLessThan(before);
  const parked = await readScrollTop(component);

  expect(await highestScrollTopSeen(component, page)).toBeLessThanOrEqual(parked + PARKED_SLACK_PX);
});

// ── #1499: WHAT A VIRTUALIZED LOG ANNOUNCES (packages/ui/src/primitives/message-list/announce.ts) ──
// `role="log"` carries an implicit `aria-live="polite"`, and the element carrying it is the virtualizer's
// SCROLL CONTAINER — so every historical row the virtualizer mounted on a scroll-back was an "addition"
// inside a live region and a screen reader read the thread out at a reader who was paging back through it.
// The container declares OFF explicitly (omission cannot drop the implicit politeness) and the live region
// moves to the APPEND POINT, which is where genuinely new content — the streaming tail — arrives.
test("only the TAIL row is a live region: the container is aria-live=off and history announces nothing", async ({ mount }) => {
  const component = await mount(
    <AppendableList initialCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} listHeightPx={LIST_HEIGHT_PX} ariaLabel="Conversation messages" />,
  );
  const scroller = component.locator('[data-slot="message-list-scroll"]');
  await expect(scroller).toHaveAttribute("role", "log");
  await expect(scroller).toHaveAttribute("aria-live", "off");

  // Bottom-anchored at mount: exactly one live region, and it is the last item — not the container.
  const live = component.locator('[aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute("aria-posinset", String(ITEM_COUNT));

  // A genuinely new message MOVES the live region to the new tail — the announcement the log exists for.
  await component.getByTestId("append").click();
  await expect(component.locator('[aria-live="polite"]')).toHaveCount(1);
  await expect(component.locator('[aria-live="polite"]')).toHaveAttribute("aria-posinset", String(ITEM_COUNT + 1));

  // Scrolled back to the top, the mounted rows are ALL history: no live region is present at all, so
  // remounting them says nothing.
  await scroller.evaluate((el: HTMLElement) => {
    el.scrollTop = 0;
  });
  await expect(component.locator('[data-slot="message-list-row"]').first()).toHaveAttribute("aria-posinset", "1");
  await expect(component.locator('[aria-live="polite"]')).toHaveCount(0);
});

// ── #1362: THE ROW LANDINGS ARE INTEGERS (integer-line-boxes.md Law 3) ──────────────────────────────
// `directDomUpdatesMode: "position"` writes `el.style.top = ${item.start}px` on every row, so a
// fractional `item.start` puts the row — and every `backdrop-filter` layer inside it — between device
// pixels, where the composited raster is resampled and the glyphs blur. Measured on the isolated stage
// BEFORE the fix: `li[data-slot=message-list-row]` at `top -0.484 device px` under an integer-landing
// `ol[data-slot=message-list-viewport]`, carried into `promoted-layer-offset` on that row's own bubble
// and swipe strip plus an `off-grid-text` on the strip's chevron. virtual-core already rounds MEASURED
// sizes, so the only fractional input is the caller's estimate — which the chat transcript's calibrated
// `96 + chars * 0.28` is by construction. The assertion reads the RENDERED inline style rather than any
// new API, so it fails against the unmodified primitive.
test("#1362: every rendered row's written top is an integer, even under a fractional estimateSize", async ({ mount }) => {
  const component = await mount(<FractionalEstimateList />);
  const rows = component.locator('[data-slot="message-list-row"]');
  // Barrier on the SETTLED windowed set: the bottom-anchor scroll and the first measurement pass both
  // land before this resolves, so the tops read below are the ones the reader actually sees.
  await expect.poll(async () => await rows.count()).toBeGreaterThan(1);
  const readTops = async (): Promise<readonly string[]> =>
    await component.evaluate((root) => [...root.querySelectorAll('[data-slot="message-list-row"]')].map((el) => (el as HTMLElement).style.top));
  // The positive control on the population, polled like the verdict below it: a zero-length or
  // unit-less read would satisfy the integer assertion vacuously, which is the exact shape of a fence.
  await expect.poll(async () => (await readTops()).filter((t) => t.endsWith("px") && t.length > 2).length).toBeGreaterThan(1);
  await expect.poll(async () => (await readTops()).filter((t) => !Number.isInteger(Number.parseFloat(t)))).toEqual([]);
});
