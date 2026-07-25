// CT: the list-row seal — the slot-based entity row (leading/title/subtitle/actions). The
// load-bearing assertion is the a11y contract: a clickable row is ONE role="button" element and
// its trailing actions are SEPARATE tab stops OUTSIDE that element, never nested inside it.

import { ListRow } from "@orb/ui/list-row";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("clickable body is a NATIVE <button> element (side-eye item 13), not a role='button' div", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} title="Elara" />);
  const body = page.locator('[data-slot="list-row-body"]');
  await expect(body).toHaveJSProperty("tagName", "BUTTON");
  // A native button needs `type="button"` so it never submits an enclosing form.
  await expect(body).toHaveAttribute("type", "button");
});

test("clickable row exposes button role and activates via Enter/Space", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "0");
  await row.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  await expect.poll(() => clicks.length, { intervals: [20, 50, 100] }).toBe(2);
});

test("non-clickable row is a static <div> body with no button role", async ({ mount, page }) => {
  await mount(<ListRow title="Elara" />);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator('[data-slot="list-row-body"]')).toHaveJSProperty("tagName", "DIV");
});

test("trailing action is a separate tab stop, not nested in the row's accessible name", async ({ mount, page }) => {
  const rowClicks: string[] = [];
  const actionClicks: string[] = [];
  await mount(
    <ListRow
      actions={
        <button
          onClick={(): void => {
            actionClicks.push("hit");
          }}
          type="button"
        >
          Edit
        </button>
      }
      clickable={true}
      onClick={(): void => {
        rowClicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  const action = page.getByRole("button", { name: "Edit" });

  // The row's accessible name excludes the action (proves the action is not nested inside it).
  await expect(row).toHaveAccessibleName("Elara");

  // Tab order proves the action is a SIBLING tab stop, not content inside the row button.
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();

  // Clicking the action does not also fire the row's onClick (they're disjoint elements).
  await action.click();
  expect(actionClicks.length).toBe(1);
  expect(rowClicks.length).toBe(0);
});

// Finding #1 (2026-07-25 a11y sweep): the clickable row's accessible NAME is the TITLE ALONE — the
// subtitle no longer runs into the name ("Mara mara-soul-check" → "Mara"). The subtitle stays reachable
// for SR users via aria-describedby, so it's a description, not name pollution. Name-from-content used to
// concatenate every descendant span; aria-label + an aria-hidden title span makes the name authoritative.
test("clickable row's accessible name is the TITLE ALONE — subtitle rides aria-describedby, not the name", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="mara-soul-check" title="Mara" />);
  const row = page.getByRole("button");
  // The name is the title with the subtitle NOWHERE in it.
  await expect(row).toHaveAccessibleName("Mara");
  // The subtitle survives as the row's DESCRIPTION (SR announces it after the name).
  await expect(row).toHaveAccessibleDescription("mara-soul-check");
  // The visible subtitle text is still on screen.
  await expect(page.getByText("mara-soul-check")).toBeVisible();
});

// The relative-time meta now rides the `meta` slot INSIDE the row's accessible content (part of the
// description), not stranded in the `actions` sibling outside the accessible name (the old chats-row bug
// where "18m ago" was invisible to a SR walking the row button).
test("meta (timestamp) is inside the accessible content — part of the description, kept for SR users", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} meta="18m ago" subtitle="You, Mara, Niko" title="Group UX review" />);
  const row = page.getByRole("button");
  await expect(row).toHaveAccessibleName("Group UX review");
  // Both the subtitle and the meta land in the description (space-joined via aria-describedby).
  await expect(row).toHaveAccessibleDescription("You, Mara, Niko 18m ago");
  // The meta renders inside the row body, not as an actions sibling.
  await expect(page.locator('[data-slot="list-row-body"] [data-slot="list-row-meta"]')).toHaveText("18m ago");
});

test("selected reads via a 2px left ember bar (rides --color-primary) + aria-current", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} selected={true} title="Elara" />);
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("aria-current", "true");
  // north-star §4 N2: the flat --color-accent fill is replaced by a 2px left bar + 10% primary tint,
  // both riding --color-primary so a custom theme retints selection.
  await expect(row).toHaveCSS("border-left-width", "2px");
  await expect(row).toHaveCSS("border-left-color", TOKENS["color.primary"].value);
});

