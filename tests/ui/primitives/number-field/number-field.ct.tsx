// CT: the number-field seal — steppers actually step and clamp at min/max, typing parses,
// and the increment/decrement buttons meet the 44px touch floor.
import { Field } from "@orb/ui/field";
import { NumberField } from "@orb/ui/number-field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;
const HELP_ID = "rounds-help";
const HELP_TEXT = "Higher allows deeper multi-step work.";

test("steppers increment and decrement the value", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} />);
  const input = page.getByRole("textbox");
  await page.getByLabel("Increase").click();
  await expect(input).toHaveValue("6");
  await page.getByLabel("Decrease").click();
  await page.getByLabel("Decrease").click();
  await expect(input).toHaveValue("4");
});

test("clamps at min: decrement disables at the floor", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={0} max={10} min={0} />);
  const decrement = page.getByLabel("Decrease");
  await expect(decrement).toBeDisabled();
  await page.getByLabel("Increase").click();
  await expect(page.getByRole("textbox")).toHaveValue("1");
  await expect(decrement).toBeEnabled();
});

// The ≥44px floor is a COARSE-pointer guarantee (D62 P1) — steppers narrow on fine pointers, so this
// runs under an emulated coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx precedent).
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("stepper buttons meet the touch floor", async ({ mount, page }) => {
    await mount(<NumberField defaultValue={0} />);
    const box = await page.getByLabel("Increase").boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  });
});

test("onValueChange reports the parsed number", async ({ mount, page }) => {
  const seen: (number | null)[] = [];
  await mount(
    <NumberField
      defaultValue={1}
      onValueChange={(value): void => {
        seen.push(value);
      }}
    />,
  );
  await page.getByLabel("Increase").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(2);
});

test("scrub area is present and labeled; steppers still clamp to min/max", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={0} max={10} min={0} scrubLabel="Weight" />);
  await expect(page.getByText("Weight")).toBeVisible();
  // Steppers keep their clamp: decrement disabled at the floor, increment steps within range.
  const decrement = page.getByLabel("Decrease");
  await expect(decrement).toBeDisabled();
  await page.getByLabel("Increase").click();
  await expect(page.getByRole("textbox")).toHaveValue("1");
  await expect(decrement).toBeEnabled();
});

test("ArrowUp/ArrowDown on the input step the value", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} max={10} min={0} />);
  const input = page.getByRole("textbox");
  await input.focus();
  await input.press("ArrowUp");
  await expect(input).toHaveValue("6");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("4");
});

test("disabled blocks the steppers and drops the interactive skin", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} disabled={true} />);
  await expect(page.getByLabel("Increase")).toBeDisabled();
  await expect(page.getByLabel("Decrease")).toBeDisabled();
  await expect(page.getByRole("textbox")).toBeDisabled();
});

test("read-only: blocks steppers but keeps the token skin + shows the lock glyph", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} readOnly={true} />);
  const increment = page.getByLabel("Increase");
  await expect(increment).toHaveAttribute("data-readonly", "");
  await expect(increment).toHaveCSS("opacity", "1");
  // The non-color signal: the +/- glyph swaps for a lock while read-only. (Both icons stay
  // keepMounted side by side — scope by lucide's own icon class to avoid ambiguity.)
  await expect(increment.locator("svg.lucide-lock")).toBeVisible();
  await expect(increment.locator("svg.lucide-plus")).toBeHidden();
  // Base UI marks a read-only stepper aria-disabled, so Playwright's actionability check refuses a
  // plain click — force it through to prove the CLICK HANDLER (not just the a11y hint) is a no-op.
  await increment.click({ force: true });
  await expect(page.getByRole("textbox")).toHaveValue("5");
});

// The blank-means-default affordance: `placeholder` must reach the INPUT part. `NumberFieldRootProps`
// inherits `placeholder` from React's HTMLAttributes, so an un-destructured passthrough would land it on the
// wrapper <div> — invisible, and the field would still read as broken/unconfigured when empty.
test("placeholder renders on the input while the value is empty (not on the root)", async ({ mount, page }) => {
  // Uncontrolled + no default: the empty state the bound field lands in when a preset knob is unset.
  await mount(<NumberField placeholder="2048 (default)" />);
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "2048 (default)");
  await expect(page.locator('[data-slot="number-field-root"]')).not.toHaveAttribute("placeholder");
  // RENDERED, not just present: the empty-state text reads muted (the input/textarea placeholder skin), so
  // it can't be mistaken for a real value.
  const placeholderColor = await input.evaluate((el) => getComputedStyle(el, "::placeholder").color);
  expect(placeholderColor).toBe(resolvedTokenColor("color.muted-foreground"));
  // Typing a value hides it — the placeholder never becomes the field's value.
  await input.fill("64");
  await input.blur();
  await expect(input).toHaveValue("64");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Out of range" label="Weight">
      <NumberField defaultValue={5} />
    </Field>,
  );
  await expect(page.getByRole("textbox")).toHaveAttribute("data-invalid", "");
  await expect(page.locator('[data-slot="number-field-group"]')).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the input associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="In pounds" label="Weight">
      <NumberField defaultValue={5} />
    </Field>,
  );
  const control = page.getByLabel("Weight");
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

