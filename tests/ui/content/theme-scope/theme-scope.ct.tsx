import { Dialog, DialogPopup, DialogTrigger } from "@orb/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Select } from "@orb/ui/select";
import { ThemeScope } from "@orb/ui/theme-scope";
import { expect, test } from "@playwright/experimental-ct-react";
import { ThemedFloatScope } from "./float-theming.fixtures";

test("a legal override lands as a scoped custom property", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ userBubble: { bg: "oklch(0.3 0.1 20)" } }}>
      <span>scoped</span>
    </ThemeScope>,
  );
  const value = await cmp.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--color-user-bubble"),
  );
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
  const inline = await cmp.evaluate((el) =>
    (el as HTMLElement).style.getPropertyValue("--color-primary"),
  );
  expect(inline).toBe("");
});

// ── Rendered-contrast (done ≠ rendered) ────────────────────────────────────────────────────────────
// The clamp emits relative-color-syntax (`oklch(from <base> ...)`); a Node test can only assert the
// STRING. This proves the browser RESOLVES those strings to real colors that clear WCAG AA — the exact
// light-theme case (background 0.98) that made the static accent-foreground / primary-foreground
// illegible before #16 derived them. Colors are normalized through a 1×1 canvas (the browser converts
// whatever it computed — rgb/oklch — to pixels), then WCAG-contrasted in-page.
test("derived accent-/primary-foreground RESOLVE to AA-legible colors under a light theme", async ({
  mount,
}) => {
  const cmp = await mount(
    <ThemeScope tokens={{ background: "oklch(0.98 0.004 75)", accent: "oklch(0.55 0.16 50)" }}>
      <span
        data-testid="accent"
        style={{ backgroundColor: "var(--color-accent)", color: "var(--color-accent-foreground)" }}
      >
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

test("chatStyle/density become data-attributes, not custom properties", async ({ mount }) => {
  const cmp = await mount(
    <ThemeScope tokens={{ chatStyle: "flat", density: "compact" }}>
      <span>x</span>
    </ThemeScope>,
  );
  await expect(cmp).toHaveAttribute("data-chat-style", "flat");
  await expect(cmp).toHaveAttribute("data-density", "compact");
});

// ── Nested-scope cascade (character > global > default) ────────────────────────────────────────
// `<ThemeScope>` has no bespoke resolution logic — the "character overrides win over the global
// theme, which wins over the app default" guarantee is PURE CSS custom-property inheritance: an
// inner scope's inline `style` shadows an outer scope's only for the properties it actually sets;
// anything it leaves unset falls through the DOM to the outer scope, then to the app default. These
// tests assert that computed outcome directly (not the inline style, per the "hostile value" test
// above — inheritance can only be observed at computed-style time).

test("nested ThemeScope: inner wins where it sets a token, falls through to outer where it doesn't", async ({
  mount,
}) => {
  const cmp = await mount(
    <ThemeScope tokens={{ accent: "oklch(0.3 0.1 20)", speaker: "oklch(0.4 0.1 30)" }}>
      <ThemeScope tokens={{ accent: "oklch(0.5 0.1 40)" }}>
        <span data-testid="probe">x</span>
      </ThemeScope>
    </ThemeScope>,
  );
  const probe = cmp.getByTestId("probe");
  const read = (name: string): Promise<string> =>
    probe.evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop).trim(), name);
  // The inner (character) scope sets `accent` — it wins over the outer (global) scope's accent.
  await expect.poll(() => read("--color-primary")).toBe("oklch(0.5 0.1 40)");
  // `accent` also maps to --color-ring — the SAME inner value, not a stale outer one.
  await expect.poll(() => read("--color-ring")).toBe("oklch(0.5 0.1 40)");
  // The inner scope never touches `speaker` — it falls through to the outer (global) scope's value.
  await expect.poll(() => read("--color-speaker")).toBe("oklch(0.4 0.1 30)");
});

test("nested ThemeScope: a token neither scope sets resolves to the same app default as no scope at all", async ({
  mount,
}) => {
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
    cmp
      .getByTestId(testId)
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--color-speaker").trim());
  const [probeValue, controlValue] = await Promise.all([
    readSpeaker("probe"),
    readSpeaker("control"),
  ]);
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
  const computed = await probe.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--color-primary").trim(),
  );
  expect(computed).toBe("oklch(0.3 0.1 20)"); // inherited from the outer scope — the clamp dropped it
  expect(computed).not.toContain("url(");
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

const readPrimary = (el: Element): string =>
  getComputedStyle(el).getPropertyValue("--color-primary").trim();

test("an OPEN popover popup resolves the ThemeScope override (portals into the themed root, not <body>)", async ({
  mount,
  page,
}) => {
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
  const value = await page.getByTestId("pop-probe").evaluate(readPrimary);
  expect(value).toBe(FLOAT_ACCENT); // Hearth's static --color-primary would be oklch(0.72 0.175 52)
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
  expect(await popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT);
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
  expect(await popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT);
});

// The MODAL family (Dialog/AlertDialog/Drawer) reads the same context default as the six floats — a
// feature-level dialog that passes NO explicit `container` (only ModalHost passes one) still portals
// into the themed root. Regression pin for the side-eye finding: New-character dialog painted Hearth
// chrome while Settings (ModalHost) was themed, same session. No `container` prop here — the seal
// defaults it from context.
test("an OPEN dialog popup (no explicit container) resolves the ThemeScope override", async ({
  mount,
  page,
}) => {
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
  expect(await popup.evaluate(readPrimary)).toBe(FLOAT_ACCENT); // Hearth would be oklch(0.72 0.175 52)
});
