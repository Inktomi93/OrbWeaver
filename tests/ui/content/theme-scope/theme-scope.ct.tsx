import { Button } from "@orb/ui/button";
import { Dialog, DialogPopup, DialogTrigger } from "@orb/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Meter } from "@orb/ui/meter";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Select } from "@orb/ui/select";
import { ThemeScope } from "@orb/ui/theme-scope";
import { expect, test } from "@playwright/experimental-ct-react";
import { pixelContrast } from "../../../support/browser/pixel-contrast.ts";
import { ThemedFloatScope } from "./float-theming.fixtures.tsx";

test("a legal override lands as a scoped custom property", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ userBubble: { bg: "oklch(0.3 0.1 20)" } }}>
      <span>scoped</span>
    </ThemeScope>,
  );
  const value = await cmp.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-user-bubble"));
  // ONESHOT-OK: the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(value.trim()).toBe("oklch(0.3 0.1 20)");
});

test("a hostile accent value is DROPPED (no injected custom property)", async ({ mount }) => {
  const attack = ["url(//evil", ".test/x)"].join("");
  const cmp = await mount(
    <ThemeScope tokens={{ accent: attack }}>
      <span>x</span>
    </ThemeScope>,
  );
  // Check the INLINE style (what ThemeScope actually set) — computed would resolve the inherited
  // :root default. A dropped value leaves the inline custom property unset.
  await expect.poll(async () => await cmp.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--color-primary"))).toBe("");
});

// ── Rendered-contrast (done ≠ rendered) ────────────────────────────────────────────────────────────
// The clamp emits relative-color-syntax (`oklch(from <base> ...)`); a Node test can only assert the
// STRING. This proves the browser RESOLVES those strings to real colors that clear WCAG AA — the exact
// light-theme case (background 0.98) that made the static accent-foreground / primary-foreground
// illegible before #16 derived them. Colors are normalized through a 1×1 canvas (the browser converts
// whatever it computed — rgb/oklch — to pixels), then WCAG-contrasted in-page.
test("derived accent-/primary-foreground RESOLVE to AA-legible colors under a light theme", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ background: "oklch(0.98 0.004 75)", accent: "oklch(0.55 0.16 50)" }}>
      <span data-testid="accent" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-accent-foreground)" }}>
        selected row
      </span>
      <span
        data-testid="primary"
        style={{
          backgroundColor: "var(--color-primary)",
          color: "var(--color-primary-foreground)",
        }}
      >
        button label
      </span>
    </ThemeScope>,
  );
  const ratioOf = (testId: string): Promise<number> =>
    cmp.getByTestId(testId).evaluate((el) => {
      const toRgb = (color: string): [number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
          throw new Error("no 2d context");
        }
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return [r ?? 0, g ?? 0, b ?? 0];
      };
      const lum = (rgb: [number, number, number]): number => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const style = getComputedStyle(el);
      const la = lum(toRgb(style.color));
      const lb = lum(toRgb(style.backgroundColor));
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    });
  // accent-foreground on the derived accent surface = body text ⇒ AA 4.5:1; the solid primary button
  // label ⇒ the 3:1 UI/large-text floor. Both would FAIL if the fg had stayed the static dark default.
  expect(await ratioOf("accent")).toBeGreaterThanOrEqual(4.5);
  expect(await ratioOf("primary")).toBeGreaterThanOrEqual(3);
});

