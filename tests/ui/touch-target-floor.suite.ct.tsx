// CT: the COMPONENT half of gate touch-target-floor (D62 P1 / UI-Architecture §4b axis 3). The
// token-layer floor is already proven at the token seam (tests/ui/tokens/index.{test,ct}.tsx — the
// emitted CSS carries the coarse @theme floor + the @media(pointer:fine) override, and one Button rides
// it in a real browser). MISSING until now: the sweep across the interactive primitive SET, asserting
// each one meets the ≥44px floor on the axis the LAW governs, under a coarse pointer.
//
// TWO GOVERNED METRICS (D62 P1 is precise about which axis is floored):
//   • SHORT SIDE — for the square / pseudo-expanded controls. Switch/Checkbox/RadioGroupItem keep a
//     SMALL visible box and lift the hit area to 44×44 via a `::before` size-touch-target pseudo
//     (variants.ts); icon Button + NumberField steppers are square touch-target boxes. A boundingBox-
//     only read would wrongly fail the pseudo controls, so `box()` unions the visible box with the
//     absolutely-positioned pseudo, and the assertion is on the SHORT side.
//   • CONTROL HEIGHT — for row / text controls (text Button/Toggle/Tabs/Select/Input/ListRow/Menu item/
//     Combobox group/Slider control). The law floors the control HEIGHT ("≥44px control heights hold at
//     pointer: coarse"); their WIDTH is content/layout-driven and deliberately NOT token-floored (a
//     toggle is as wide as its glyph). Measuring min(w,h) here would flag content width the design never
//     promised — so these assert HEIGHT ≥ 44. The tap surface for a composite control is the OUTER
//     bordered box (e.g. the combobox INPUT-GROUP), not the inner <input>.
//
// POINTER EMULATION (R6 — proven, not assumed): Playwright's `hasTouch: true` context flips
// `matchMedia("(pointer: coarse)")` in chromium, so the coarse `@theme` control-height wins over the
// unlayered `@media(pointer:fine)` 28/34/40 override (the tokens/index.ct.tsx precedent). `page
// .emulateMedia` does NOT expose a `pointer` feature, so it can't drive this. The first test PROBES that
// the emulation landed before any geometry is trusted. Assertions POLL (`expect.poll`) so a popup's
// open-scale animation (Base UI Menu scales from ~0.95 → 1) settles before the box is read. Coarse-wide.
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Combobox } from "@orb/ui/combobox";
import { Input } from "@orb/ui/input";
import { ListRow } from "@orb/ui/list-row";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { NumberField } from "@orb/ui/number-field";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Toggle } from "@orb/ui/toggle";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

// The whole suite emulates a coarse (touch) pointer — the floor is a coarse-only guarantee.
test.use({ hasTouch: true });

const FLOOR = 44;

const SELECT_ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];
// Combobox items are a readonly string[] (the seal's own item shape) — not label/value objects.
const TAGS = ["Adventure", "Mystery"] as const;

/**
 * The effective hit box (px): the visible border box unioned per-axis with the element's
 * absolutely-positioned `::before` (the size-touch-target pseudo Switch/Checkbox/Radio use to lift a
 * small visible box to the floor). For control-height primitives the pseudo is absent and the box is
 * the visible box.
 */
async function box(locator: Locator): Promise<{ width: number; height: number }> {
  return await locator.evaluate((el: Element) => {
    const rect = el.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    const before = getComputedStyle(el, "::before");
    if (before.content !== "none" && before.position === "absolute") {
      const bw = Number.parseFloat(before.width);
      const bh = Number.parseFloat(before.height);
      if (Number.isFinite(bw)) {
        width = Math.max(width, bw);
      }
      if (Number.isFinite(bh)) {
        height = Math.max(height, bh);
      }
    }
    return { width, height };
  });
}

async function shortSide(locator: Locator): Promise<number> {
  const b = await box(locator);
  return Math.min(b.width, b.height);
}

async function controlHeight(locator: Locator): Promise<number> {
  return (await box(locator)).height;
}

// ── R6 probe — the emulation actually flipped the pointer media ───────────────────────────────────

test("the CT context reports a COARSE pointer (hasTouch flips pointer:coarse)", async ({ page }) => {
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const fine = await page.evaluate(() => matchMedia("(pointer: fine)").matches);
  expect(coarse, "hasTouch must make the @media(pointer:coarse) branch win").toBe(true);
  expect(fine, "the fine override must NOT apply under a coarse pointer").toBe(false);
});

// ── Square / ::before-expanded controls — SHORT SIDE ≥ 44 ─────────────────────────────────────────

