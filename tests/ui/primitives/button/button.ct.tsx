// CT: the button seal — token variants land as computed style, sizes hold the touch floor,
// loading is a real disabled+aria-busy state (ui-package-design §6.1).

import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";

const TOUCH_FLOOR_PX = 44;

test("primary intent lands as the primary token background", async ({ mount }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("destructive intent swaps to the destructive token", async ({ mount }) => {
  const button = await mount(<Button intent="destructive">Delete</Button>);
  await expect(button).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});

// The ≥44px touch floor is a COARSE-pointer guarantee (D62 P1) — control heights narrow on fine
// pointers, so these run under an emulated coarse pointer (hasTouch → pointer:coarse, the
// tokens/index.ct.tsx precedent). Without it the default Desktop-Chrome CT is a FINE pointer and the
// heights are the intentional desktop scale (28/34/40), not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("every size meets the 44px touch floor; lg is taller than sm", async ({ mount }) => {
    const small = await mount(<Button size="sm">Save</Button>);
    const smallBox = await small.boundingBox();
    expect(smallBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await small.unmount();
    const large = await mount(<Button size="lg">Save</Button>);
    const largeBox = await large.boundingBox();
    expect(largeBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(largeBox?.height ?? 0).toBeGreaterThan(smallBox?.height ?? 0);
  });

  test("wrap size keeps the floor for a short label (its height is a MINIMUM, not a release)", async ({ mount }) => {
    const button = await mount(<Button size="wrap">Go</Button>);
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  });

  // D62 axis 3 for the `inline` arm: its VISIBLE box is deliberately text-height (that is the whole point
  // — it stands in for the datum it edits), so the floor is met by the hit-area ::after, not the box. The
  // receipt is the pseudo's own computed geometry under a coarse pointer, read off the live element.
  test("inline size carries a ≥44px hit area in the ::after pseudo while its own box stays text-height", async ({ mount }) => {
    const button = await mount(<Button size="inline">Bruised</Button>);
    const box = await button.boundingBox();
    const hit = await button.evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return { height: Number.parseFloat(style.height), width: Number.parseFloat(style.width) };
    });
    expect(hit.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    expect(hit.width).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    // The hit area is LAYOUT-NEUTRAL: it expands past the button's own text-height box, never resizes it.
    expect(box?.height ?? 0).toBeLessThan(TOUCH_FLOOR_PX);
    expect(hit.height).toBeGreaterThan(box?.height ?? 0);
  });

  test("icon size is a square control meeting the floor with no horizontal padding", async ({ mount }) => {
    const button = await mount(<Button aria-label="Regenerate" size="icon" />);
    const box = await button.boundingBox();
    expect(box?.width).toBeCloseTo(box?.height ?? 0, 0);
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
    await expect(button).toHaveCSS("padding-left", "0px");
    await expect(button).toHaveCSS("padding-right", "0px");
  });
});

// `media` is the CONTENT-SIZED arm: the child (a portrait/media element) defines the box, so the visible
// thing and the hit target are the same rectangle. Every other size pins a control height, which is how a
// 64px avatar came to paint outside its own 34px trigger on the character hero (stickler 2026-08-01 F2).
const MEDIA_CHILD_PX = 64;

test("media size takes its child's box exactly, with no padding of its own", async ({ mount }) => {
  const button = await mount(
    <Button aria-label="Replace portrait" size="media">
      <span data-testid="media-child" style={{ display: "block", height: MEDIA_CHILD_PX, width: MEDIA_CHILD_PX }} />
    </Button>,
  );
  const box = await button.boundingBox();
  expect(box?.width).toBeCloseTo(MEDIA_CHILD_PX, 0);
  expect(box?.height).toBeCloseTo(MEDIA_CHILD_PX, 0);
  await expect(button).toHaveCSS("padding-left", "0px");
  await expect(button).toHaveCSS("padding-top", "0px");
});

// `wrap` is the MULTILINE arm: a choice affordance carrying a model-authored sentence. The label wraps
// inside a constrained column and the box GROWS with it — the geometry a call-site `h-auto` could not
// buy, since a custom-token height is opaque to tailwind-merge and the winner fell out of stylesheet
// order (the two choice-button debt sites the ui-size-via-variant gate held).
const WRAP_COLUMN_PX = 180;
const WRAP_LABEL = "1. Take the long way round the ridge and approach the camp from the treeline at dusk";