for (const theme of [
  { label: "dark", background: "oklch(0.62 0.01 60)", accent: "oklch(0.72 0.14 280)" },
  { label: "light", background: "oklch(0.6201 0.01 60)", accent: "oklch(0.48 0.16 40)" },
] as const) {
  test(`#969 ${theme.label} pivot: transparent actions inherit each real host's solved ink`, async ({ mount, page }) => {
    const cmp = await mount(
      <div data-has-bg-image="" style={{ background: "white", padding: 24 }}>
        <ThemeScope tokens={{ background: theme.background, accent: theme.accent }}>
          <div data-testid="plate" style={{ background: "var(--color-reading-plate)", color: "var(--color-reading-plate-foreground)", padding: 16 }}>
            <Button intent="ghost" size="sm">
              Generate
            </Button>
          </div>
          <div data-testid="card" style={{ background: "var(--color-card)", color: "var(--color-card-foreground)", padding: 16 }}>
            <Button intent="secondary" size="sm">
              Send
            </Button>
          </div>
        </ThemeScope>
      </div>,
    );

    const plate = cmp.getByTestId("plate");
    await expect(plate).toBeVisible();
    await expect.poll(() => plate.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-reading-plate-foreground").trim())).not.toBe("");
    for (const label of ["Generate", "Send"] as const) {
      const action = cmp.getByRole("button", { name: label });
      await expect(action).toBeVisible();
      const receipt = await pixelContrast(page, action);
      expect(receipt.ratio, `${label} @ ${theme.label}: ${receipt.describe}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

// Any value at all — the assertion is that the attribute is ABSENT, not what it would hold.
const ANY_VALUE = /.*/u;

test("density becomes a data-attribute, not a custom property", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ density: "compact" }}>
      <span>x</span>
    </ThemeScope>,
  );
  await expect(cmp).toHaveAttribute("data-density", "compact");
  // There is no chatStyle axis on a scope at all (TD/O-4): the row anatomy is the viewer's own appearance
  // setting, and the attribute this used to stamp had zero selectors reading it.
  await expect(cmp).not.toHaveAttribute("data-chat-style", ANY_VALUE);
});

// ── Nested-scope cascade (character > global > default) ────────────────────────────────────────
// `<ThemeScope>` has no bespoke resolution logic — the "character overrides win over the global
// theme, which wins over the app default" guarantee is PURE CSS custom-property inheritance: an
// inner scope's inline `style` shadows an outer scope's only for the properties it actually sets;
// anything it leaves unset falls through the DOM to the outer scope, then to the app default. These
// tests assert that computed outcome directly (not the inline style, per the "hostile value" test
// above — inheritance can only be observed at computed-style time).

test("nested ThemeScope: inner wins where it sets a token, falls through to outer where it doesn't", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ accent: "oklch(0.3 0.1 20)", speaker: "oklch(0.4 0.1 30)" }}>
      <ThemeScope tokens={{ accent: "oklch(0.5 0.1 40)" }}>
        <span data-testid="probe">x</span>
      </ThemeScope>
    </ThemeScope>,
  );
  const probe = cmp.getByTestId("probe");
  const read = (name: string): Promise<string> => probe.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop).trim(), name);
  // The inner (character) scope sets `accent` — it wins over the outer (global) scope's accent.
  await expect.poll(() => read("--color-primary"), { intervals: [20, 50, 100] }).toBe("oklch(0.5 0.1 40)");
  // `accent` also maps to --color-ring — the SAME inner value, not a stale outer one.
  await expect.poll(() => read("--color-ring"), { intervals: [20, 50, 100] }).toBe("oklch(0.5 0.1 40)");
  // The inner scope never touches `speaker` — it falls through to the outer (global) scope's value.
  await expect.poll(() => read("--color-speaker"), { intervals: [20, 50, 100] }).toBe("oklch(0.4 0.1 30)");
});

test("nested ThemeScope: a token neither scope sets resolves to the same app default as no scope at all", async ({ mount }) => {
  const cmp = await mount(
    <div>
      <ThemeScope tokens={{ accent: "oklch(0.3 0.1 20)" }}>
        <ThemeScope tokens={{}}>
          <span data-testid="probe">scoped</span>
        </ThemeScope>
      </ThemeScope>
      <span data-testid="control">unscoped</span>
    </div>,
  );
  const readSpeaker = (testId: string): Promise<string> =>
    cmp.getByTestId(testId).evaluate((el) => getComputedStyle(el).getPropertyValue("--color-speaker").trim());
  const [probeValue, controlValue] = await Promise.all([readSpeaker("probe"), readSpeaker("control")]);
  // Neither the inner nor the outer scope sets `speaker` — both the doubly-nested probe and a
  // completely unscoped sibling must resolve to the identical app-default value (not empty, not
  // diverged by the nesting).
  expect(probeValue).not.toBe("");
  expect(probeValue).toBe(controlValue);
});

test("nested ThemeScope: a hostile INNER override is dropped — the outer (safe) scope's value is inherited, never the raw hostile string", async ({
  mount,
}) => {
  const attack = ["url(//evil", ".test/x)"].join("");
  const cmp = await mount(
    <ThemeScope tokens={{ accent: "oklch(0.3 0.1 20)" }}>
      <ThemeScope tokens={{ accent: attack }}>
        <span data-testid="probe">x</span>
      </ThemeScope>
    </ThemeScope>,
  );
  const probe = cmp.getByTestId("probe");
  await expect.poll(async () => await probe.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-primary").trim())).toBe("oklch(0.3 0.1 20)"); // inherited from the outer scope — the clamp dropped it
  await expect.poll(async () => await probe.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-primary").trim())).not.toContain("url(");
});

// ── Anchored-float portal theming (D44 §12.1 · defect #1) ──────────────────────────────────────────
// The bug: a float (popover/menu/select/tooltip/autocomplete/combobox) portals to `<body>` by default,
// OUTSIDE the app-shell `<ThemeScope>`, so its popup painted Hearth defaults under a custom theme (the
// unthemed persona panel). The fix threads a THEMED portal root through `PortalContainerContext`, which
// every float seal reads as its Portal default (`usePortalContainer`). These mirror the shell's exact
// wiring: a themed node lives INSIDE `<ThemeScope>`, the context feeds its ref, and the OPEN popup —
// portaled into that node — must RESOLVE the override custom property instead of the `<body>` default.
// Rendered via React 19's bare `<Context value>` (not `.Provider`) so this is the real context path.
// The themed-scope story lives in `float-theming.fixtures` (a test file may not export a component).
// Hearth's static --color-primary (oklch(0.72 0.175 52)) is what a `<body>` portal would show instead.
const FLOAT_ACCENT = "oklch(0.42 0.17 40)"; // maps to --color-primary; decisive vs Hearth's 0.72 0.175 52

const readPrimary = (el: Element): string => getComputedStyle(el).getPropertyValue("--color-primary").trim();

test("an OPEN popover popup resolves the ThemeScope override (portals into the themed root, not <body>)", async ({ mount, page }) => {
  await mount(
    <ThemedFloatScope accent={FLOAT_ACCENT}>
      <Popover>
        <PopoverTrigger render={<button type="button">open</button>} />
        <PopoverPopup>
          <span data-testid="pop-probe">content</span>
        </PopoverPopup>
      </Popover>
    </ThemedFloatScope>,
  );
  // Open via CLICK (not defaultOpen) so the portal-root node is mounted first — matches real usage
  // (the shell mounts once; a popover opens on later interaction) rather than racing the ref on mount.
  await page.getByRole("button", { name: "open" }).click();
  // The popup is portaled (a document child), so query the PAGE, not the mount root.
  await expect(page.getByTestId("pop-probe")).toBeVisible();
  await expect.poll(async () => await page.getByTestId("pop-probe").evaluate(readPrimary)).toBe(FLOAT_ACCENT); // Hearth's static --color-primary would be oklch(0.72 0.175 52)
});

test("an OPEN select popup resolves the ThemeScope override", async ({ mount, page }) => {
  await mount(
    <ThemedFloatScope accent={FLOAT_ACCENT}>
      <Select
        aria-label="pick"
        items={[
          { label: "One", value: "one" },
          { label: "Two", value: "two" },
        ]}
      />
    </ThemedFloatScope>,
  );
  await page.getByRole("combobox", { name: "pick" }).click();
  const popup = page.locator('[data-slot="select-popup"]');
  await expect(popup).toBeVisible();
  await expect.poll(() => popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT);
});

test("an OPEN menu popup resolves the ThemeScope override", async ({ mount, page }) => {
  await mount(
    <ThemedFloatScope accent={FLOAT_ACCENT}>
      <Menu>
        <MenuTrigger render={<button type="button">actions</button>} />
        <MenuPopup>
          <MenuItem>Rename</MenuItem>
        </MenuPopup>
      </Menu>
    </ThemedFloatScope>,
  );
  await page.getByRole("button", { name: "actions" }).click();
  const popup = page.locator('[data-slot="menu-popup"]');
  await expect(popup).toBeVisible();
  await expect.poll(() => popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT);
});

// The MODAL family (Dialog/AlertDialog/Drawer) reads the same context default as the six floats — a
// feature-level dialog that passes NO explicit `container` (only ModalHost passes one) still portals
// into the themed root. Regression pin for the side-eye finding: New-character dialog painted Hearth
// chrome while Settings (ModalHost) was themed, same session. No `container` prop here — the seal
// defaults it from context.
test("an OPEN dialog popup (no explicit container) resolves the ThemeScope override", async ({ mount, page }) => {
  await mount(
    <ThemedFloatScope accent={FLOAT_ACCENT}>
      <Dialog>
        <DialogTrigger render={<button type="button">open dialog</button>} />
        <DialogPopup>
          <span data-testid="dialog-probe">content</span>
        </DialogPopup>
      </Dialog>
    </ThemedFloatScope>,
  );
  await page.getByRole("button", { name: "open dialog" }).click();
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();
  await expect.poll(() => popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT); // Hearth would be oklch(0.72 0.175 52)
});

// ── #236: the AMBIENT-BASE arm — an ink-only card override judged against the app theme it lands on ──
// The ST-imported library carries prose inks and NO background (a 113-116 byte scope payload). Pre-#236
// the §7a clamp failed open there, so a dark-authored ink painted raw on the Light seed's base at
// 2.11-2.43:1 — RENDERED proof, because the clamp emits relative-color syntax only the browser resolves.
const ST_DARK_INK = "oklch(0.72 0.16 174)"; // the measured ST ink; all three voices carry it
const LIGHT_SEED_BASE = "oklch(0.98 0.004 75)"; // SEED_THEME_VALUE_SETS.light --color-background
const DARK_SEED_BASE = "oklch(0.158 0.006 60)"; // the base @theme (Hearth) surface

// Framebuffer-honest contrast: the browser normalizes whatever it computed (rgb/oklch/relative-color)
// through a 1x1 canvas, then WCAG in-page — the same instrument the derived-foreground test above uses.
const renderedContrast = (el: Element): number => {
  const toRgb = (color: string): [number, number, number] => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r ?? 0, g ?? 0, b ?? 0];
  };
  const lum = (rgb: [number, number, number]): number => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const style = getComputedStyle(el);
  const la = lum(toRgb(style.color));
  const lb = lum(toRgb(style.backgroundColor));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

test("an INK-ONLY scope under a LIGHT ambient renders its three voices at AA — the #236 washout", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{}} ambientBackground={LIGHT_SEED_BASE}>
      <ThemeScope tokens={{ speaker: ST_DARK_INK, dialogueColor: ST_DARK_INK, narrationColor: ST_DARK_INK }}>
        <span data-testid="speaker" style={{ backgroundColor: LIGHT_SEED_BASE, color: "var(--color-speaker)" }}>
          Mira
        </span>
        <span data-testid="dialogue" style={{ backgroundColor: LIGHT_SEED_BASE, color: "var(--color-dialogue)" }}>
          "HE'S DOING THE THING!"
        </span>
        <span data-testid="narration" style={{ backgroundColor: LIGHT_SEED_BASE, color: "var(--color-narration)" }}>
          she leans in
        </span>
      </ThemeScope>
    </ThemeScope>,
  );
  // Pre-#236 every one of these measured 2.11:1 — pale teal ghosts on warm white.
  await Promise.all(
    ["speaker", "dialogue", "narration"].map((voice) =>
      expect.poll(() => cmp.getByTestId(voice).evaluate(renderedContrast), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(4.5),
    ),
  );
});

test("the ambient chain re-bases at a CARRIED palette: an ink-only scope inside a dark room stays dark-judged", async ({ mount }) => {
  // A carried-palette room under the LIGHT app theme is theme-immune (D144): the room's own background is
  // what its inks land on, so the ambient must stop at that scope, not leak past it. A dark ink that is
  // legible on the app's Light base would be a washout on the room's dark one, and vice versa.
  const cmp = await mount(
    <ThemeScope tokens={{}} ambientBackground={LIGHT_SEED_BASE}>
      <ThemeScope tokens={{ background: DARK_SEED_BASE }}>
        <ThemeScope tokens={{ narrationColor: "oklch(0.3 0.1 40)" }}>
          <span data-testid="in-room" style={{ backgroundColor: DARK_SEED_BASE, color: "var(--color-narration)" }}>
            she leans in
          </span>
        </ThemeScope>
      </ThemeScope>
    </ThemeScope>,
  );
  await expect.poll(() => cmp.getByTestId("in-room").evaluate(renderedContrast), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(4.5);
});

// ── #243: THE ELEVATION INGREDIENTS UNDER A CUSTOM LIGHT THEME (rendered — done ≠ emitted) ─────────
// A custom (non-seed) light theme used to inherit the base DARK ingredients: `--shadow-overlay`'s ring
// is `oklch(1 0 0 / 0.06)` white, which over a 0.98 base composites to a 1.00:1 ghost (#232 measured the
// same class at 1.29:1 on the Light seed before it got its own block). Only the browser resolves the
// emitted relative colour, so this is asserted on PAINTED pixels: the ring is painted over the base in a
// canvas and the composite is compared to the base itself.
const RING_PROBE_BASE = "oklch(0.98 0.004 75)";

/** The ring custom property, PAINTED over `base` in a 1x1 canvas → [composite luminance, base luminance]. */
const paintedRingVsBase = (el: Element, base: string): readonly [number, number] => {
  const ring = getComputedStyle(el).getPropertyValue("--color-shadow-hairline").trim();
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  const lumOfPixel = (): number => {
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const [lr, lg, lb] = [r ?? 0, g ?? 0, b ?? 0].map((v) => {
      const c = v / 255;
      return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1, 1);
  const baseLum = lumOfPixel();
  if (ring === "") {
    throw new Error("no --color-shadow-hairline in scope");
  }
  ctx.fillStyle = ring; // translucent — the canvas composites it over the base already painted
  ctx.fillRect(0, 0, 1, 1);
  return [lumOfPixel(), baseLum];
};

test("#243 a CUSTOM light theme paints a DARK elevation ring — not the base theme's white ghost", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ background: RING_PROBE_BASE }}>
      <span data-testid="ring-probe">card</span>
    </ThemeScope>,
  );
  const [composite, base] = await cmp.getByTestId("ring-probe").evaluate(paintedRingVsBase, RING_PROBE_BASE);
  // Pre-#243 the inherited white ring composited to the base's own luminance (1.00:1, invisible).
  expect(composite).toBeLessThan(base);
  expect((base + 0.05) / (composite + 0.05)).toBeGreaterThan(1.2);
});

test("#243 a CUSTOM dark theme's elevation ring stays light-from-above (the dark arm does not move)", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ background: DARK_SEED_BASE }}>
      <span data-testid="ring-probe-dark">card</span>
    </ThemeScope>,
  );
  const [composite, base] = await cmp.getByTestId("ring-probe-dark").evaluate(paintedRingVsBase, DARK_SEED_BASE);
  expect(composite).toBeGreaterThan(base);
});

// ── #682: THE MUTED-ON-CARD GRAPHIC UNDER A NEAR-WHITE CARRIED PALETTE (rendered) ──────────────────
// The additive ramp saturated every positive member at L 1.0 on a near-white base, so `--color-muted`
// and `--color-card` resolved to the SAME white and the arc meter's track (`text-muted`, painted as
// `stroke="currentColor"` over a `bg-card` panel) measured 1.0000:1 — a graphic that is not there.
// Only the browser resolves the emitted relative colour, so this is asserted on the PAINTED pair: the
// track's own computed `color` against the panel's computed `background-color`.
const NEAR_WHITE_BASE = "oklch(0.98 0.004 75)";

/** One arc circle's stroke vs the card it is painted on, WCAG-contrasted on framebuffer pixels.
 *
 *  IT COMPOSITES THE STROKE OVER THE CARD before measuring, and that is not a refinement — it is required
 *  for correctness the moment a track token carries ALPHA (`--color-border` is white at 8%). Reading such a
 *  colour straight through a canvas measures it over TRANSPARENT BLACK, which on a white card reports a
 *  near-black stroke and a spectacular fake ratio. Painting card-then-stroke is what the reader sees, and it
 *  is byte-identical for an opaque token, so the older `muted` numbers this file cites still hold. */
const arcPartVsCard = (panel: Element, slot: string): number => {
  const part = panel.querySelector(`[data-slot="meter-track"] ${slot}`);
  if (part === null) {
    throw new Error(`no arc meter ${slot} in the panel`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("no 2d context");
  }
  const lumOfPixel = (): number => {
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const [lr, lg, lb] = [r ?? 0, g ?? 0, b ?? 0].map((v) => {
      const c = v / 255;
      return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const card = getComputedStyle(panel).backgroundColor;
  ctx.fillStyle = card;
  ctx.fillRect(0, 0, 1, 1);
  const cardLum = lumOfPixel();
  ctx.fillStyle = getComputedStyle(part).color;
  ctx.fillRect(0, 0, 1, 1);
  const partLum = lumOfPixel();
  return (Math.max(partLum, cardLum) + 0.05) / (Math.min(partLum, cardLum) + 0.05);
};

// The two arcs, as selectors rather than wrapper functions: `evaluate` serializes ONLY the function it is
// handed, so a helper that closed over `arcPartVsCard` would arrive in the page as a ReferenceError.
/** The EMPTY track ring — the circle that is not the fill. */
const TRACK_ARC = "circle:not([data-slot])";
/** The VALUE arc — the part that carries the reading. */
const FILL_ARC = 'circle[data-slot="fill"]';

// #685 ANSWERED THE QUESTION #682 LEFT OPEN, and these two rows moved with it. #682's comment ended
// "whether a 1.13 neighbour step is enough for a GRAPHIC is a meter-side question (which token the track
// picks), not a derivation one" — it is not enough, and the meter now picks `border` instead of `muted`
// (charts/meter/variants.ts). So the DERIVATION fence that used to ride the rendered track (a
// `toBeCloseTo(1.1315)` on the dark arm) is re-homed onto the pair it was actually protecting —
// `--color-muted` against `--color-card` — where a derivation change still reds it and a meter-side token
// swap does not. The RENDERED rows now floor the track at the separation the new token buys.
//
// The number the finding asked for (3:1, WCAG 1.4.11) is deliberately NOT the floor here, and the meter
// file states why: the only token that reaches it on both polarities is an INK, which on the light arm
// paints the EMPTY track at 11.5:1 beside a 2.58:1 value arc.
const MUTED_STEP_DARK = 1.1315;

/** Two custom properties, WCAG-contrasted on framebuffer pixels — the DERIVATION pair, no component. */
const tokenPairContrast = (el: Element, names: readonly [string, string]): number => {
  const toRgb = (color: string): [number, number, number] => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r ?? 0, g ?? 0, b ?? 0];
  };
  const lum = (rgb: [number, number, number]): number => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const style = getComputedStyle(el);
  const [first, second] = names;
  const la = lum(toRgb(style.getPropertyValue(first).trim()));
  const lb = lum(toRgb(style.getPropertyValue(second).trim()));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

test("#682 the DARK arm's muted/card derivation does not move (the polarity that was never broken)", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ background: DARK_SEED_BASE }}>
      <span data-testid="ramp-probe">x</span>
    </ThemeScope>,
  );
  // Hearth's derived pair as this browser RESOLVES it (1.1315; node's own oklch math says 1.1356 — the
  // gap is 8-bit channel quantization, not a disagreement). A fence, not a defect proof: it passes
  // pre-fix too, and its job is to red if the dark arm ever moves a digit.
  await expect
    .poll(async () => await cmp.getByTestId("ramp-probe").evaluate(tokenPairContrast, ["--color-muted", "--color-card"] as const))
    .toBeCloseTo(MUTED_STEP_DARK, 3);
});

// The RENDERED track floor, both polarities. `toBeGreaterThan(MUTED_STEP_DARK * 1.15)` is spelled against
// the ramp step rather than a bare number so the row states its own claim: the track is meaningfully
// STRONGER than one neighbouring ramp step, which is exactly what `muted` could never be.
const TRACK_FLOOR = MUTED_STEP_DARK * 1.15;
const TRACK_ARMS = [
  { label: "near-white carried palette", base: NEAR_WHITE_BASE, testId: "card-panel" },
  { label: "the dark seed", base: DARK_SEED_BASE, testId: "card-panel-dark" },
] as const;

for (const { label, base, testId } of TRACK_ARMS) {
  test(`#685 an arc meter's TRACK reads as a graphic on a card under ${label}`, async ({ mount }) => {
    const cmp = await mount(
      <ThemeScope tokens={{ background: base }}>
        <div data-testid={testId} style={{ backgroundColor: "var(--color-card)" }}>
          <Meter kind="arc" label="Stamina" value={40} />
        </div>
      </ThemeScope>,
    );
    // Pre-#682 the near-white arm measured 1.0000:1 (an arc that is not there); after #682 both arms sat at
    // the honest ~1.14 ramp step, which is what #685 found still too faint for a 6-unit stroke.
    await expect.poll(() => cmp.getByTestId(testId).evaluate(arcPartVsCard, TRACK_ARC), { intervals: [20, 50, 100] }).toBeGreaterThan(TRACK_FLOOR);
  });

  test(`#685 the track never outshouts the FILL under ${label} — the value keeps the loudest voice`, async ({ mount }) => {
    // The invariant that decided the token (see charts/meter/variants.ts): a stronger track is an improvement
    // only while the EMPTY part of the gauge stays quieter than the part carrying the reading. This is the
    // row that would red if a later lane "just" raised the track to an ink to satisfy 1.4.11.
    const cmp = await mount(
      <ThemeScope tokens={{ background: base }}>
        <div data-testid={testId} style={{ backgroundColor: "var(--color-card)" }}>
          <Meter kind="arc" label="Stamina" value={40} />
        </div>
      </ThemeScope>,
    );
    const panel = cmp.getByTestId(testId);
    const track = await panel.evaluate(arcPartVsCard, TRACK_ARC);
    const fill = await panel.evaluate(arcPartVsCard, FILL_ARC);
    expect(fill, `fill ${String(fill)} must stay louder than track ${String(track)}`).toBeGreaterThan(track);
  });
}

// ── #692: THE VALUE ARC ITSELF, under a carried palette that picks no accent ───────────────────────
// The two #685 arms above mount with NO ambient accent, which is the pre-#692 shell: the scope inherits
// the CT page's own `--color-primary` (Hearth's `oklch(0.72 0.175 52)`) and paints the meter's FILL with
// it. Over the near-white base's derived card that measures 2.5858:1 — the part of the gauge that carries
// the reading, under WCAG 1.4.11's 3:1, on the polarity where the room is brightest.
//
// It is NOT a ramp light-arm defect and there was no seed to promote: the shipped Light seed's own primary
// measures 5.07:1 against the same card. `--color-primary` is simply the one PICKED token no base derives,
// so a room that carries a light background inherits a DARK-authored accent — the #243/#682 polarity
// divorce, one token over. The shell threads the active theme's accent as `ambientAccent`, and the clamp
// judges it against the card exactly as #236 judges an ink against the base.
//
// Measured on FRAMEBUFFER pixels through the same composited kernel as the track rows (`arcPartVsCard`
// paints card-then-part, so an alpha-carrying token is measured over its real backing, not over
// transparent black).
/** WCAG 1.4.11's floor for a non-text graphical object — what the VALUE arc owes the card it is drawn on. */
const GRAPHIC_CONTRAST = 3;
/** Hearth's accent — what a carried room inherits when the app theme is the base palette. */
const AMBIENT_DARK_ACCENT = "oklch(0.72 0.175 52)";

for (const { label, base, testId } of TRACK_ARMS) {
  test(`#692 the arc meter's FILL clears 1.4.11 under ${label} when the room inherits a dark-authored accent`, async ({ mount }) => {
    const cmp = await mount(
      <ThemeScope tokens={{ background: base }} ambientAccent={AMBIENT_DARK_ACCENT}>
        <div data-testid={testId} style={{ backgroundColor: "var(--color-card)" }}>
          <Meter kind="arc" label="Stamina" value={40} />
        </div>
      </ThemeScope>,
    );
    // Pre-#692 the near-white arm measured 2.58:1 here (the dark arm's 6.83 was never the defect, and the
    // clamp leaves it byte-identical — this row is that arm's fence).
    await expect.poll(() => cmp.getByTestId(testId).evaluate(arcPartVsCard, FILL_ARC), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
  });

  test(`#692 the corrected fill still outshouts the track under ${label} — the #685 invariant survives`, async ({ mount }) => {
    // Raising the fill must not invert the gauge's voice: the empty part stays quieter than the reading.
    const cmp = await mount(
      <ThemeScope tokens={{ background: base }} ambientAccent={AMBIENT_DARK_ACCENT}>
        <div data-testid={testId} style={{ backgroundColor: "var(--color-card)" }}>
          <Meter kind="arc" label="Stamina" value={40} />
        </div>
      </ThemeScope>,
    );
    const panel = cmp.getByTestId(testId);
    const track = await panel.evaluate(arcPartVsCard, TRACK_ARC);
    const fill = await panel.evaluate(arcPartVsCard, FILL_ARC);
    expect(fill, `fill ${String(fill)} must stay louder than track ${String(track)}`).toBeGreaterThan(track);
  });
}

test("#692 an ambient accent that ALREADY clears is not touched — the fill renders the author's colour", async ({ mount }) => {
  // The byte-identical pass-through, asserted where it is observable: the Light seed's own accent in a
  // near-white room (5.07:1) must reach the DOM unchanged, not as a re-derived relative colour.
  const seedAccent = "oklch(0.55 0.16 50)";
  const cmp = await mount(
    <ThemeScope tokens={{ background: NEAR_WHITE_BASE }} ambientAccent={seedAccent}>
      <span data-testid="accent-probe">x</span>
    </ThemeScope>,
  );
  await expect.poll(async () => await cmp.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--color-primary"))).toBe("");
});

test("a provider-less ink-only scope FAILS OPEN, rendering the author's ink byte-identically", async ({ mount }) => {
  // Nothing named the surface (a preview, a CT story, any mount outside the shell) ⇒ the pre-#236 rule
  // stands: never guess a polarity. The author's value reaches the DOM untouched.
  const cmp = await mount(
    <ThemeScope tokens={{ narrationColor: ST_DARK_INK }}>
      <span data-testid="loose">she leans in</span>
    </ThemeScope>,
  );
  await expect
    .poll(async () => await cmp.getByTestId("loose").evaluate((el) => getComputedStyle(el).getPropertyValue("--color-narration").trim()))
    .toBe(ST_DARK_INK);
});
