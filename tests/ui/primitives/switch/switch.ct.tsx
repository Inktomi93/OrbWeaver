// CT: the switch seal — real role="switch" semantics: pointer + keyboard toggle aria-checked,
// checked state lands as the primary token track. (Base UI renders the styled span + a hidden
// form input as siblings, so the role locator is the element under test, not the mount handle.)
import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";

const NON_EMPTY = /.+/u;

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" defaultChecked={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

// ── Defect #3 pins (owner: "toggles are very short and tiny and can barely show a difference between
// on and off"). Two regressions locked out: (1) the checked and unchecked tracks must wear DIFFERENT
// token values (not "barely a difference"); (2) the visible track must be a generous rectangle with a
// SUBSTANTIAL thumb travel (the old design collapsed to ~4px travel on fine pointers). done ≠ rendered
// — these assert the RENDERED geometry/colour, not the source. ──
test("checked vs unchecked wear DIFFERENT track token values (the on/off distinction pin)", async ({ mount, page }) => {
  // The two states must map to genuinely different tokens — the "barely shows a difference" regression.
  expect(TOKENS["color.input"].value).not.toBe(TOKENS["color.primary"].value);
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const off = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.click();
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  const on = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(on).not.toBe(off); // rendered colours actually diverge on/off, not just the source classes
});

test("the track is a generous rectangle and the thumb travels a substantial distance", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const thumb = control.locator('[data-slot="switch-thumb"]');
  const track = await control.boundingBox();
  const offX = (await thumb.boundingBox())?.x ?? 0;
  // Rectangular, not the old near-square (48×32 → w > 1.4×h); the switch reads as a switch at a glance.
  expect((track?.width ?? 0) / (track?.height ?? 1)).toBeGreaterThan(1.4);
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // Travel = switch-track − switch-thumb = 3rem − 2rem = 16px (thumb raised to 32px for the tap-target
  // floor, Task #76). The old fine-pointer travel was ~4px; assert well past that so a regression toward
  // a near-square track fails here. Poll past the 130ms transform transition (the thumb slides,
  // boundingBox tracks the transform mid-animation).
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0, { intervals: [20, 50, 100] }).toBeGreaterThan(offX + 12);
});

// ── tone axis (north-star §5 PP1 precedent; owner-sanctioned 2026-07-16). `accent` (default) keeps
// the ember-on-checked skin — the ONE sanctioned accent toggle per surface. `quiet` spends no accent, so
// a rack of per-row switches never multiplies it. The on/off signal stays position-carried (thumb travel)
// AND, since side-eye F-08, luminance-carried too. ──
//
// THE TWO TRACKS ARE LUMINANCE-SEPARATED — the property, not the token, and not a DIRECTION either: the
// checked track rides `--color-foreground`, which is bright on a dark theme and dark on a light one, so
// "brighter" is polarity-dependent while "clearly different" is the thing the eye actually needs.
// `quiet` used to ride `--color-secondary` (L 0.255) against an unchecked `bg-input` compositing to
// ≈L 0.286 — a 0.03 separation, i.e. none, so a twelve-row rack signalled its state with a 10px thumb
// offset and nothing else (side-eye F-08). Asserting the RELATION is what makes this pin bite: a token
// swap that collapses the two again fails here, where "background-color equals token X" stays green.
const MIN_LUMINANCE_SEPARATION = 0.15;

test("tone=quiet: checked spends no ember AND is LUMINANCE-SEPARATED from unchecked (F-08)", async ({ mount, page }) => {
  await mount(
    <>
      <Switch aria-label="Row toggle off" tone="quiet" />
      <Switch aria-label="Row toggle on" defaultChecked={true} tone="quiet" />
    </>,
  );
  const off = page.getByRole("switch", { name: "Row toggle off" });
  const on = page.getByRole("switch", { name: "Row toggle on" });

  // No accent, either way — that is the whole point of the tone.
  await expect(on).not.toHaveCSS("background-color", TOKENS["color.primary"].value);

  // COMPOSITED relative luminance, measured the only honest way: PAINT it. Both tracks are semi-transparent
  // (`bg-input` is a 12% overlay; the checked track a 70% one) and both resolve in oklch, so parsing
  // `backgroundColor` numerically would be reading L/C/H as if they were R/G/B — a number that moves with
  // the HUE. A 1×1 canvas composites the real color over the real backdrop and hands back sRGB.
  const luminance = async (control: typeof on): Promise<number> =>
    await control.evaluate((el) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      if (ctx === null) {
        throw new Error("no 2d context");
      }
      // The rack's real backdrop, so the comparison is the one the eye makes on the surface.
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-card").trim();
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(el).backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
      const channel = (value: number): number => {
        const srgb = value / 255;
        return srgb <= 0.039_28 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    });

  const [onLuminance, offLuminance] = await Promise.all([luminance(on), luminance(off)]);
  expect(Math.abs(onLuminance - offLuminance)).toBeGreaterThan(MIN_LUMINANCE_SEPARATION);
});

test("tone=quiet: still toggles and the thumb still travels — state is position, not color", async ({ mount, page }) => {
  await mount(<Switch aria-label="Row toggle" tone="quiet" />);
  const control = page.getByRole("switch");
  const thumb = control.locator('[data-slot="switch-thumb"]');
  const offX = (await thumb.boundingBox())?.x ?? 0;
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // Same 16px travel as accent (thumb translate is tone-independent) — the a11y on/off signal holds.
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0, { intervals: [20, 50, 100] }).toBeGreaterThan(offX + 12);
});

test("tone=accent (explicit) matches the default — checked wears ember", async ({ mount, page }) => {
  await mount(<Switch aria-label="The one accent toggle" defaultChecked={true} tone="accent" />);
  await expect(page.getByRole("switch")).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Switch
      aria-label="Streaming"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("switch").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("read-only: blocks toggling but keeps the checked token + shows the lock glyph", async ({ mount, page }) => {
  await mount(<Switch aria-label="Autopilot" checked={true} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-readonly", "");
  // A read-only switch is NOT the disabled grey-out — it still wears the primary "on" token.
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(control).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph rides the thumb, visible only in the read-only state.
  await expect(control.locator("svg")).toBeVisible();
  // Clicking (and Space) must not flip the state — Base UI's readOnly behavior.
  await control.click();
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("read-only off state: unchecked token holds and the lock glyph still shows", async ({ mount, page }) => {
  await mount(<Switch aria-label="Autopilot" checked={false} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control.locator("svg")).toBeVisible();
});

test("non-read-only switch never shows the lock glyph", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  await expect(page.getByRole("switch").locator("svg")).toBeHidden();
});

test("disabled blocks toggling and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" disabled={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-disabled", "");
  await expect(control).toHaveCSS("opacity", "0.5");
  await control.click({ force: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Streaming">
      <Switch />
    </Field>,
  );
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Live-updates as tokens arrive" label="Streaming">
      <Switch />
    </Field>,
  );
  // getByLabel also matches the hidden native input Base UI rides beside the styled span (R2) —
  // scope to the accessible role so the assertion targets the actual control under test.
  const control = page.getByRole("switch", { name: "Streaming" });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
