import { ThemeScope } from "@orb/ui/content";
import { expect, test } from "@playwright/experimental-ct-react";

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
