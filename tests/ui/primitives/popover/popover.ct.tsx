import { Popover, PopoverArrow, PopoverClose, PopoverDescription, PopoverPopup, PopoverTitle, PopoverTrigger, PopoverViewport } from "@orb/ui/popover";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { PopoverHandleHarness } from "./popover-handle.fixtures.tsx";

// A body taller than any CT viewport — the shape that exposes a popup ignoring `--available-height`.
const TALL_BODY_ROWS = Array.from({ length: 60 }, (_unused, index) => `Row ${index + 1}`);

// A popover body that outgrows the screen must stay INSIDE the viewport and scroll: Base UI's
// Positioner publishes `--available-height`, and a popup that ignores it renders at full content
// height with its tail unreachable. Only the rendered box can prove this.
test("a tall popover clamps to the available height and scrolls instead of running off-screen", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
        {TALL_BODY_ROWS.map((row) => (
          <p key={row}>{row}</p>
        ))}
      </PopoverPopup>
    </Popover>,
  );
  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();

  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(viewportHeight).toBeGreaterThan(0);
  let box = await popup.boundingBox();
  await expect
    .poll(async () => {
      box = await popup.boundingBox();
      return box;
    })
    .not.toBeNull();
  expect(box?.height ?? 0).toBeLessThanOrEqual(viewportHeight);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight + 1);
  const scroll = await popup.evaluate((el) => ({ client: el.clientHeight, content: el.scrollHeight }));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(scroll.content).toBeGreaterThan(scroll.client);
  await popup.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByText("Row 60", { exact: true })).toBeInViewport();
});

// The OPTIONAL multi-trigger transition container (Base UI Popover.Viewport) — wrapping the body in
// it must leave the popover's own content and dismissal untouched.
test("PopoverViewport wraps the body without changing the popover's behaviour", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverViewport>
          <PopoverTitle>Details</PopoverTitle>
          <PopoverDescription>Everything you need to know.</PopoverDescription>
        </PopoverViewport>
      </PopoverPopup>
    </Popover>,
  );
  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();
  await expect(page.locator('[data-slot="popover-viewport"]')).toBeVisible();
  await expect(popup).toContainText("Everything you need to know.");
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
});

test("opens on trigger click and closes on Escape", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
        <PopoverDescription>Everything you need to know.</PopoverDescription>
      </PopoverPopup>
    </Popover>,
  );

  await expect(page.getByText("Details", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Everything you need to know.");

  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
});

// TRANSITION-SWEEP (2026-08-08) — the anchored half of the same fence the dialog CT pins for the modal
// half. `OVERLAY_MOTION.anchoredPopup` is shared by select/menu/tooltip/autocomplete/combobox/popover, and
// the popover popup is the FOCUS STOP among them: Base UI's focus manager stamps a managed `tabindex` on a
// `role="dialog"` floating element and moves focus into it on open. `outline-*` is interpolable, so
// `transition: all` faded the focus ring in over --motion-fast (the toast root's measured defect).
//
// Read UNPOLLED and ONCE — a retrying matcher would wait out a fade and call an interpolating ring a pass.
test("the anchored popup is a focus stop whose transition names its properties — never `all`", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      {/* No focusable content: the focus manager then makes the popup ITSELF the tab stop, which is the
          exact element carrying the shared motion fragment. */}
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
        <PopoverDescription>Everything you need to know.</PopoverDescription>
      </PopoverPopup>
    </Popover>,
  );

  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toBeFocused();
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).not.toBe("all");
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).not.toContain("outline");
  // …while the enter/exit fade+scale keeps both of its halves. Dropping either silently kills that half.
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).toContain("opacity");
  await expect.poll(async () => await popup.evaluate((element: Element) => getComputedStyle(element).transitionProperty)).toContain("scale");
});

test("closes on outside click", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
      </PopoverPopup>
    </Popover>,
  );

  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(popup).toBeHidden();
});

test("close button dismisses the popover", async ({ mount, page }) => {
  await mount(
    <Popover defaultOpen={true}>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
        <PopoverClose>Done</PopoverClose>
      </PopoverPopup>
    </Popover>,
  );

  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(popup).toBeHidden();
});

test("renders an arrow inside the popup", async ({ mount, page }) => {
  await mount(
    <Popover defaultOpen={true}>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverArrow />
        <PopoverTitle>Details</PopoverTitle>
      </PopoverPopup>
    </Popover>,
  );

  await expect(page.locator('[data-slot="popover-arrow"]')).toBeVisible();
});