test("wrap size wraps its label and grows taller than the single-line sm control", async ({ mount, page }) => {
  await mount(
    <div style={{ width: WRAP_COLUMN_PX }}>
      <Button size="sm">Go</Button>
      <Button size="wrap">{WRAP_LABEL}</Button>
    </div>,
  );
  const singleLine = await page.getByRole("button", { name: "Go" }).boundingBox();
  const wrapped = await page.getByRole("button", { name: WRAP_LABEL }).boundingBox();
  // It stayed inside the column (it wrapped) instead of overflowing on one nowrap line …
  expect(wrapped?.width ?? 0).toBeLessThanOrEqual(WRAP_COLUMN_PX);
  // … and the box followed the wrapped text past the fixed control height.
  expect(wrapped?.height ?? 0).toBeGreaterThan(singleLine?.height ?? 0);
});

// `inline` is the DISPLAY-AT-REST arm: the 13 sites it replaces wrote `!h-auto min-h-0 !px-field !py-0
// font-normal` — an !important escape from the sealed control height (and from the ui-size-via-variant
// gate, which reads `h-auto`, not `!h-auto`). This is the PARITY receipt: the arm must paint exactly what
// those bangs painted, so every number below is read back computed, and the padding is compared to the
// document-resolved token, never a hardcoded px.
test("inline size reproduces the `!h-auto !py-0` geometry it replaces: text-height box, call-site padding, regular weight", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      <Button className="px-field" size="inline">
        Bruised
      </Button>
    </div>,
  );
  const button = page.getByRole("button", { name: "Bruised" });
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-field)";
    el.ownerDocument.body.append(probe);
    const field = probe.getBoundingClientRect().width;
    probe.remove();
    return {
      height: el.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(s.lineHeight),
      paddingBlock: `${s.paddingTop}/${s.paddingBottom}`,
      paddingInline: Number.parseFloat(s.paddingLeft),
      field,
      fontWeight: s.fontWeight,
      justifyContent: s.justifyContent,
    };
  });
  // TEXT-HEIGHT: the box is its own line box — no control height under it (the `!h-auto` the sites bought).
  expect(style.height).toBeCloseTo(style.lineHeight, 0);
  // `!py-0`: the arm ships no block padding at all, so a call site never has to fight one.
  expect(style.paddingBlock).toBe("0px/0px");
  // `!px-field`: the call site's own inset lands unopposed — no `!` needed, resolved against the token.
  expect(style.paddingInline).toBeCloseTo(style.field, 1);
  expect(style.fontWeight).toBe("400");
  expect(style.justifyContent).toBe("flex-start");
});

// SITE-BY-SITE PARITY: every converted call site, its OLD `!important` class string beside its NEW
// `size="inline"` one. Tailwind scans `tests/` (playwright/index.css `@source "../tests"`), so the retired
// bang classes really compile here and the comparison is between two PAINTED boxes, not two strings — the
// only receipt that catches a silent geometry shift on 11 live surfaces. `done ≠ rendered`.
// `justify-content` is deliberately NOT compared: it is the arm's one intended delta (start-alignment is
// what a display-at-rest datum wants, and 6 of the 8 shapes below spelled `justify-start` themselves). The
// other two are CONTENT-WIDTH boxes (no `w-full`), where the property paints nothing — which this test
// proves rather than assumes, since their compared width/height still match to 0.1px.
const PARITY_SITES: readonly { readonly site: string; readonly old: string; readonly next: string; readonly inert?: readonly string[] }[] = [
  {
    site: "tracker-value / ambient-strip rest value",
    old: "!h-auto min-h-0 justify-start gap-0 border border-transparent !px-field !py-0 text-left font-normal",
    next: "gap-0 border border-transparent px-field text-left",
  },
  {
    site: "rpg-beat-row body trigger",
    old: "!h-auto min-h-0 min-w-0 max-w-full whitespace-normal !px-field !py-0 text-left font-normal",
    next: "min-w-0 max-w-full whitespace-normal px-field text-left",
  },
  {
    site: "rpg-card-row (py-row, not py-0)",
    old: "!h-auto min-h-0 w-full justify-start gap-field rounded-control border border-border !px-field !py-row text-left font-normal",
    next: "w-full border border-border px-field py-row text-left",
  },
  {
    site: "rpg-status-tab roster name (medium weight, no font-normal)",
    old: "!h-auto min-h-0 min-w-0 justify-start gap-field !px-field !py-0",
    next: "min-w-0 px-field font-medium",
  },
  {
    site: "rpg-header-band veiled cue (medium weight)",
    old: "!h-auto min-h-0 gap-field !px-field !py-0 text-highlight hover:text-highlight",
    next: "px-field font-medium text-highlight hover:text-highlight",
  },
  {
    site: "rpg-pack-rows item glyph (zero padding)",
    old: "!h-auto !p-0",
    next: "",
    // This trigger holds ONE <Icon> and no text — nothing is typeset in it, so the arm's font-weight
    // (400 vs the base 500 the old string inherited) cannot paint. Every box number still must match.
    inert: ["fontWeight"],
  },
  { site: "cast-card-slots relationship pill (zero padding)", old: "!h-auto min-h-0 rounded-full !p-0 font-normal", next: "rounded-full" },
  {
    site: "rpg-pack-rows tile (px-row/py-field via TILE_CLASS)",
    old: "!h-auto justify-start whitespace-normal font-normal relative w-full min-w-0 items-center gap-field rounded-control border border-border bg-card !px-row !py-field text-left",
    next: "whitespace-normal relative w-full min-w-0 items-center gap-field rounded-control border border-border bg-card px-row py-field text-left",
  },
];