// Base UI 1.6 renders an editable TEXTBOX — no role="spinbutton", so no aria-valuemin/max carries the
// range. Owner ruling 2026-08-02: embrace the textbox (spinbutton semantics fight typed editing in screen
// readers) and convey the bounds as a DESCRIPTION, derived by the seal so no call site can drift.
test("min/max become the accessible description — no spinbutton role is stamped", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Tool rounds" defaultValue={5} max={20} min={1} />);
  const input = page.getByRole("textbox", { name: "Tool rounds" });
  await expect(input).toHaveAccessibleDescription("Between 1 and 20");
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  // Base UI already supplies the numeric soft keyboard (and narrows it per-platform) — the seal must not
  // override it; assert the shipped behavior so a regression in either direction is loud.
  await expect(input).toHaveAttribute("inputmode", "numeric");
});

test("a one-sided bound reads as a floor/ceiling", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Floor only" min={1} />);
  await expect(page.getByRole("textbox", { name: "Floor only" })).toHaveAccessibleDescription("Minimum 1");
});

// done ≠ rendered: the description is SR-only, so it must cost the control zero visible height — the seal
// ships into every bounded field on the settings surfaces, where a stray text line would be obvious.
test("the bounds description costs no layout — the root is exactly the stepper group", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Tool rounds" defaultValue={5} max={20} min={1} />);
  const [root, group] = await Promise.all([
    page.locator('[data-slot="number-field-root"]').boundingBox(),
    page.locator('[data-slot="number-field-group"]').boundingBox(),
  ]);
  expect(root?.height).toBe(group?.height);
  const bounds = await page.locator('[data-slot="number-field-bounds"]').boundingBox();
  expect(bounds?.width).toBeLessThanOrEqual(1);
  expect(bounds?.height).toBeLessThanOrEqual(1);
});

test("bounds are formatted like the input's own value (grouping), not raw digits", async ({ mount, page }) => {
  // Base UI formats the visible value through Intl ("1,024"); an unformatted "1024" bound would read as a
  // different number to a screen-reader user hearing both.
  await mount(<NumberField aria-label="Max tokens" defaultValue={1024} max={8192} min={1} />);
  const input = page.getByRole("textbox", { name: "Max tokens" });
  await expect(input).toHaveValue("1,024");
  await expect(input).toHaveAccessibleDescription("Between 1 and 8,192");
});

test("an unbounded field gets no derived description", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Unbounded" defaultValue={5} />);
  await expect(page.getByRole("textbox", { name: "Unbounded" })).toHaveAccessibleDescription("");
});

test("a call site's own description COMPOSES with the derived bounds, never clobbers it", async ({ mount, page }) => {
  await mount(
    <Field description="In pounds" label="Weight">
      <NumberField defaultValue={5} max={300} min={0} />
    </Field>,
  );
  // Exact, so a regression that DROPS either half (or reorders them into nonsense) reds.
  await expect(page.getByLabel("Weight")).toHaveAccessibleDescription("Between 0 and 300 In pounds");
});

// ── size="inline" — the slider's number twin (preset-surface-redesign.md §4.1/§13) ────────────────────
// The pointer-conditional control tokens are read back FROM THE LIVE DOCUMENT (never TOKENS' static coarse
// literal, never a hardcoded px): the whole point of the inline height is that it follows the pointer.
function resolveSpacing(page: Page, cssVar: string): Promise<string> {
  return page.evaluate((token: string) => {
    const probe = document.createElement("div");
    probe.style.height = `var(${token})`;
    document.body.append(probe);
    const resolved = getComputedStyle(probe).height;
    probe.remove();
    return resolved;
  }, cssVar);
}

const INLINE_WIDTH_PX = `${Number.parseFloat(TOKENS["width.number-inline"].value) * 16}px`;