test("disabled removes the row from tab order and marks aria-disabled", async ({ mount, page }) => {
  const clicks: string[] = [];
  await mount(
    <ListRow
      clickable={true}
      disabled={true}
      onClick={(): void => {
        clicks.push("hit");
      }}
      title="Elara"
    />,
  );
  const row = page.getByRole("button", { name: "Elara" });
  await expect(row).toHaveAttribute("tabindex", "-1");
  await expect(row).toHaveAttribute("aria-disabled", "true");
  // Programmatic focus still works with tabindex=-1; Enter should be a no-op — disabled drops the
  // onClick handler entirely rather than relying on a pointer-events CSS trick to swallow clicks.
  await row.focus();
  await page.keyboard.press("Enter");
  expect(clicks.length).toBe(0);
});

test("title and subtitle truncate with the full text recoverable via the title attribute", async ({ mount, page }) => {
  const longTitle = "A".repeat(200);
  const longSubtitle = "B".repeat(200);
  await mount(<ListRow subtitle={longSubtitle} title={longTitle} />);
  await expect(page.getByText(longTitle)).toHaveAttribute("title", longTitle);
  await expect(page.getByText(longSubtitle)).toHaveAttribute("title", longSubtitle);
});

test("subtitleReveal display-swaps the subtitle on :focus-within (in the content column, not actions)", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} subtitle="the pitch" subtitleReveal="handle · 42" title="Elara" />);
  const subtitle = page.locator('[data-slot="list-row-subtitle"]');
  const reveal = page.locator('[data-slot="list-row-subtitle-reveal"]');
  // Rest: the subtitle shows, the reveal is display:none (zero layout — no rest-state cost).
  await expect(subtitle).toBeVisible();
  await expect(reveal).toBeHidden();
  // Focusing the body (:focus-within) swaps them on the SAME content line — no layout shift, no `actions`
  // contention. The reveal is in the content column, not the trailing slot.
  await page.locator('[data-slot="list-row-body"]').focus();
  await expect(reveal).toBeVisible();
  await expect(subtitle).toBeHidden();
  await expect(reveal).toHaveAttribute("title", "handle · 42");
});

// Density rides the control-height min-heights (compact = min-h-control-sm, default = min-h-control-md),
// which are pointer-CONDITIONAL (D62 P1): at coarse they are 44/48 (the min-h dominates and the rows
// differ); at fine they narrow to 28/34, both BELOW this row's ~35px content height, so the min-h is
// inert and the two collapse to the same content-driven height. The density RELATIONSHIP is therefore
// asserted under a coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx precedent).
test.describe("coarse pointer — density heights", () => {
  test.use({ hasTouch: true });

  test("compact density is shorter than the default density", async ({ mount, page }) => {
    const compact = await mount(<ListRow density="compact" title="Elara" />);
    const compactHeight = await page.locator('[data-slot="list-row-body"]').evaluate((el) => el.getBoundingClientRect().height);
    await compact.unmount();
    const defaultRow = await mount(<ListRow title="Elara" />);
    const defaultHeight = await page.locator('[data-slot="list-row-body"]').evaluate((el) => el.getBoundingClientRect().height);
    await defaultRow.unmount();
    expect(compactHeight).toBeLessThan(defaultHeight);
  });
});

test("renders the leading slot", async ({ mount, page }) => {
  await mount(<ListRow leading={<span data-testid="glyph">*</span>} title="Elara" />);
  await expect(page.getByTestId("glyph")).toBeVisible();
});

// Regression guard: the leading slot (avatar initials / icon) is DECORATIVE — it must NOT leak into
// the row's accessible name. Before the `aria-hidden` on the leading wrapper, a fallback avatar made a
// chat row announce as "UC Untitled chat owner, Niko" instead of "Untitled chat, owner Niko". The
// leading glyph is still VISIBLE (in the DOM) but hidden from the accessibility tree, so `getByRole`
// (Playwright, screen readers, agent nav) resolves the row by its title alone.
test("leading slot is aria-hidden — its text never leaks into the row's accessible name", async ({ mount, page }) => {
  await mount(<ListRow clickable={true} leading={<span>ZZ</span>} title="Elara" />);
  await expect(page.getByText("ZZ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Elara", exact: true })).toBeVisible();
  await expect(page.getByRole("button")).toHaveAccessibleName("Elara");
});
