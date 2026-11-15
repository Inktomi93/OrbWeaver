// @subject packages/ui/src/primitives/list-row/list-row.tsx
// A disclosure row opens and shuts its panel by a press, Enter and Space with focus kept on its body, names the panel it controls,
// never toggles on a press on its actions, announces its detail as part of its description, and paints its set-state rail.
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { DisclosureRowStory } from "./_disclosure-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_disclosure-stories/DisclosureRowStory";
const PROPS = { title: "Scenario", detail: "A storm over the harbour", panel: "The editor" } as const;

test("the body toggles its panel by a press, Enter and Space, and keeps focus", async ({ mount, page }) => {
  await mount<typeof DisclosureRowStory>(STORY, PROPS);
  const body = page.getByRole("button", { name: PROPS.title, exact: true });
  const panel = page.getByText(PROPS.panel, { exact: true });
  await expect(body).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);

  await body.click();
  await expect(body).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  const controls = await body.getAttribute("aria-controls");
  // The body names the panel it opens: the id resolves to the node that holds the panel's content.
  expect(controls ?? "").not.toBe("");
  await expect(page.locator(`[id="${controls ?? ""}"]`)).toContainText(PROPS.panel);
  await expect(body).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(body).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeFocused();
  await page.keyboard.press("Space");
  await expect(body).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeFocused();
});

test("a press on the row's actions moves its control and leaves the panel shut", async ({ mount, page }) => {
  await mount<typeof DisclosureRowStory>(STORY, PROPS);
  const body = page.getByRole("button", { name: PROPS.title, exact: true });
  const control = page.getByRole("switch", { name: `${PROPS.title} on`, exact: true });
  await control.click();
  // Positive control: the press landed on the switch.
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(body).toHaveAttribute("aria-expanded", "false");
});

test("the detail is part of the row's description, never its name", async ({ mount, page }) => {
  await mount<typeof DisclosureRowStory>(STORY, PROPS);
  const body = page.getByRole("button", { name: PROPS.title, exact: true });
  await expect(body).toHaveAccessibleDescription(PROPS.detail);
});

test("a row with the rail paints its leading edge in the primary ink, and a row without it paints none", async ({ mount, page }) => {
  await mount<typeof DisclosureRowStory>(STORY, PROPS);
  const roots = page.locator('[data-slot="list-row-root"]');
  await expect(roots).toHaveCount(2);
  const edge = (index: number): Promise<{ readonly width: string; readonly color: string; readonly primary: string }> =>
    roots.nth(index).evaluate((node, ink) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${ink})`;
      node.append(probe);
      const primary = getComputedStyle(probe).color;
      probe.remove();
      const style = getComputedStyle(node);
      return { width: style.borderInlineStartWidth, color: style.borderInlineStartColor, primary };
    }, TOKENS["color.primary"].cssVar);
  const set = await edge(0);
  const unset = await edge(1);
  expect(set.width).toBe(TOKENS["border-width.rule"].value);
  expect(set.color).toBe(set.primary);
  expect(unset.width).toBe("0px");
});