test("size=inline omits the steppers but keeps the textbox, keyboard stepping and the bounds description", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Temperature" defaultValue={5} max={20} min={1} size="inline" step={1} />);
  // The sanctioned R2 omission: no stepper parts at all (not merely hidden ones — a display:none button is
  // still DOM the a11y tree has to be trusted to skip).
  await expect(page.getByLabel("Increase")).toHaveCount(0);
  await expect(page.getByLabel("Decrease")).toHaveCount(0);
  await expect(page.locator('[data-slot="number-field-increment"]')).toHaveCount(0);

  // The landed Base UI reality the CTs locate by (§13): a textbox, never a spinbutton.
  const input = page.getByRole("textbox", { name: "Temperature" });
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(input).toHaveAccessibleDescription("Between 1 and 20");

  // Stepping survives the missing buttons — the keyboard is the fine control, the slider beside it is the coarse one.
  await input.focus();
  await input.press("ArrowUp");
  await expect(input).toHaveValue("6");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("4");
});

test("size=inline is the mono right-aligned token box; md keeps the centered full-width form skin", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 400 }}>
      <NumberField aria-label="Inline" defaultValue={131_072} size="inline" />
      <NumberField aria-label="Form" defaultValue={5} />
    </div>,
  );
  const inlineRoot = page.locator('[data-slot="number-field-root"]').nth(0);
  const formRoot = page.locator('[data-slot="number-field-root"]').nth(1);
  const inlineInput = page.getByRole("textbox", { name: "Inline" });
  const formInput = page.getByRole("textbox", { name: "Form" });

  // The BOX comes from the size axis: a fixed token width beside a slider vs the form field's full column.
  await expect(inlineRoot).toHaveCSS("width", INLINE_WIDTH_PX);
  const formBox = await formRoot.boundingBox();
  expect(formBox?.width).toBe(400);

  // Heights ride the pointer-conditional control tokens, resolved live.
  const [controlSm, touchTarget] = await Promise.all([
    resolveSpacing(page, TOKENS["spacing.control-sm"].cssVar),
    resolveSpacing(page, TOKENS["spacing.touch-target"].cssVar),
  ]);
  await expect(inlineInput).toHaveCSS("height", controlSm);
  await expect(formInput).toHaveCSS("height", touchTarget);

  // The datum treatment: mono, tabular, right-aligned — so a column of knob values reads down one edge.
  await expect(inlineInput).toHaveCSS("text-align", "right");
  await expect(formInput).toHaveCSS("text-align", "center");
  const inlineFont = await inlineInput.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(inlineFont).toContain("Geist Mono");
  const formFont = await formInput.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(formFont).not.toContain("Geist Mono");
  await expect(inlineInput).toHaveCSS("font-variant-numeric", "tabular-nums");

  // The widest datum the deck feeds it fits without clipping (the token's sizing premise).
  await expect(inlineInput).toHaveValue("131,072");
  const overflow = await inlineInput.evaluate((el: HTMLInputElement) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("size=inline keeps the scrub area and the blank-means-default placeholder", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Max output tokens" placeholder="2048 (default)" scrubLabel="Drag" size="inline" />);
  await expect(page.getByText("Drag")).toBeVisible();
  const input = page.getByRole("textbox", { name: "Max output tokens" });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "2048 (default)");
});

test("an explicit aria-describedby reaches the INPUT and composes with the bounds", async ({ mount, page }) => {
  await mount(
    <>
      <p id={HELP_ID}>{HELP_TEXT}</p>
      <NumberField aria-describedby={HELP_ID} aria-label="Tool rounds" defaultValue={5} max={20} min={1} />
    </>,
  );
  const input = page.getByRole("textbox", { name: "Tool rounds" });
  await expect(input).toHaveAccessibleDescription(`${HELP_TEXT} Between 1 and 20`);
  // Routed to the input, not parked on the wrapper div (the `placeholder` footgun's twin).
  await expect(page.locator('[data-slot="number-field-root"]')).not.toHaveAttribute("aria-describedby");
});

// ── side-eye F-20 (2026-08-03): the steppers name their subject ────────────────────────────────────────
test("steppers take the field's own name as their subject when the call site supplies one", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Managed threshold" defaultValue={5} max={20} min={1} />);
  // The defect: three NumberFields on one deck announced three bare "Decrease"es, with nothing saying
  // decrease WHAT. The `<Field>` label reaches the INPUT (aria-labelledby) but never the buttons.
  await expect(page.getByRole("button", { name: "Decrease Managed threshold" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Increase Managed threshold" })).toHaveCount(1);
});

test("an unnamed field keeps the bare verb rather than inventing a subject", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} />);
  await expect(page.getByRole("button", { name: "Decrease", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Increase", exact: true })).toHaveCount(1);
});
