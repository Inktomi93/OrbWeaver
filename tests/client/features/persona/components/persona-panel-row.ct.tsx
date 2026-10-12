// CT: `<PersonaPanelRow>` — one row of Settings → Personas, the MANAGE surface (item 885). The row body has
// ONE verb: it expands the editor. It never switches who you play and carries no chat state. Its trailing
// cluster is the favorite heart, the crown and the chevron; at a coarse pointer the faint toggles stand down
// into a ⋯ that holds only Favorite and Set/Clear default. Duplicate, Export and Delete live in the editor.

// @orb-waive-file no-test-fabrication(HTMLElement): baselined when the gate widened to value casts; burn-down item 906.
import { rowActionsName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import { PersonaPanelRowDenseStory, PersonaPanelRowStory } from "../_ct-stories.tsx";

const DEFAULT_BUTTON = /is your default — press to clear$/u;

// ── Geometry: the name is the row's one shrinker ────────────────────────────────────────────────────

test("the name column keeps its share of the dense 358px row", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  const [nameWidth, rowWidth] = await name.evaluate((el: HTMLElement): readonly [number, number] => [
    el.getBoundingClientRect().width,
    (el.parentElement as HTMLElement).getBoundingClientRect().width,
  ]);
  expect(nameWidth / rowWidth).toBeGreaterThan(0.35);
});

test("the dense row renders the persona's whole name and subtitle — neither is clipped", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  await expect
    .poll(
      async () =>
        await name.evaluate((el: HTMLElement): readonly string[] =>
          Array.from(el.querySelectorAll<HTMLElement>(".truncate"))
            .filter((node) => node.scrollWidth - node.clientWidth > 1)
            .map((node) => node.textContent ?? ""),
        ),
    )
    .toEqual([]);
});

test("at 320px the persona's whole name still renders — no ellipsis on an 8-char name", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory width={320} />);
  const nameText = component.getByText("Traveler", { exact: true });
  await expect(nameText).toBeVisible();
  await expect.poll(async () => await nameText.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
});

// ── One verb on the row body ────────────────────────────────────────────────────────────────────────

test("the row body is a native button that expands the editor — never a switch", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  const body = component.locator('[data-slot="persona-row-expand"]');
  await expect(body).toHaveJSProperty("tagName", "BUTTON");
  await expect(body).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("button", { name: /^Switch to /u })).toHaveCount(0);
  await expect(component.locator("[aria-current]")).toHaveCount(0);
  await body.dispatchEvent("click");
  await expect(component.getByTestId("fired")).toHaveText("expand");
});

test("the row carries no chat state and no inline rename", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  await expect(component.getByRole("img", { name: "Playing as" })).toHaveCount(0);
  await expect(component.getByRole("img", { name: "Card's persona in this chat" })).toHaveCount(0);
  await expect(component.getByRole("textbox")).toHaveCount(0);
  await expect(component.getByRole("button", { name: /^Rename /u })).toHaveCount(0);
});

test("the chevron fires onToggleExpand, and both of its arms name the row", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details for Nova", exact: true }).click();
  await expect(component.getByTestId("fired")).toHaveText("expand");
  await expect(component.getByRole("button", { name: "Hide details for Nova", exact: true })).toBeVisible();
});

// ── The crown and the heart ─────────────────────────────────────────────────────────────────────────

test("the default row wears the pressed crown; a favorited row states 'favorited' once, by its verb", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  await expect(component.getByRole("button", { name: DEFAULT_BUTTON, pressed: true })).toBeVisible();
  await expect(component.locator("svg.lucide-crown:visible")).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Unfavorite Traveler", exact: true })).toBeAttached();
  await expect(component.getByRole("img", { name: "Favorited" })).toHaveCount(0);
});

test("the faint crown on a non-default row fires onSetDefault only", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Make Nova your default", exact: true }).dispatchEvent("click");
  await expect(component.getByTestId("fired")).toHaveText("default");
});

test("a fine pointer has no row ⋯", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  await expect(component.getByRole("button", { name: rowActionsName("Traveler") })).toBeHidden();
});

// ── The editor's footer: Duplicate, Export, Delete ──────────────────────────────────────────────────

test("the expanded editor's footer holds Duplicate, Export and Delete; Delete confirms, then fires onDelete", async ({ mount, page }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details for Nova", exact: true }).click();
  // The editor reveals under a height animation; wait until nothing in the panel is clipped.
  const panel = component.locator('[data-slot="collapsible-panel"]');
  await expect(panel).toHaveAttribute("data-open", "");
  await expect.poll(() => panel.evaluate((el) => el.clientHeight === el.scrollHeight && el.clientHeight > 0)).toBe(true);

  const footer = component.locator('[data-slot="persona-editor-footer"]');
  await expect(footer.getByRole("button", { name: "Duplicate", exact: true })).toBeVisible();
  await expect(footer.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await footer.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this persona?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(component.getByTestId("fired")).toHaveText("delete");
});

// ── The coarse collapse ─────────────────────────────────────────────────────────────────────────────

const PHONE_WIDTHS = [320, 375] as const;

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true });

  for (const width of PHONE_WIDTHS) {
    test(`@${width}: the default and favorited states stay visible as marks, and the name is not clipped`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<PersonaPanelRowDenseStory width={width} />);
      await expect(component.getByRole("img", { name: "Your default persona" })).toBeVisible();
      await expect(component.getByRole("img", { name: "Favorited" })).toBeVisible();
      const nameText = component.getByText("Traveler", { exact: true });
      await expect.poll(() => nameText.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    });

    test(`@${width}: the ⋯ carries only Favorite and Set/Clear default, and the inline toggles stand down`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(<PersonaPanelRowDenseStory width={width} />);
      await expect(component.getByRole("button", { name: /Unfavorite/u })).toHaveCount(0);
      await expect(component.getByRole("button", { name: DEFAULT_BUTTON })).toHaveCount(0);
      await component.getByRole("button", { name: rowActionsName("Traveler") }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem")).toHaveText(["Unfavorite", "Clear default"]);
    });
  }
});
