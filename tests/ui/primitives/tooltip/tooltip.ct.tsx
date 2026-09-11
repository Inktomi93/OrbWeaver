import { Tooltip, TooltipArrow, TooltipPopup, TooltipTrigger, TooltipViewport } from "@orb/ui/tooltip";
import { expect, test } from "@playwright/experimental-ct-react";
import { TooltipHandleHarness } from "./tooltip-handle.fixtures.tsx";

/** The caller's OWN description target — one static node in one mount, so no `useId` collision exists. */
const CALLER_HINT_ID = "ct-hint";

// The OPTIONAL multi-trigger transition container (Base UI Tooltip.Viewport). It must not break the
// seal's own name/description wiring — the popup keeps role="tooltip" and the trigger keeps pointing
// at it, with the label reachable through the extra wrapper.
test("TooltipViewport wraps the label without breaking the describedby wiring", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>
        <TooltipViewport>Regenerate the last reply</TooltipViewport>
      </TooltipPopup>
    </Tooltip>,
  );
  await page.getByRole("button", { name: "Regenerate" }).hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("role", "tooltip");
  await expect(page.locator('[data-slot="tooltip-viewport"]')).toHaveText("Regenerate the last reply");
  const describedBy = await page.getByRole("button", { name: "Regenerate" }).getAttribute("aria-describedby");
  await expect(popup).toHaveAttribute("id", describedBy ?? "");
});

test("shows on hover and hides when the pointer leaves", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  await expect(page.getByText("Regenerate the last reply")).toBeHidden();

  await page.getByRole("button", { name: "Regenerate" }).hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  // text-label (--text-label: 0.8125rem = 13px) must survive tailwind-merge alongside the
  // text-popover-foreground color (the extended font-size classGroup in variants.ts).
  await expect(popup).toHaveCSS("font-size", "13px");

  await page.mouse.move(600, 400);
  await expect(page.getByText("Regenerate the last reply")).toBeHidden();
});

// Base UI 1.6's Tooltip omits the WCAG name/description relationship; the seal adds it (role="tooltip" on
// the popup + a matched aria-describedby on the trigger), so a screen reader tabbing to the trigger gets the
// tooltip content as its description.
test("wires role=tooltip + aria-describedby between trigger and popup", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  const trigger = page.getByRole("button", { name: "Regenerate" });
  await trigger.hover();

  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toHaveRole("tooltip");
  let describedBy = await trigger.getAttribute("aria-describedby");
  await expect
    .poll(async () => {
      describedBy = await trigger.getAttribute("aria-describedby");
      return describedBy;
    })
    .not.toBeNull();
  await expect(popup).toHaveAttribute("id", describedBy ?? "");
});

test("renders an arrow inside the popup", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>
        <TooltipArrow />
        Regenerate the last reply
      </TooltipPopup>
    </Tooltip>,
  );

  await page.getByRole("button", { name: "Regenerate" }).hover();
  await expect(page.locator('[data-slot="tooltip-arrow"]')).toBeVisible();
});

test("shows on keyboard focus", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeFocused();
  await expect(page.getByText("Regenerate the last reply")).toBeVisible();
});

// createHandle: opening the tooltip imperatively via the detached handle routes the trigger payload
// to the Root render-function children (harness in ./tooltip-handle.fixtures).
test("opens imperatively via a detached handle and routes the trigger payload to content", async ({ mount, page }) => {
  await mount(<TooltipHandleHarness />);

  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Open remotely" }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Reached content");
});

// #1499 — A CALLER'S OWN DESCRIPTION IS ADDITIVE, NEVER A REPLACEMENT. `aria-describedby` is a
// space-separated ID LIST, and the seal's id is the only thing pointing at the popup; when the trigger's
// props spread landed AFTER the seal's attribute, a caller passing its own hint id silently unwired the
// tooltip — the popup still rendered under the generated id, referenced by nothing.
test("a caller-supplied aria-describedby is MERGED with the seal's, never replacing it", async ({ mount, page }) => {
  await mount(
    <div>
      <span id={CALLER_HINT_ID}>Also mentioned elsewhere</span>
      <Tooltip>
        <TooltipTrigger aria-describedby={CALLER_HINT_ID} delay={0}>
          Regenerate
        </TooltipTrigger>
        <TooltipPopup>Regenerate the last reply</TooltipPopup>
      </Tooltip>
    </div>,
  );

  const trigger = page.getByRole("button", { name: "Regenerate" });
  await trigger.hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();

  const popupId = await popup.getAttribute("id");
  const describedBy = (await trigger.getAttribute("aria-describedby")) ?? "";
  const ids = describedBy.split(/\s+/u).filter((id) => id.length > 0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the popup is already asserted VISIBLE above, so the seal's id and the trigger's describedby list are both settled — nothing further mutates either.
  expect(popupId).not.toBeNull();
  // BOTH: the tooltip's description survives, and the caller's is honoured beside it.
  expect(ids).toContain(popupId);
  expect(ids).toContain(CALLER_HINT_ID);
  // …and the rendered accessible description is the pair, not one of them.
  await expect(trigger).toHaveAccessibleDescription(/Regenerate the last reply/u);
  await expect(trigger).toHaveAccessibleDescription(/Also mentioned elsewhere/u);
});
