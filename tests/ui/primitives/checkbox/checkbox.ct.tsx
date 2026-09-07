// CT: the checkbox seal — real role="checkbox" semantics (the styled span carries the role, a
// hidden input rides beside it). Pointer + keyboard toggle aria-checked; checked wears the primary
// token; indeterminate reports aria-checked="mixed".
import { contrastRatio } from "@orb/tooling/_shared/wcag";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { ReactElement } from "react";
import { pixelContrast, pixelSurface } from "../../../support/browser/pixel-contrast.ts";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

const NON_EMPTY = /.+/u;

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" defaultChecked={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("indeterminate reports the mixed state", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Select all" indeterminate={true} />);
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Checkbox
      aria-label="Remember me"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("checkbox").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("disabled blocks toggling and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" disabled={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-disabled", "");
  await expect(control).toHaveCSS("opacity", "0.5");
  await control.click({ force: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("read-only: blocks toggling but keeps the checked token + shows the lock glyph", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Archived" checked={true} readOnly={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-readonly", "");
  // A read-only checkbox is NOT the disabled grey-out — it still wears the primary "checked" token.
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(control).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph takes over from the check mark. (The checkbox always
  // keepMounts check/dash/lock together — scope by lucide's own icon class to avoid ambiguity.)
  await expect(control.locator("svg.lucide-lock")).toBeVisible();
  await control.click();
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("non-read-only checkbox never shows the lock glyph", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" checked={true} />);
  await expect(page.getByRole("checkbox").locator("svg.lucide-lock")).toBeHidden();
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Terms">
      <Checkbox />
    </Field>,
  );
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Required to continue" label="Terms">
      <Checkbox />
    </Field>,
  );
  // getByLabel also matches the hidden native input Base UI rides beside the styled span (R2) —
  // scope to the accessible role so the assertion targets the actual control under test.
  const control = page.getByRole("checkbox", { name: "Terms" });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

// ── THE QUIET ALL-ON SKIN (#1110, owner ruling 2026-09-02) ────────────────────────────────────────
// Backup & Restore's "Include" fieldset starts with ELEVEN checked boxes — the default, before the user
// has decided anything — and the accent skin made them the loudest ink in the pane. `tone="quiet"` is the
// bulk-default arm: the ON state keeps its own ink, but not the ember.
//
// FRAMEBUFFER, NOT COMPUTED STYLE. The unchecked box is a 12-16% overlay (`bg-input`) and the quiet checked
// fill is `foreground/55`, so what the eye reads exists only after compositing; every token also resolves
// in `oklch`, where a numeric parse of `backgroundColor` reads L/C/H as if they were R/G/B
// (`oklch-kills-rgb-regex-probes`).
//
// EVERY SEED, because a polarity fix proven on the dark arm alone is this tree's recorded failure family
// (`light-theme-polarity-receipts`) — under Light the quiet fill has the LEAST contrast to spend, so Light
// is the binding arm of the two floors below.
const CHECKBOX_SEEDS = ["hearth", "light", "mocha"] as const;

/** All seeds side by side in ONE mount. playwright-ct refuses a second `mount()` in a test, and `hearth`
 *  IS the base `@theme` at `:root` (theme.css emits `[data-theme]` blocks for light + mocha only), so the
 *  hearth arm is the unattributed pane. */
const checkboxSeedPanes = (): ReactElement => (
  <>
    {CHECKBOX_SEEDS.map((theme) => (
      <div className="bg-card p-gutter" key={theme} {...(theme === "hearth" ? {} : { "data-theme": theme })}>
        {/* An empty block over the pane fill: its pixels ARE the pane, so the backdrop reading needs no
            guess about how much of a wrapper the controls happen to cover. */}
        <div className="h-block w-block" data-testid={`pane-${theme}`} />
        <Checkbox aria-label={`${theme} accent off`} />
        <Checkbox aria-label={`${theme} accent on`} defaultChecked={true} />
        <Checkbox aria-label={`${theme} quiet off`} tone="quiet" />
        <Checkbox aria-label={`${theme} quiet on`} defaultChecked={true} tone="quiet" />
      </div>
    ))}
  </>
);

/** The box's own painted fill against the pane behind it — the quantity `quiet-state` ranks (each state's
 *  fill vs the surface the whole control sits on, ui-audit census-region.ts). The median of the box's own
 *  pixels IS the fill: the glyph is a 2px stroke over an 18px square. */
async function boxFill(page: Page, theme: string, arm: string): Promise<{ ratio: number; describe: string }> {
  const name = `${theme} ${arm}`;
  const pane = await pixelSurface(page, page.getByTestId(`pane-${theme}`));
  const box = await pixelSurface(page, page.getByRole("checkbox", { name }));
  return { ratio: contrastRatio(box.rgb, pane.rgb), describe: `${name}: box ${box.describe} vs pane ${pane.describe}` };
}

test("tone=quiet spends no accent, stays the LOUDER state, and clears 3:1 box-on-pane + mark-on-box in every seed (#1110)", async ({ mount, page }) => {
  await mount(checkboxSeedPanes());
  for (const theme of CHECKBOX_SEEDS) {
    const accentOn = await boxFill(page, theme, "accent on");
    const quietOff = await boxFill(page, theme, "quiet off");
    const quietOn = await boxFill(page, theme, "quiet on");

    // THE UN-FAILABLE GUARD. Every ratio here collapses to 1.000 if the samples come back as one colour —
    // a clipped screenshot, a `[data-theme]` that never applied — and an ordering pin over constant inputs
    // passes on nothing. The ON accent box must be a really painted fill.
    expect(accentOn.ratio, `[${theme}] the ON accent fill must be real, or this pin is vacuous — ${accentOn.describe}`).toBeGreaterThan(3);

    // THE BUDGET CLAIM (the whole reason the arm exists): quiet is measurably quieter than the accent.
    expect(quietOn.ratio, `[${theme}] quiet ON must undercut the accent — ${quietOn.describe} || ${accentOn.describe}`).toBeLessThan(accentOn.ratio);

    // THE POLARITY IS NOT REVERSED — `quiet-state` files a P2 when OFF outruns ON by more than its 1.5
    // inversion tolerance (tooling/src/ui-audit/lib/checks-color.ts QUIET_MAX_INVERSION). ON must simply
    // be the louder one.
    expect(quietOn.ratio, `[${theme}] quiet ON must stay louder than quiet OFF — ${quietOn.describe} || ${quietOff.describe}`).toBeGreaterThan(quietOff.ratio);

    // WCAG 1.4.11's two floors on the quiet arm: the box identifies the control against its surface, and
    // the check mark is the visual information that identifies its STATE.
    expect(quietOn.ratio, `[${theme}] quiet ON box vs pane — ${quietOn.describe}`).toBeGreaterThanOrEqual(3);
    const mark = await pixelContrast(page, page.getByRole("checkbox", { name: `${theme} quiet on` }).locator("svg.lucide-check"));
    expect(mark.ratio, `[${theme}] quiet ON check glyph vs its box — ${mark.describe}`).toBeGreaterThanOrEqual(3);
  }
});

test("the tone axis is STAMPED on the root, and accent stays the byte-identical default (#1080/#1110)", async ({ mount, page }) => {
  await mount(checkboxSeedPanes());
  // An unset `tone` emits the recipe's own default arm, so a census can tell the two authored decisions
  // apart in the DOM (variant-attrs.ts) — and the default is still the ember skin #1090 ruled.
  const accent = page.getByRole("checkbox", { name: "hearth accent on" });
  await expect(accent).toHaveAttribute("data-tone", "accent");
  await expect(accent).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(page.getByRole("checkbox", { name: "hearth quiet on" })).toHaveAttribute("data-tone", "quiet");
  // The quiet arm does NOT reach for the accent token at all — this is the assertion that would go red if
  // someone "unified" the two arms back onto `--color-primary`.
  await expect(page.getByRole("checkbox", { name: "hearth quiet on" })).not.toHaveCSS("background-color", TOKENS["color.primary"].value);
});

// A FENCE, honestly labelled: this one is GREEN on the pre-#1110 source (the arm did not exist, so the
// states it guards could not have moved). What it locks out is the next edit that "simplifies" the tone
// onto the root and repaints a state the arm has no opinion about — the read-only Lock's ink in the
// UNCHECKED state is inherited from the root's `text-primary-foreground`, and a tone must not touch it.
test("tone=quiet leaves the UNCHECKED and read-only states exactly where accent left them (#1110)", async ({ mount, page }) => {
  await mount(
    <>
      <Checkbox aria-label="accent off" />
      <Checkbox aria-label="quiet off" tone="quiet" />
      <Checkbox aria-label="quiet archived" checked={true} readOnly={true} tone="quiet" />
    </>,
  );
  // A tone must not repaint a state it has no opinion about: the rest box is the shared SELECTION_CONTROL
  // frame on both arms.
  const accentOff = page.getByRole("checkbox", { name: "accent off" });
  const quietOff = page.getByRole("checkbox", { name: "quiet off" });
  const restFill = await accentOff.evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(quietOff).toHaveCSS("background-color", restFill);
  // Read-only still reads as ONE consistent mark on the quiet arm too (the Lock takes over from the check).
  const archived = page.getByRole("checkbox", { name: "quiet archived" });
  await expect(archived).toHaveAttribute("data-readonly", "");
  await expect(archived.locator("svg.lucide-lock")).toBeVisible();
  await expect(archived.locator("svg.lucide-check")).toBeHidden();
});