test("icon Button is a square control meeting the floor on both axes", async ({ mount }) => {
  const button = await mount(<Button aria-label="Regenerate" size="icon" />);
  await expect.poll(() => shortSide(button), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Switch hit area reaches the floor via its ::before pseudo (visible track is shorter)", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  // Prove the visible box alone is UNDER the floor — otherwise the ::before union isn't being exercised.
  const visible = await control.evaluate((el: Element) => el.getBoundingClientRect().height);
  expect(visible, "the Switch's visible track is intentionally < 44px tall").toBeLessThan(FLOOR);
  await expect.poll(() => shortSide(control), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Checkbox hit area reaches the floor via its ::before pseudo", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" />);
  await expect.poll(() => shortSide(page.getByRole("checkbox")), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("RadioGroupItem hit area reaches the floor via its ::before pseudo", async ({ mount, page }) => {
  await mount(
    <RadioGroup aria-label="Who runs the game">
      <RadioGroupItem value="ai">An AI</RadioGroupItem>
      <RadioGroupItem value="human">A human GM</RadioGroupItem>
    </RadioGroup>,
  );
  const radio = page.getByRole("radio", { name: "An AI" });
  await expect.poll(() => shortSide(radio), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("NumberField steppers are full touch-target squares", async ({ mount, page }) => {
  await mount(<NumberField aria-label="Weight" defaultValue={5} />);
  const inc = page.getByRole("button", { name: "Increase" });
  const dec = page.getByRole("button", { name: "Decrease" });
  await expect.poll(() => shortSide(inc), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
  await expect.poll(() => shortSide(dec), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

// ── Row / text controls — CONTROL HEIGHT ≥ 44 ─────────────────────────────────────────────────────

for (const size of ["sm", "md", "lg"] as const) {
  test(`Button size="${size}" meets the height floor`, async ({ mount }) => {
    const button = await mount(<Button size={size}>Save</Button>);
    await expect.poll(() => controlHeight(button), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
  });
}

for (const size of ["sm", "md", "lg"] as const) {
  test(`Toggle size="${size}" meets the height floor`, async ({ mount }) => {
    const toggle = await mount(
      <Toggle aria-label="Bold" size={size}>
        B
      </Toggle>,
    );
    await expect.poll(() => controlHeight(toggle), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
  });
}

test("Select trigger meets the height floor", async ({ mount, page }) => {
  await mount(<Select aria-label="Model picker" items={SELECT_ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox", { name: "Model picker" });
  await expect.poll(() => controlHeight(trigger), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Tabs tab meets the height floor", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
      </TabsList>
      <TabsPanel value="one">First</TabsPanel>
      <TabsPanel value="two">Second</TabsPanel>
    </Tabs>,
  );
  const tab = page.getByRole("tab", { name: "One" });
  await expect.poll(() => controlHeight(tab), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Slider control (the drag surface) meets the height floor", async ({ mount }) => {
  const slider = await mount(<Slider defaultValue={50} label="Volume" max={100} min={0} />);
  const control = slider.locator('[data-slot="slider-control"]');
  await expect.poll(() => controlHeight(control), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("clickable ListRow body meets the height floor", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} title="Elara" />);
  const row = page.getByRole("button", { name: "Elara" });
  await expect.poll(() => controlHeight(row), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Input meets the height floor", async ({ mount }) => {
  const input = await mount(<Input aria-label="Name" />);
  await expect.poll(() => controlHeight(input), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Combobox tap surface (the input group) meets the height floor", async ({ mount }) => {
  const combobox = await mount(<Combobox aria-label="Tag" items={TAGS} />);
  const group = combobox.locator('[data-slot="combobox-input-group"]');
  await expect.poll(() => controlHeight(group), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Menu items meet the height floor (opened, measured in the portal after the open animation)", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
        <MenuItem>Delete</MenuItem>
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  const item = page.getByRole("menuitem", { name: "Rename" });
  await expect.poll(() => controlHeight(item), { intervals: [20, 50, 100], timeout: 5000 }).toBeGreaterThanOrEqual(FLOOR);
});

// ── NAMED NON-COVERAGE — interactive primitives this sweep deliberately does not mount ────────────
// (Recorded as a reviewable list, not `test.skip` — the repo's lint bans skipped tests. Each shares its
// hit-area anatomy with a primitive asserted above, so mounting it would re-measure the same box.)
//   • Autocomplete — identical control-height input-trigger anatomy to Combobox (covered).
//   • Command — its palette items ride the same MenuItem `min-h-control-sm` rule as Menu (covered);
//     a Command mount only adds the CommandDialog open flow, no new geometry.
//   • MacroTextarea — a sealed mid-text editable seam, not a discrete tap target; its textarea rides
//     the same control-height rule Input asserts.
//   • Sortable — exposes a drag HANDLE inside a consuming row; no standalone-mountable control with a
//     stable role, and the drag surface is the row body (ListRow rule, covered).
