// CT: the toggle seal — a two-state pressable button; pointer + keyboard flip data-pressed and
// aria-pressed, pressed wears the selection fill and keyboard focus owns the only ring.
import { Toggle } from "@orb/ui/toggle";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";

const TOUCH_FLOOR_PX = 44;

test("click flips data-pressed / aria-pressed", async ({ mount, page }) => {
  await mount(<Toggle aria-label="Bold">B</Toggle>);
  const control = page.getByRole("button");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveAttribute("data-pressed", "");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "false");
});

// ── Selected is a fill; keyboard focus owns the only ring ─────────────────────────────────────────
// A selected toggle that paints a ring in the focus hue reads as a second focused control beside the real one.
// Hearth is the base `@theme` at `:root` and theme.css emits `[data-theme]` for light, so the hearth pane
// carries no attribute. One mount serves both themes.
const TOGGLE_THEMES = ["hearth", "light"] as const;

const togglePanes = (): ReactElement => (
  <>
    {TOGGLE_THEMES.map((theme) => (
      <div className="bg-card p-gutter" data-testid={`pane-${theme}`} key={theme} {...(theme === "hearth" ? {} : { "data-theme": theme })}>
        <Toggle aria-label={`${theme} selected`} defaultPressed={true}>
          B
        </Toggle>
        <Toggle aria-label={`${theme} rest`}>I</Toggle>
      </div>
    ))}
  </>
);

interface Paint {
  readonly bg: string;
  readonly shadow: string;
  readonly ink: string;
}

async function paintOf(control: Locator): Promise<Paint> {
  return await control.evaluate((el) => {
    const style = getComputedStyle(el);
    return { bg: style.backgroundColor, shadow: style.boxShadow, ink: style.color };
  });
}

/** A theme token resolved inside `scope`, so the light pane reads its own arm. A computed box-shadow prints
 *  resolved colours, so the comparison has to be against a resolved colour too. */
async function tokenColorIn(scope: Locator, cssVar: string): Promise<string> {
  return await scope.evaluate((el, name) => {
    const probe = el.ownerDocument.createElement("div");
    probe.style.color = `var(${name})`;
    el.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, cssVar);
}

/** Keyboard modality first: `:focus-visible` needs it, and a bare programmatic focus with no prior key
 *  press would read the resting skin. */
async function keyboardFocus(page: Page, control: Locator): Promise<void> {
  await page.keyboard.press("Tab");
  await control.focus();
  await expect(control).toBeFocused();
}

for (const theme of TOGGLE_THEMES) {
  test(`${theme}: a selected toggle and a focused toggle render differently`, async ({ mount, page }) => {
    await mount(togglePanes());
    const pane = page.getByTestId(`pane-${theme}`);
    const selected = page.getByRole("button", { name: `${theme} selected` });
    const rest = page.getByRole("button", { name: `${theme} rest` });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    const ring = await tokenColorIn(pane, "--color-ring");

    await keyboardFocus(page, rest);
    // Positive control: the focus ring really paints the ring token, or the absence below proves nothing.
    await expect.poll(async () => (await paintOf(rest)).shadow).toContain(ring);
    const focused = await paintOf(rest);
    const selectedPaint = await paintOf(selected);

    expect(selectedPaint.shadow, `[${theme}] the selected toggle paints no ring in the focus hue`).not.toContain(ring);
    expect(selectedPaint.bg, `[${theme}] the selected toggle is a fill the focused one is not`).not.toBe(focused.bg);
    expect(selectedPaint.ink, `[${theme}] the selected toggle's ink changes with its fill`).not.toBe(focused.ink);
  });

  test(`${theme}: a focused selected toggle still shows the focus ring over its fill`, async ({ mount, page }) => {
    await mount(togglePanes());
    const pane = page.getByTestId(`pane-${theme}`);
    const selected = page.getByRole("button", { name: `${theme} selected` });
    const ring = await tokenColorIn(pane, "--color-ring");
    const resting = await paintOf(selected);

    await keyboardFocus(page, selected);
    await expect.poll(async () => (await paintOf(selected)).shadow).toContain(ring);
    const focused = await paintOf(selected);
    expect(focused.bg).toBe(resting.bg);
  });
}

test("pressed paints the selection-quiet fill, and hovering a pressed toggle keeps it", async ({ mount, page }) => {
  await mount(
    <div>
      <Toggle aria-label="Bold" defaultPressed={true}>
        B
      </Toggle>
      <div className="bg-selection-quiet text-selection-quiet-foreground" data-testid="fill-probe" />
    </div>,
  );
  const control = page.getByRole("button", { name: "Bold" });
  const probe = await paintOf(page.getByTestId("fill-probe"));
  await expect.poll(async () => (await paintOf(control)).bg).toBe(probe.bg);
  await expect.poll(async () => (await paintOf(control)).ink).toBe(probe.ink);
  await expect.poll(async () => (await paintOf(control)).shadow).toBe("none");

  await control.hover();
  await expect.poll(async () => (await paintOf(control)).bg).toBe(probe.bg);
});

test("onPressedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Toggle
      aria-label="Bold"
      onPressedChange={(pressed): void => {
        seen.push(pressed);
      }}
    >
      B
    </Toggle>,
  );
  await page.getByRole("button").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("hover shows the accent token", async ({ mount, page }) => {
  const toggle = await mount(<Toggle aria-label="Bold">B</Toggle>);
  await page.getByRole("button").hover();
  await expect(toggle).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

test("keyboard focus shows a focus-visible ring", async ({ mount, page }) => {
  const toggle = await mount(<Toggle aria-label="Bold">B</Toggle>);
  await expect(toggle).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button")).toBeFocused();
  await expect.poll(async () => await toggle.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
});

test("disabled is inert and removed from the tab order", async ({ mount, page }) => {
  await mount(
    <div>
      <button type="button">Before</button>
      <Toggle aria-label="Bold" disabled={true}>
        B
      </Toggle>
    </div>,
  );
  const toggle = page.getByRole("button", { name: "Bold" });
  await expect(toggle).toBeDisabled();
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(toggle).not.toBeFocused();
});

test("Enter and Space toggle pressed from the keyboard", async ({ mount, page }) => {
  await mount(<Toggle aria-label="Bold">B</Toggle>);
  const control = page.getByRole("button");
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(control).toHaveAttribute("aria-pressed", "false");
});

// The ≥44px floor is a COARSE-pointer guarantee (D62 P1) — control heights narrow on fine pointers,
// so this runs under an emulated coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx
// precedent). Without it the default Desktop-Chrome CT is fine and the heights are 28/40, not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("every size meets the 44px touch floor; lg is taller than sm", async ({ mount }) => {
    const small = await mount(
      <Toggle aria-label="Bold" size="sm">
        B
      </Toggle>,
    );
    const smallBox = await small.boundingBox();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(smallBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await small.unmount();
    const large = await mount(
      <Toggle aria-label="Bold" size="lg">
        B
      </Toggle>,
    );
    const largeBox = await large.boundingBox();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(largeBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(largeBox?.height ?? 0).toBeGreaterThan(smallBox?.height ?? 0);
  });
});
