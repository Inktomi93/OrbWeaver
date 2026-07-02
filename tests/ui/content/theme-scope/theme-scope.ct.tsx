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