test("every converted call site paints the SAME box on the inline arm as it did on its !important classes", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      {PARITY_SITES.map((s, i) => (
        <div key={s.site}>
          <Button className={s.old} intent="ghost" size="sm">
            <span data-testid={`old-${i}`}>Bruised knuckles</span>
          </Button>
          <Button className={s.next} intent="ghost" size="inline">
            <span data-testid={`new-${i}`}>Bruised knuckles</span>
          </Button>
        </div>
      ))}
    </div>,
  );
  const read = (testId: string): Promise<Record<string, string>> =>
    page
      .getByTestId(testId)
      .evaluate((child) => {
        const el = child.parentElement as HTMLElement;
        const s = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return {
          width: box.width.toFixed(1),
          height: box.height.toFixed(1),
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          fontWeight: s.fontWeight,
          fontSize: s.fontSize,
          lineHeight: s.lineHeight,
          textAlign: s.textAlign,
          borderRadius: s.borderTopLeftRadius,
          borderWidth: s.borderTopWidth,
        };
      })
      .then((v) => v as Record<string, string>);

  const measured = await Promise.all(PARITY_SITES.map(async (_s, i) => Promise.all([read(`old-${i}`), read(`new-${i}`)])));
  for (const [i, s] of PARITY_SITES.entries()) {
    const [before, after] = measured[i] ?? [{}, {}];
    for (const key of s.inert ?? []) {
      delete before[key];
      delete after[key];
    }
    expect(after, `${s.site}: the inline arm must be geometry-identical to the class string it replaced`).toEqual(before);
  }
});

// The CTA's gradient-border ring (globals.css `[data-slot="button"][data-cta]::after`) pairs a
// --color-primary head with a --color-sheen FOOT. That foot used to be a bare white literal sitting
// beside its token-derived half — invisible to every theme (and a no-op gloss on a light one). The
// receipt is a ROUND TRIP on the resolved gradient: re-binding the var repaints the ring (a hardcoded
// literal would survive the override unchanged), and re-binding it to the token's own value restores the
// original paint byte-for-byte — so the shipped ring IS --color-sheen. Every colour comes from the TOKENS
// map; a colour spelled in a CT is gate-RED and would assert our authoring, not the pixels.
test("the CTA ring's sheen stop resolves through --color-sheen (re-binding repaints it; the token's own value restores it)", async ({ mount }) => {
  // `intent` EXPLICIT: `data-cta` (the ring's hook) is stamped from the prop, and the primary default is
  // applied inside the variant factory — an omitted `intent` reads `undefined` at the attribute, so the
  // default-primary button carries no ring at all today (flagged 2026-08-01, not this lane's fix).
  const button = await mount(<Button intent="primary">Save</Button>);
  const paint = (override?: string): Promise<string> =>
    button.evaluate((el, value) => {
      if (value !== undefined) {
        (el as HTMLElement).style.setProperty("--color-sheen", value);
      }
      return getComputedStyle(el, "::after").backgroundImage;
    }, override);
  const painted = await paint();
  expect(painted).not.toBe("none");
  expect(await paint(TOKENS["color.destructive"].value)).not.toBe(painted);
  expect(await paint(TOKENS["color.sheen"].value)).toBe(painted);
});

