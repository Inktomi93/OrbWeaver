import { Avatar } from "@orb/ui/avatar";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const SVG_MARKUP = "<svg xmlns='http://www.w3.org/2000/svg' width='2' height='2'><rect width='2' height='2'/></svg>";
const TINY_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG_MARKUP)}`;

// avatar-lg is authored in rem; the rendered box resolves to px (root = 16px — the stack.ct precedent).
const ROOT_PX = 16;
const avatarLgPx = Math.round(Number.parseFloat(TOKENS["spacing.avatar-lg"].value) * ROOT_PX);

test("renders the image when it loads", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Alex" src={TINY_SVG}>
      NT
    </Avatar>,
  );

  await expect(page.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(page.locator('[data-slot="avatar-image"]')).toHaveAttribute("width", "1");
  await expect(page.locator('[data-slot="avatar-image"]')).toHaveAttribute("height", "1");
  await expect(page.locator('[data-slot="avatar-fallback"]')).toBeHidden();
});

test("falls back to initials when the image fails to load", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Alex" src="/definitely-not-a-real-image.png">
      NT
    </Avatar>,
  );

  const fallback = page.locator('[data-slot="avatar-fallback"]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toBeHidden();
});

test("falls back when no image source is given", async ({ mount, page }) => {
  await mount(<Avatar alt="Alex">NT</Avatar>);

  await expect(page.locator('[data-slot="avatar-fallback"]')).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
});

// The initials fallback is DECORATIVE: still visible in the DOM, but aria-hidden so its letters never
// leak into an accessible name (chat rows / message rows / cast bars all sit avatars beside a real text
// label). A fallback-only avatar contributes NO accessible text — identity comes from the adjacent
// label, or an `aria-label` when the avatar is the sole content of a control.
test("the initials fallback is decorative (aria-hidden) — visible but not in the a11y name", async ({ mount, page }) => {
  await mount(
    <button aria-label="Open the owner's profile" type="button">
      <Avatar alt="Alex">NT</Avatar>
    </button>,
  );
  const fallback = page.locator('[data-slot="avatar-fallback"]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("button")).toHaveAccessibleName("Open the owner's profile");
});

test("shape variants map to the radius tokens", async ({ mount, page }) => {
  await mount(<Avatar alt="Round avatar">R</Avatar>);
  const root = page.locator('[data-slot="avatar-root"]');
  // round (default) = --radius-full
  await expect(root).toHaveCSS("border-radius", "9999px");
});

test("square shape uses the control radius token; size rides the DISPLAY-avatar token (D62 rewire)", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Square avatar" shape="square" size="lg">
      S
    </Avatar>,
  );
  const root = page.locator('[data-slot="avatar-root"]');
  // square = --radius-control (0.375rem = 6px)
  await expect(root).toHaveCSS("border-radius", "6px");
  // lg = --spacing-avatar-lg (2.5rem = 40px) — DECOUPLED from the control tokens (was 56px control-lg).
  await expect(root).toHaveCSS("width", `${avatarLgPx}px`);
});

test("rounded shape uses the PORTRAIT radius token (§B.3 avatar versatility)", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Rounded avatar" shape="rounded">
      R
    </Avatar>,
  );
  const root = page.locator('[data-slot="avatar-root"]');
  // rounded = --radius-base (0.5rem = 8px). It was --radius-card until the density pass S2: `card` is the
  // FLOATING-island step (density-pass-spec.md §2.1 / D6) and `base` is the one assigned to portraits.
  await expect(root).toHaveCSS("border-radius", "8px");
});

test("portrait aspect renders a 2:3 box (the VN/immersive presence lever, §B.3/§B.4)", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Portrait avatar" aspect="portrait" size="lg">
      P
    </Avatar>,
  );
  const root = page.locator('[data-slot="avatar-root"]');
  await expect(root).toHaveCSS("aspect-ratio", "2 / 3");
  // Height still rides the size token; width is derived FROM the aspect-ratio (h-full w-auto).
  await expect(root).toHaveCSS("height", `${avatarLgPx}px`);
});

test("ring=none (default) paints no box-shadow", async ({ mount, page }) => {
  await mount(<Avatar alt="No ring">NR</Avatar>);
  await expect(page.locator('[data-slot="avatar-root"]')).toHaveCSS("box-shadow", "none");
});

test("ring=accent paints a visible ring (§B.3 — reuse-ready for active-speaker highlight)", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Accent ring" ring="accent">
      AR
    </Avatar>,
  );
  const boxShadow = await page.locator('[data-slot="avatar-root"]').evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
});

// Every rendered fallback's background-color in one read (no await-in-loop).
const FALLBACK = '[data-slot="avatar-fallback"]';
const readBackgrounds = (els: Element[]): string[] => els.map((el) => getComputedStyle(el).backgroundColor);

test("the fallback hue is DETERMINISTIC per seed and spreads across the ramp (D62)", async ({ mount, page }) => {
  // Two avatars with the SAME seed (indices 0,1) + four distinct seeds — mounted together so a single
  // read compares them without a loop.
  await mount(
    <div>
      <Avatar hueSeed="Wren Calloway">WC</Avatar>
      <Avatar hueSeed="Wren Calloway">WC</Avatar>
      <Avatar hueSeed="The Cartographer">TC</Avatar>
      <Avatar hueSeed="Saria Vex">SV</Avatar>
      <Avatar hueSeed="Inkfell">IF</Avatar>
      <Avatar hueSeed="Captain Mott">CM</Avatar>
    </div>,
  );
  const bgs = await page.locator(FALLBACK).evaluateAll(readBackgrounds);
  // Same seed → identical color (stable per identity).
  expect(bgs[0]).toBe(bgs[1]);
  // Distinct seeds spread across more than one hue (the hash mixes — not a constant).
  expect(new Set(bgs).size).toBeGreaterThan(1);
});

test("hueSeed defaults to alt — a missing seed still colors the fallback stably by name", async ({ mount, page }) => {
  // Left relies on the alt default; right passes hueSeed === alt explicitly — same resolved hue.
  await mount(
    <div>
      <Avatar alt="Saria Vex">SV</Avatar>
      <Avatar alt="Saria Vex" hueSeed="Saria Vex">
        SV
      </Avatar>
    </div>,
  );
  const bgs = await page.locator(FALLBACK).evaluateAll(readBackgrounds);
  expect(bgs[0]).toBe(bgs[1]);
});

// ── issue 103: the monogram sits inside the ACTIVE THEME's band, under every shipped palette ────────────────
//
// The defect this pins: the fallback used to fill from `--color-chart-1..5`, a CATEGORICAL ramp chosen for
// mutual distinguishability and therefore spread across the wheel and identical under every palette — so a
// Mocha (blue) or Light (amber) app painted purple/green/salmon/teal/olive monograms that belonged to no
// theme, which the mobile audit called the loudest thing on the screen. It now derives from the palette's
// own `--color-primary`, so the assertion is on the HUE ANGLE, measured in the browser off the resolved
// paint (never off the source): every bucket must land within a few degrees of the theme's own accent.
//
// The seed palettes are `[data-theme]` blocks in ui's generated theme.css, so a wrapper carrying the attr
// is the whole switch — and the fill resolves on the FALLBACK element, which is what makes it track a
// scoped override at all (the reason this is an inline relative-color expression, not a :root token).
const IN_BAND_DEGREES = 12;
// One seed PER BUCKET (djb2 mod 5 → 1..5, in that order), so the sweep measures all five steps rather
// than whichever subset five arbitrary names happen to hash onto. The `data-hue` datum below is what
// makes this pairing checkable instead of a comment nobody re-derives.
const HUE_SEEDS = ["The Cartographer", "Inkfell", "Wren Calloway", "Sabine Veyra", "Saria Vex"] as const;

/** A computed `rgb` triple (Chrome serializes background-color that way) → its hue angle in degrees, or null for a grey. */
function hueOfRgb(value: string): number | null {
  const nums =
    value
      .match(/[\d.]+/gu)
      ?.slice(0, 3)
      .map(Number) ?? [];
  const [r = 0, g = 0, b = 0] = nums.map((n) => n / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) {
    return null;
  }
  let h = 0;
  if (max === r) {
    h = ((g - b) / span) % 6;
  } else if (max === g) {
    h = (b - r) / span + 2;
  } else {
    h = (r - g) / span + 4;
  }
  return (h * 60 + 360) % 360;
}

/** Smallest absolute separation between two hue angles, across the 0/360 seam. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

for (const theme of ["hearth", "mocha", "light"] as const) {
  test(`issue 103: every monogram hue sits in ${theme}'s own band (derived from --color-primary, not the chart ramp)`, async ({ mount, page }) => {
    await mount(
      // `hearth` has no [data-theme] block — it IS the base @theme — so the attribute is simply absent
      // there and the wrapper reads the root palette, which is the real product shape.
      <div {...(theme === "hearth" ? {} : { "data-theme": theme })} data-slot="theme-probe">
        {HUE_SEEDS.map((seed) => (
          <Avatar hueSeed={seed} key={seed}>
            AB
          </Avatar>
        ))}
      </div>,
    );
    const probe = page.locator('[data-slot="theme-probe"]');
    // The palette's own accent, resolved in the SAME scope the avatars paint in.
    const primary = await probe.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-primary"));
    const primaryHue = await probe.evaluate((el, value) => {
      const probeEl = el.ownerDocument.createElement("span");
      probeEl.style.color = value;
      el.append(probeEl);
      const resolved = getComputedStyle(probeEl).color;
      probeEl.remove();
      return resolved;
    }, primary);
    const bgs = await page.locator(FALLBACK).evaluateAll(readBackgrounds);
    expect(bgs).toHaveLength(HUE_SEEDS.length);
    const accent = hueOfRgb(primaryHue);
    expect(accent, `${theme}'s --color-primary must resolve to a chromatic color`).not.toBeNull();
    // An ACHROMATIC fallback is a failure, not a pass: `hueOfRgb` returns null for a grey, and a monogram
    // with no fill at all (the shape a neutered/unscanned background utility produces) must not read as
    // "in band" by having no hue to be out of band with. 180° is the maximum possible gap.
    const gaps = bgs.map((bg) => {
      const hue = hueOfRgb(bg);
      return hue === null ? 180 : hueGap(hue, accent ?? 0);
    });
    expect(Math.max(...gaps), `${theme}: hue gaps ${gaps.map((g) => g.toFixed(1)).join(", ")}° from the accent`).toBeLessThanOrEqual(IN_BAND_DEGREES);
    // …and they are still five DISTINCT tones inside that band (the ruling's other half).
    expect(new Set(bgs).size).toBe(HUE_SEEDS.length);
    // FIXTURE GUARD, deliberately LAST: the seeds above cover every bucket exactly once, so a rehash of
    // the djb2 mixer fails here rather than silently shrinking the sweep. It reads the new `data-hue`
    // datum, so it runs AFTER the assertions that measure only rendered paint.
    const buckets = await page.locator(FALLBACK).evaluateAll((els) => els.map((el) => el.getAttribute("data-hue")));
    expect(buckets).toEqual(["1", "2", "3", "4", "5"]);
  });
}
