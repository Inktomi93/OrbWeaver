// CT: the COMPONENT half of gate touch-target-floor (D62 P1 / UI-Architecture §4b axis 3). The
// token-layer floor is already proven at the token seam (tests/ui/tokens/index.{test,ct}.tsx — the
// emitted CSS carries the coarse @theme floor + the @media(pointer:fine) override, and one Button rides
// it in a real browser). MISSING until now: the sweep across the interactive primitive SET, asserting
// each one meets the ≥44px floor on the axis the LAW governs, under a coarse pointer.
//
// TWO GOVERNED METRICS (D62 P1 is precise about which axis is floored):
//   • SHORT SIDE — for the square / pseudo-expanded controls. Checkbox/RadioGroupItem keep a SMALL
//     visible box at every pointer and lift the hit area to 44×44 via a `::before` size-touch-target
//     pseudo (variants.ts); icon Button + NumberField steppers are square touch-target boxes. A
//     boundingBox-only read would wrongly fail the pseudo controls, so `box()` unions the visible box
//     with the absolutely-positioned pseudo, and the assertion is on the SHORT side.
//     SWITCH IS NO LONGER IN THAT BUCKET (96d167e407): its ROOT grows to `h-touch-target` at a coarse
//     pointer, so the coarse floor is carried by the visible track and the pseudo demotes to the
//     unknown-pointer fallback. Its case below asserts the live mechanism, not the union alone.
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
import { Autocomplete } from "@orb/ui/autocomplete";
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
 * absolutely-positioned `::before` (the size-touch-target pseudo Checkbox/Radio use to lift a small
 * visible box to the floor, and that Switch keeps as its unknown-pointer fallback). For control-height
 * primitives the pseudo is absent and the box is the visible box.
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

// The Switch's coarse floor is ROOT-CARRIED (landed 96d167e407 as `pointer-coarse:h-touch-target`; since
// #1109 the root spells its height from the ONE pointer-conditional `--spacing-switch-track-height`,
// whose coarse arm is that same 44px, so this floor is now a token VALUE rather than a variant) — the
// visible track itself grows to 44 at a coarse pointer while the thumb rides its own pointer-conditional
// pair at ~55% of that height, so the travel stays legible. This case used to open with the opposite
// precondition (`visible < 44`, proving the ::before union was doing the lifting); that assertion was
// true of the OLD mechanism and became a lie the moment the root started carrying the floor, which is
// how this file went red. It is replaced, not dropped: asserting the VISIBLE box clears the floor is
// strictly STRONGER than the union — a union can be satisfied by invisible overflow, a visible box
// cannot. The pseudo survives as the unknown-pointer fallback, so it keeps its own pin; without it a
// silent removal of TOUCH_TARGET_PSEUDO from the root would leave this case green.
// THE FLOOR IS NOT THE WHOLE COARSE CONTRACT (#420): this case is satisfied by a SQUARE, and for three
// weeks it was — a 48x44 root read as a crescent moon and nothing went red, because the only aspect pin
// ran at a fine pointer. The coarse SHAPE lives with the control's own seal, in switch.ct.tsx's
// `at a COARSE pointer` describe. Neither pin is sufficient alone; do not delete one as redundant.
test("Switch: the VISIBLE track carries the floor at a coarse pointer (::before stays as the fallback)", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  await expect.poll(() => control.evaluate((el: Element) => el.getBoundingClientRect().height), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
  const pseudo = await control.evaluate((el: Element) => {
    const before = getComputedStyle(el, "::before");
    return {
      height: Number.parseFloat(before.height),
      position: before.position,
      width: Number.parseFloat(before.width),
    };
  });
  expect(pseudo.position, "TOUCH_TARGET_PSEUDO must stay on the root as the unknown-pointer hit-area fallback").toBe("absolute");
  expect(Math.min(pseudo.width, pseudo.height), "the fallback pseudo still spans the full touch target").toBeGreaterThanOrEqual(FLOOR);
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

// The OPTION ROW is its own geometry, on its own rule. Both seals' items render `ITEM_ROW`
// (`min-h-touch-target`, lib/popup-surface.ts) — NOT the `h-control-sm` the input groups above ride, and not
// the `min-h-control-sm` this file's Menu case asserts. So neither of the two input-group cases above says
// anything about the row a finger actually lands on, and the suite's own non-coverage note used to claim
// otherwise for Autocomplete (corrected below). The tag-attach picker makes this the load-bearing target:
// picking the suggestion IS the whole affordance — retyping the name instead is the duplicate-tag rot it
// exists to prevent.
test("Autocomplete option rows meet the height floor (the tap target is the ROW, not the field)", async ({ mount, page }) => {
  // The INLINE arm, because that is the one a prompt dialog uses and it needs no open animation to settle:
  // `mode="none"` renders exactly the items handed in, `open` is Base UI's requirement for inline.
  await mount(<Autocomplete aria-label="Tag" inline={true} items={TAGS} mode="none" open={true} />);
  const option = page.getByRole("option", { name: "Adventure" });
  await expect(option).toBeVisible();
  await expect.poll(() => controlHeight(option), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(FLOOR);
});

test("Combobox option rows meet the height floor (the same ITEM_ROW rule, in the anchored arm)", async ({ mount, page }) => {
  await mount(<Combobox aria-label="Tag" items={TAGS} />);
  await page.getByRole("combobox", { name: "Tag" }).click();
  const option = page.getByRole("option", { name: "Adventure" });
  await expect(option).toBeVisible();
  // POLLED: this arm IS an anchored popup, so the box is read through the open-scale animation.
  await expect.poll(() => controlHeight(option), { intervals: [20, 50, 100], timeout: 5000 }).toBeGreaterThanOrEqual(FLOOR);
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
//   (Autocomplete came OFF this list 2026-08-08. Its entry read "identical control-height input-trigger
//   anatomy to Combobox (covered)", which was true of the FIELD and silent about the option ROW — a
//   different element on a different rule (`ITEM_ROW`), and the one the tag-attach picker asks a finger to
//   hit. Both seals' rows are asserted above now. The lesson generalises: a non-coverage row must name the
//   ELEMENT it is excusing, not the component.)
//   • Command — its palette items ride the same MenuItem `min-h-control-sm` rule as Menu (covered);
//     a Command mount only adds the CommandDialog open flow, no new geometry.
//   • MacroTextarea — a sealed mid-text editable seam, not a discrete tap target; its textarea rides
//     the same control-height rule Input asserts.
//   • Sortable — exposes a drag HANDLE inside a consuming row; no standalone-mountable control with a
//     stable role, and the drag surface is the row body (ListRow rule, covered).
