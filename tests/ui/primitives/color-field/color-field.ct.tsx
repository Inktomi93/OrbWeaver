// CT: the color-field seal — the swatch-only display variant, the editable swatch-trigger →
// popover (native <input type="color"> + the ALWAYS-present hex text alternative), label
// association via Field.Control, and the D44 clamp reuse (rejects url()/expression()).
import { ColorField, ColorSwatch } from "@orb/ui/color-field";
import { expect, test } from "@playwright/experimental-ct-react";
import { ColorFieldHarness } from "./color-field.fixtures.tsx";

const STYLE_URL_RE = /url/u;
/** Splits a computed `box-shadow` on its TOP-LEVEL commas — the ones outside a colour function's parens, so
 *  `oklch(0.72 0.175 52)` survives as one layer instead of shattering into three. */
const BOX_SHADOW_LAYER_SPLIT_RE = /,(?![^(]*\))/u;
const NON_EMPTY = /.+/u;

function noop(): void {
  // Intentional no-op — this test only checks the disabled trigger's DOM state, not commits.
}

test("ColorSwatch renders a plain display-only chip — no button, no popover", async ({ mount }) => {
  const swatch = await mount(<ColorSwatch label="#336699" value="#336699" />);
  await expect(swatch.getByRole("button")).toHaveCount(0);
  await expect(swatch).toContainText("#336699");
  const chip = swatch.locator('[data-slot="color-swatch-chip"]');
  await expect(chip).toHaveCSS("background-color", "rgb(51, 102, 153)");
});

test("ColorSwatch drops an unsafe value instead of applying it as a style", async ({ mount }) => {
  const swatch = await mount(<ColorSwatch value="url(evil.css)" />);
  const chip = swatch.locator('[data-slot="color-swatch-chip"]');
  // No inline background-color was ever set — the computed value falls back to the token default,
  // not the hostile string (a `style` attribute carrying `url(...)` would be the injection vector).
  await expect(chip).not.toHaveAttribute("style", STYLE_URL_RE);
});

test("inside a <Field>, the label associates with the swatch trigger button (Field.Control registration)", async ({ mount }) => {
  const page = await mount(<ColorFieldHarness />);
  const trigger = page.getByLabel("Accent");
  await expect(trigger).toHaveAttribute("type", "button");
});

test("opening the editable field always shows the hex text alternative alongside the native picker", async ({ mount, page }) => {
  await mount(<ColorFieldHarness />);
  await page.getByLabel("Accent").click();
  await expect(page.locator('[data-slot="color-field-native-input"]')).toHaveAttribute("type", "color");
  await expect(page.getByLabel("Hex")).toBeVisible();
});

test("typing a valid hex commits the value to the caller", async ({ mount, page }) => {
  await mount(<ColorFieldHarness />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  await hex.fill("#00ff00");
  await expect(page.getByTestId("committed-value")).toHaveText("#00ff00");
});

test("the clamp rejects a url() injection attempt — no commit, inline error shown", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  await hex.fill("url(javascript:alert(1))");
  await expect(page.getByText("Enter a valid color")).toBeVisible();
  // The last-committed value is untouched — the hostile string never reached onValueChange.
  await expect(page.getByTestId("committed-value")).toHaveText("#111111");
});

test("the clamp rejects an expression() injection attempt — no commit, inline error shown", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  await hex.fill("expression(alert(1))");
  await expect(page.getByText("Enter a valid color")).toBeVisible();
  await expect(page.getByTestId("committed-value")).toHaveText("#111111");
});

// An UNSET/inherit field (empty value) is a VALID per-field "clear" (FINAL-Character §8.1), NOT a
// validation error — `isSafeColor("")` is correctly false (a security predicate), so the field's error
// gate must neutralize EMPTY rather than fire on `!isValid`. Otherwise the first thing a user sees on
// the theming money shot (and the Settings global theme editor) is a spurious "Enter a valid color".
test("an unset (inherit) field shows NO error when opened — empty = a valid clear, not invalid", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="" />);
  await page.getByLabel("Accent").click();
  await expect(page.getByLabel("Hex")).toHaveValue("");
  await expect(page.getByText("Enter a valid color")).toHaveCount(0);
});

