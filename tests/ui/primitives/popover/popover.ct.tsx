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
  const box = await popup.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.height ?? 0).toBeLessThanOrEqual(viewportHeight);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight + 1);
  const scroll = await popup.evaluate((el) => ({ client: el.clientHeight, content: el.scrollHeight }));
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
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.scrim"].value);
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
