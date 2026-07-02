// CT: the MessageList seal — a bottom-anchored TanStack Virtual chat-thread list (ui-package-design
// §6.1/§9, un-parked). Asserts virtualization + bottom-anchor + stick-to-bottom (+ the no-yank flip
// side, + reduced-motion), matching virtual-list.ct.tsx's tripwire test for the shared discipline.
import { expect, test } from "@playwright/experimental-ct-react";
import { AppendableList, UnboundedMessageList } from "./message-list.fixtures";

const ROW_HEIGHT_PX = 40;
const LIST_HEIGHT_PX = 200; // 5 rows visible
const ITEM_COUNT = 500;
const MAX_WINDOWED_ROWS = 60; // a bounded 200px window + overscan(10) is ~2 dozen rows

test("renders only a window of a 500-item list", async ({ mount }) => {
  const component = await mount(
    <AppendableList
      initialCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  const rendered = await component.locator("[data-index]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(MAX_WINDOWED_ROWS);
  // An early item is NOT in the DOM — the window sits at the tail, not the head.
  await expect(component.getByText("Message 0", { exact: true })).toHaveCount(0);
});

test("bottom-anchored: mounts scrolled to the last item, not the first", async ({ mount }) => {
  const component = await mount(
    <AppendableList
      initialCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  await expect(component.getByText("Message 0", { exact: true })).toHaveCount(0);
});

test("stick-to-bottom: appending while pinned at the end follows the new item into view", async ({
  mount,
}) => {
  const component = await mount(
    <AppendableList
      initialCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  await component.getByTestId("append").click();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toBeVisible();
});

test("a reader scrolled away from the end is NOT yanked when a new item appends", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <AppendableList
      initialCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
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

test("the tripwire THROWS when the parent gives no bounded height", async ({ mount, page }) => {
  await mount(<UnboundedMessageList itemCount={ITEM_COUNT} rowHeightPx={ROW_HEIGHT_PX} />);
  // The boundary replaces the mounted subtree, so the component handle goes stale — use the page.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("no bounded height");
});

test("the follow-on-append scroll is instant (not smooth) under prefers-reduced-motion", async ({
  mount,
  page,
}) => {
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
        (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors.push(
          options.behavior ?? null,
        );
      }
      original.call(this, options);
    };
  });

  const component = await mount(
    <AppendableList
      initialCount={ITEM_COUNT}
      rowHeightPx={ROW_HEIGHT_PX}
      listHeightPx={LIST_HEIGHT_PX}
    />,
  );
  await expect(component.getByText(`Message ${ITEM_COUNT - 1}`, { exact: true })).toBeVisible();
  // Only care about the APPEND-triggered follow call, not the initial mount's own scrollToEnd.
  await page.evaluate(() => {
    (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors = [];
  });

  await component.getByTestId("append").click();
  await expect(component.getByText(`Message ${ITEM_COUNT}`, { exact: true })).toBeVisible();

  const behaviors = await page.evaluate(
    () => (globalThis as unknown as { __behaviors: (string | null)[] }).__behaviors,
  );
  expect(behaviors.length).toBeGreaterThan(0);
  expect(behaviors.at(-1)).toBe("auto");
});