// An UNSET field's picker must not open PRELOADED WITH BLACK (side-eye 2026-08-08 P3). `#000000` against a
// near-black popup rendered as an empty hole, and inside the picker "no colour is set" and "the colour is
// black" were the same pixels. The seed is a mid-tone — and it is only a DISPLAY seed: opening and
// dismissing an unset field must still commit nothing.
test("an unset field seeds the native picker with a mid-tone, never black, and commits nothing", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="" />);
  await page.getByLabel("Accent").click();
  const native = page.locator('[data-slot="color-field-native-input"]');
  await expect(native).not.toHaveValue("#000000");
  await expect(native).toHaveValue("#808080");
  // The seed never became a value: the hex alternative is still empty and nothing reached the caller.
  await expect(page.getByLabel("Hex")).toHaveValue("");
  await expect(page.getByTestId("committed-value")).toHaveText("");
});

test("a NON-empty invalid value still errors — the gate neutralizes only EMPTY", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="" />);
  await page.getByLabel("Accent").click();
  // Non-empty, non-injection, but not a parseable color (digits, no `#`, not a named color).
  await page.getByLabel("Hex").fill("12345");
  await expect(page.getByText("Enter a valid color")).toBeVisible();
});

// FINAL-Character §8.1 per-field clear: the explicit "Reset to default" button emits the "" sentinel so
// the consumer maps it to ITS clear semantic (override-omit / tag-null). It must be the ONLY clear path —
// a transiently-empty hex draft mid-typing must NEVER fire a spurious clear.
test('clicking "Reset to default" emits the empty clear to the caller', async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  // The caller received the "" sentinel — the committed-value readout is now empty.
  await expect(page.getByTestId("committed-value")).toHaveText("");
});

test("deleting the hex value mid-typing does NOT emit a clear — only the Reset button does", async ({ mount, page }) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  await page.getByLabel("Hex").fill("");
  // The empty draft never passed the isSafeColor commit gate, so onValueChange never fired — the
  // last-committed value is untouched (no spurious clear from transient emptiness).
  await expect(page.getByTestId("committed-value")).toHaveText("#111111");
});

test("the disabled swatch trigger is inert", async ({ mount, page }) => {
  await mount(<ColorField aria-label="Accent" disabled={true} onValueChange={noop} value="#fff" />);
  await expect(page.getByLabel("Accent")).toBeDisabled();
});

// R7 (ui-primitive-contract): a Field description must associate to the swatch trigger via
// aria-describedby — the mergeProps id/aria footgun (color-field.tsx's own documented gotcha)
// applies just as much to aria-describedby as it does to id.
test("inside a <Field description>, the trigger gets aria-describedby (Field.Control registration)", async ({ mount, page }) => {
  await mount(<ColorFieldHarness description="Used for buttons and links" />);
  const trigger = page.getByLabel("Accent");
  await expect(trigger).toHaveAttribute("aria-describedby", NON_EMPTY);
  const describedBy = await trigger.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toHaveText("Used for buttons and links");
});