test("loading sets aria-busy and disables the button", async ({ mount }) => {
  const button = await mount(<Button loading={true}>Save</Button>);
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeDisabled();
});

test("plain disabled is removed from the tab order", async ({ mount, page }) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button disabled={true}>Save</Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).not.toBeFocused();
});

test("loading keeps the button in the tab order for assistive tech", async ({ mount, page }) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button loading={true}>Save</Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
});

test("a caller-supplied focusableWhenDisabled overrides the loading default", async ({ mount, page }) => {
  await mount(
    <div>
      <Button>Before</Button>
      <Button focusableWhenDisabled={false} loading={true}>
        Save
      </Button>
    </div>,
  );
  await page.getByRole("button", { name: "Before" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).not.toBeFocused();
});

test("hover swaps the ghost intent to the accent token", async ({ mount, page }) => {
  const button = await mount(<Button intent="ghost">Save</Button>);
  await page.getByRole("button", { name: "Save" }).hover();
  await expect(button).toHaveCSS("background-color", TOKENS["color.accent"].value);
});

test("ghost defaults to the muted-foreground text token at rest (D62 P5)", async ({ mount }) => {
  const button = await mount(<Button intent="ghost">Save</Button>);
  await expect(button).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("secondary is BORDERED — a border-token outline over a transparent surface (D62 P5)", async ({ mount }) => {
  const button = await mount(<Button intent="secondary">Cancel</Button>);
  // The old solid `--secondary` fill is GONE (retuned to a transparent bordered surface) …
  await expect(button).not.toHaveCSS("background-color", TOKENS["color.secondary"].value);
  // … replaced by a 1px --color-border outline.
  await expect(button).toHaveCSS("border-top-color", TOKENS["color.border"].value);
  await expect(button).toHaveCSS("border-top-width", "1px");
});

test("active press darkens the primary intent from its hover color", async ({ mount, page }) => {
  const button = await mount(<Button>Save</Button>);
  const control = page.getByRole("button", { name: "Save" });
  const readBackgroundColor = (): Promise<string> => button.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.hover();
  const hoverColor = await readBackgroundColor();
  await page.mouse.down();
  // `transition-colors` animates the swap — poll past the transition instead of racing one frame.
  await expect.poll(readBackgroundColor, { intervals: [20, 50, 100] }).not.toBe(hoverColor);
  await page.mouse.up();
});

test("active press scales the surface down (motion guide §4.2 #4)", async ({ mount, page }) => {
  const button = await mount(<Button>Save</Button>);
  const control = page.getByRole("button", { name: "Save" });
  // Tailwind v4 `scale-95` drives the standalone `scale` CSS PROPERTY, not the `transform` matrix.
  const readScale = (): Promise<string> => button.evaluate((el) => getComputedStyle(el).scale);
  // At rest the button is unscaled (`scale: none`).
  expect(await readScale()).toBe("none");
  await control.hover();
  await page.mouse.down();
  // The transition animates `scale` from 1 down to 0.95 — poll the parsed value into the pressed band
  // (the intermediate frames read as 0.95<v≤1, so assert on the settled value, not the first non-none).
  await expect
    .poll(
      async () => {
        const v = await readScale();
        return v === "none" ? 1 : Number.parseFloat(v);
      },
      { intervals: [20, 50, 100] },
    )
    .toBeLessThan(0.97);
  await page.mouse.up();
  // Released: scale returns to identity (`none`), proving the press is transient, not sticky.
  await expect(button).toHaveCSS("scale", "none");
});

test("keyboard focus shows a focus-visible ring", async ({ mount, page }) => {
  // `secondary`, not the default `primary`: the ring is a `box-shadow`, and `primary` now carries a
  // resting `shadow-cta` top-highlight (also a box-shadow) that would confound the none→ring proxy.
  // The focus ring is a base-layer behavior identical across intents, so a shadowless intent isolates it.
  const button = await mount(<Button intent="secondary">Save</Button>);
  await expect(button).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  const shadow = await button.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
});

test("Enter and Space activate the button", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <Button
      onClick={(): void => {
        clicks.push("hit");
      }}
    >
      Save
    </Button>,
  );
  await page.getByRole("button", { name: "Save" }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length, { intervals: [20, 50, 100] }).toBe(2);
});