test("backdrop renders with the scrim token only when enabled", async ({ mount, page }) => {
  await mount(
    <Popover defaultOpen={true}>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup backdrop={true}>
        <PopoverTitle>Details</PopoverTitle>
      </PopoverPopup>
    </Popover>,
  );

  const backdrop = page.locator('[data-slot="popover-backdrop"]');
  await expect(backdrop).toBeVisible();
  // The theme-aware overlay token (D43 §11.4) — never bg-black/50.
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.backdrop"].value);
});

test("no backdrop element when the prop is omitted", async ({ mount, page }) => {
  await mount(
    <Popover defaultOpen={true}>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
      </PopoverPopup>
    </Popover>,
  );

  await expect(page.locator('[data-slot="popover-popup"]')).toBeVisible();
  await expect(page.locator('[data-slot="popover-backdrop"]')).toHaveCount(0);
});

// createHandle: opening the popover imperatively via the detached handle routes the trigger payload
// to the Root's render-function children (harness in ./popover-handle.fixtures — Playwright CT needs
// the mounted component in its own module).
test("opens imperatively via a detached handle and routes the trigger payload to content", async ({ mount, page }) => {
  await mount(<PopoverHandleHarness />);

  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Open remotely" }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Reached content");
});

// ── #663: width="stable" — min(24rem, --available-width) ────────────────────────────────────────────
// The receipt this variant exists for: a plain `min-w-cq-sm` className forced 24rem/384px regardless of
// how much room the positioner actually had, and OVERFLOWED a narrow real host — 384px rendered inside
// 376.09px of available width at a 384px docked pane (rule-preset-picker, #655/#663). A width MATRIX,
// not a point measurement: the cap arm (room to spare) and the constrained arm (a real docked pane, at
// the BROWSER viewport's own width — a wrapping `<div>` narrower than the viewport does NOT constrain
// Base UI's Positioner, which solves against the viewport/boundary, not the parent container).
test.describe('width="stable"', () => {
  test("at a roomy mount, it takes the full cap — not a shrink-wrapped content width", async ({ mount, page }) => {
    await mount(
      <Popover defaultOpen={true}>
        <PopoverTrigger>Show details</PopoverTrigger>
        <PopoverPopup width="stable">
          <PopoverTitle>Details</PopoverTitle>
        </PopoverPopup>
      </Popover>,
    );
    const popup = page.locator('[data-slot="popover-popup"]');
    await expect(popup).toBeVisible();
    const box = await popup.boundingBox();
    // 24rem at the default 16px root = 384px (`--container-cq-sm`) — the cap, with plenty of room to
    // spare at this CT's default 1280px viewport.
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(380);
    expect(box?.width ?? 0).toBeLessThanOrEqual(388);
  });

  // The docked-pane geometry: the whole BROWSER viewport at the pane's own width, not a narrow wrapper
  // div inside a roomy one — the positioner solves against the viewport/boundary, so only a narrow
  // viewport reproduces "less room than the cap" the way the real docked pane does.
  test.describe("at the docked-pane geometry (a 384px real host, not the CT's roomy default)", () => {
    test.use({ viewport: { width: 384, height: 700 } });

    // RED FIRST (the shape #655 measured wrong): a plain `min-w-cq-sm` call-site className forces the
    // cap regardless of how much room the positioner has, and overflows the narrow host.
    test("a plain min-w-cq-sm className overflows the narrow host (the defect, reproduced)", async ({ mount, page }) => {
      await mount(
        <Popover defaultOpen={true}>
          <PopoverTrigger>Add a rule</PopoverTrigger>
          <PopoverPopup align="start" className="min-w-cq-sm">
            <PopoverTitle>Add a rule</PopoverTitle>
          </PopoverPopup>
        </Popover>,
      );
      const popup = page.locator('[data-slot="popover-popup"]');
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      const viewportWidth = page.viewportSize()?.width ?? 0;
      expect(viewportWidth).toBeGreaterThan(0);
      // The overflow, as a number: the popup's right edge runs PAST the viewport it is docked inside.
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThan(viewportWidth);
    });

    test('width="stable" shrinks to the real room instead of overflowing it', async ({ mount, page }) => {
      await mount(
        <Popover defaultOpen={true}>
          <PopoverTrigger>Add a rule</PopoverTrigger>
          <PopoverPopup align="start" width="stable">
            <PopoverTitle>Add a rule</PopoverTitle>
          </PopoverPopup>
        </Popover>,
      );
      const popup = page.locator('[data-slot="popover-popup"]');
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      const viewportWidth = page.viewportSize()?.width ?? 0;
      expect(viewportWidth).toBeGreaterThan(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth + 1);
      // …and it shrank BELOW the cap — proof the `--available-width` half of `min()` actually won here,
      // not just that nothing overflowed by coincidence.
      expect(box?.width ?? 0).toBeLessThan(384);
    });
  });
});