test("keyboard: Enter opens the popover (native button activation) and Escape closes it, returning focus to the trigger", async ({ mount, page }) => {
  await mount(<ColorFieldHarness />);
  const trigger = page.getByLabel("Accent");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Hex")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Hex")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// THE POPUP'S FIRST TAB STOP MUST BE VISIBLY FOCUSED (side-eye 2026-08-08 P1, WCAG 2.4.7). The native
// `<input type="color">` carried no house focus state at all, so a keyboard user entering the popover got
// only the UA's own outline — a near-black hairline on a near-black popup, i.e. nothing.
//
// The keyboard path is driven for REAL, never `.focus()`: `:focus-visible` is a heuristic on the interaction
// MODALITY, so a programmatic focus can satisfy it where a real pointer entry would not, and the assertion
// would pass against the broken build. MEASURED here (not assumed from the mock): Base UI moves focus to the
// popup's first tabbable on open, so the native swatch is ALREADY focused after `Enter` on the trigger —
// there is no second Tab to press, and the `matches(":focus-visible")` probe below is what proves the
// heuristic actually fired rather than the test asserting into a resting state.
test("keyboard: the native color input paints a visible focus ring when the popover is opened from the keyboard", async ({ mount, page }) => {
  await mount(<ColorFieldHarness />);
  await page.getByLabel("Accent").focus();
  await page.keyboard.press("Enter");
  const native = page.locator('[data-slot="color-field-native-input"]');
  await expect(native).toBeFocused();

  const focused = await native.evaluate((el) => {
    // A token is compared through the BROWSER, never as a string: `--color-popover` is authored
    // `oklch(24.5% .007 60)` and serializes into a box-shadow as `oklch(0.245 0.007 60)`, so a raw
    // `getPropertyValue` comparison fails on formatting while the paint is correct.
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (token: string): string => {
      probe.style.backgroundColor = `var(${token})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const tokens = { popover: resolve("--color-popover"), background: resolve("--color-background") };
    probe.remove();
    return {
      boxShadow: getComputedStyle(el).boxShadow,
      outlineStyle: getComputedStyle(el).outlineStyle,
      matchesFocusVisible: el.matches(":focus-visible"),
      ...tokens,
    };
  });
  // The modality heuristic actually fired — otherwise every assertion below is vacuous.
  expect(focused.matchesFocusVisible).toBe(true);
  // The UA outline is retired rather than layered under our ring (two competing focus paints is the other
  // failure mode, and Tailwind's `outline-none` is also what would silently kill a FOCUS_RING_OUTLINE).
  expect(focused.outlineStyle).toBe("none");
  // The ring is a real PAINT, not a class list that merely READS as ringed. Tailwind always emits five
  // box-shadow slots and leaves the unused ones fully transparent, so the pin is on how many slots actually
  // CARRY INK: an element whose shadow composite is already owned collapses every ring slot to
  // `rgba(0, 0, 0, 0) 0px 0px 0px 0px`, which is the trap FOCUS_RING_OUTLINE exists for.
  expect(focused.boxShadow).not.toBe("none");
  const inked = focused.boxShadow.split(BOX_SHADOW_LAYER_SPLIT_RE).filter((layer) => !layer.includes("rgba(0, 0, 0, 0)"));
  // Two: the offset MOAT and the ring itself.
  expect(inked).toHaveLength(2);
  // …and the moat is the POPOVER tone, not the page background — this control only ever renders inside a
  // popup, so a plain FOCUS_RING would paint a page-toned band around it. Guarded against the vacuous case
  // where a theme happens to give the two tokens the same value.
  expect(focused.popover).not.toBe(focused.background);
  expect(focused.boxShadow).toContain(focused.popover);
  expect(focused.boxShadow).not.toContain(focused.background);

  // …and it is the FOCUS state that paints it: Tab on to the hex field and the same element goes bare.
  await page.keyboard.press("Tab");
  await expect(native).not.toBeFocused();
  const resting = await native.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(focused.boxShadow).not.toBe(resting);
});

test("loading swaps the swatch for a spinner and inerts the trigger", async ({ mount, page }) => {
  await mount(<ColorField aria-label="Accent" loading={true} onValueChange={noop} value="#fff" />);
  const trigger = page.getByLabel("Accent");
  await expect(trigger).toBeDisabled();
  await expect(trigger.getByRole("status")).toBeVisible();
  await expect(trigger.locator('[data-slot="color-field-swatch"]')).toHaveCount(0);
});

test("success shows a checkmark over the trigger", async ({ mount, page }) => {
  await mount(<ColorField aria-label="Accent" onValueChange={noop} success={true} value="#fff" />);
  const trigger = page.getByLabel("Accent");
  await expect(trigger).toHaveAttribute("data-success", "");
  await expect(trigger.locator('[data-slot="color-field-swatch"]')).toHaveCount(0);
});
