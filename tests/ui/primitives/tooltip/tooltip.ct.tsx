import { Tooltip, TooltipArrow, TooltipPopup, TooltipTrigger, TooltipViewport } from "@orb/ui/tooltip";
import { expect, test } from "@playwright/experimental-ct-react";
import { TooltipHandleHarness } from "./tooltip-handle.fixtures.tsx";

/** The caller's OWN description target — one static node in one mount, so no `useId` collision exists. */
const CALLER_HINT_ID = "ct-hint";

// The OPTIONAL multi-trigger transition container (Base UI Tooltip.Viewport). It must not break the
// seal's own name/description wiring — the description node keeps role="tooltip" and the trigger keeps
// pointing at it, with the label reachable through the extra wrapper. #2455: the viewport is a PORTAL
// part (it reads a popup context that does not exist outside it), so the sr-only copy renders its
// children bare — a seal that duplicated the element itself crashed the whole mount.
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
  await expect(page.locator('[data-slot="tooltip-viewport"]')).toHaveText("Regenerate the last reply");
  const description = page.locator('[data-slot="tooltip-description"]');
  await expect(description).toHaveAttribute("role", "tooltip");
  await expect(description).toHaveText("Regenerate the last reply");
  const describedBy = await page.getByRole("button", { name: "Regenerate" }).getAttribute("aria-describedby");
  await expect(description).toHaveAttribute("id", describedBy ?? "");
});

// #2455 — THE DESCRIPTION MUST RESOLVE AT REST. The seal minted one id per `<Tooltip>` and stamped it on
// the trigger unconditionally, but the popup it named mounts only while OPEN: at rest every tooltip in the
// app carried a DANGLING `aria-describedby` (33/33 hint triggers resolving 0 on settings:appearance.sizing
// when this was measured), so a virtual screen-reader cursor read the control's name and nothing else. The
// text now lives in an always-mounted `sr-only` node; the popup is its VISUAL duplicate.
test("the trigger's aria-describedby resolves to the tooltip text AT REST, with the tooltip closed", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  const trigger = page.getByRole("button", { name: "Regenerate" });
  await expect(page.locator('[data-slot="tooltip-popup"]'), "nothing is hovered — the popup must still be unmounted").toBeHidden();
  await expect(trigger).toHaveAccessibleDescription("Regenerate the last reply");
  const dangling = await trigger.evaluate((element: HTMLElement): readonly string[] =>
    (element.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .filter((id) => element.ownerDocument.getElementById(id) === null),
  );
  expect(dangling, "every id in the trigger's describedby list must name a node that EXISTS").toStrictEqual([]);
});

// THE OPT-OUT, AND WHY IT IS NOT OPTIONAL POLISH. A tooltip whose text only repeats the trigger's
// accessible name — every icon-only control in this app — would otherwise describe that control with its
// own name, and a control that already owns a description (`composer-guided-buttons.tsx`,
// `composer-send-control.tsx`) would carry the same sentence twice. `describesTrigger={false}` leaves the
// tooltip purely visual: no id on the trigger, no description node, and nothing dangling either.
test("describesTrigger={false} leaves the trigger undescribed while the popup still opens", async ({ mount, page }) => {
  await mount(
    <Tooltip describesTrigger={false}>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate</TooltipPopup>
    </Tooltip>,
  );

  const trigger = page.getByRole("button", { name: "Regenerate" });
  await expect(page.locator('[data-slot="tooltip-description"]')).toHaveCount(0);
  await expect(trigger).toHaveAccessibleDescription("");
  await expect(trigger, "no id is minted, so nothing can dangle").not.toHaveAttribute("aria-describedby", /./u);

  await trigger.hover();
  await expect(page.locator('[data-slot="tooltip-popup"]'), "the VISUAL tooltip is untouched by the opt-out").toBeVisible();
});

test("shows on hover and hides when the pointer leaves", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  // The VISUAL surface only — the sr-only description carries the same sentence at rest by design
  // (#2455), so this assertion names the popup slot rather than the text.
  await expect(page.locator('[data-slot="tooltip-popup"]')).toBeHidden();

  await page.getByRole("button", { name: "Regenerate" }).hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  // text-label (--text-label: 0.8125rem = 13px) must survive tailwind-merge alongside the
  // text-popover-foreground color (the extended font-size classGroup in variants.ts).
  await expect(popup).toHaveCSS("font-size", "13px");

  await page.mouse.move(600, 400);
  await expect(page.locator('[data-slot="tooltip-popup"]')).toBeHidden();
});

// Base UI 1.6's Tooltip omits the WCAG name/description relationship; the seal adds it (role="tooltip" on
// the always-mounted description node + a matched aria-describedby on the trigger), so a screen reader
// tabbing to the trigger gets the tooltip content as its description. #2455 moved the id off the popup,
// which Base UI mounts only while OPEN; the popup is now an `aria-hidden` visual duplicate.
test("wires role=tooltip + aria-describedby between trigger and the description node", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  const trigger = page.getByRole("button", { name: "Regenerate" });
  await trigger.hover();

  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup, "the painted popup is a VISUAL duplicate — the sentence is in the tree exactly once").toHaveAttribute("aria-hidden", "true");
  const description = page.locator('[data-slot="tooltip-description"]');
  await expect(description).toHaveRole("tooltip");
  let describedBy = await trigger.getAttribute("aria-describedby");
  await expect
    .poll(async () => {
      describedBy = await trigger.getAttribute("aria-describedby");
      return describedBy;
    })
    .not.toBeNull();
  await expect(description).toHaveAttribute("id", describedBy ?? "");
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
  await expect(page.locator('[data-slot="tooltip-popup"]')).toBeVisible();
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

  const popupId = await page.locator('[data-slot="tooltip-description"]').getAttribute("id");
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
