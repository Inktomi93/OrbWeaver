// CT: `<PersonaPanelRow>` — the side-eye item-13 stretched-overlay rework. Proves the "set current" target
// is a real native `<button>` (NOT a role="button" div wrapping interactive controls) and that the row's
// avatar/name/chevron controls are DISJOINT siblings: clicking a control fires ONLY its own action, never
// also "set current" (the stopPropagation crutch is gone because the elements no longer nest).

import { expect, test } from "@playwright/experimental-ct-react";
import { PersonaPanelRowDenseStory, PersonaPanelRowStory } from "../_ct-stories.tsx";

// ── The shared-cell width fence (side-eye 2026-08-06 P1) ────────────────────────────────────────────
// The row's two trailing clusters — the rest-visible MARKERS and the hover-revealed ACTIONS — are never
// both painted, but as flow siblings they both RESERVED width, so a 358px rail row spent 188px on a strip
// that shows at most 114px of content and left the name column 58px. They now share one `<Layer>` cell.
//
// MEASURED, not asserted-by-class: the fix is a geometry claim, so the fence reads geometry. It shoots the
// dense row at the PRODUCTION 358px width (the narrowest real host) with every marker lit.

test("the name column keeps its share of the row — the markers and actions share one cell", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  const [nameWidth, rowWidth] = await name.evaluate((el: HTMLElement): readonly [number, number] => [
    el.getBoundingClientRect().width,
    (el.parentElement as HTMLElement).getBoundingClientRect().width,
  ]);
  // MEASURED: 58/358 ≈ 0.16 before, 140/358 ≈ 0.39 after. The floor is a FRACTION of the row so it survives
  // a token retune of the row's padding or the avatar box, and it is set BELOW the measured value rather
  // than at it — this fences the collapse, it does not pin the pixel.
  expect(nameWidth / rowWidth).toBeGreaterThan(0.35);
});

// The ratio above is the mechanism; THIS is the symptom. The shipped row rendered the seed persona as
// "Tra…" over "Your def…" — two truncations in a 358px panel with 188px reserved for a strip showing 114px.
test("the dense row renders the persona's whole name and subtitle — neither is clipped", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  // `truncate` clips by overflow, so the tell is scrollWidth > clientWidth on the elements that carry the
  // text — not the string, which is present in the DOM either way (which is exactly why a text assertion
  // would have passed against the defect).
  const clipped = await name.evaluate((el: HTMLElement): readonly string[] =>
    Array.from(el.querySelectorAll<HTMLElement>(".truncate"))
      .filter((node) => node.scrollWidth - node.clientWidth > 1)
      .map((node) => node.textContent ?? ""),
  );
  expect(clipped).toEqual([]);
});

test("both trailing clusters occupy the same cell — the strip is as wide as the WIDER one, not their sum", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  // The two cluster Rows are the Layer's children; a shared cell means identical left edges (they are
  // placed into ONE grid area). Side-by-side siblings — the defect — cannot produce that.
  const overlaid = await name.evaluate((el: HTMLElement): boolean => {
    const layer: HTMLElement | undefined = Array.from((el.parentElement as HTMLElement).children).find(
      (child): boolean => getComputedStyle(child as HTMLElement).display === "grid",
    ) as HTMLElement | undefined;
    if (layer === undefined || layer.children.length !== 2) {
      return false;
    }
    const [markers, actions] = Array.from(layer.children).map((child) => child.getBoundingClientRect());
    return markers !== undefined && actions !== undefined && Math.abs(markers.left - actions.left) < 1 && Math.abs(markers.right - actions.right) < 1;
  });
  expect(overlaid).toBe(true);
});

// The a11y half of the same finding: at rest the row announced "Favorited" (the marker) AND "Unfavorite"
// (the always-mounted reveal button) — one fact, twice. The marker is now ornament; the verb is the one
// statement. The DEFAULT crown keeps its name, because its verb disappears exactly when the state is true.
test("a favorited row states 'favorited' ONCE; the default crown keeps its own name", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  await expect(component.getByRole("button", { name: "Unfavorite" })).toBeAttached();
  await expect(component.getByRole("img", { name: "Favorited" })).toHaveCount(0);
  await expect(component.getByRole("img", { name: "Your default" })).toBeVisible();
});

test("the 'set current' target is a real native <button>, not a role=button div", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  const setCurrent = component.getByRole("button", { name: "Switch to Nova" });
  await expect(setCurrent).toHaveJSProperty("tagName", "BUTTON");
});

test("the stretched overlay is wired to onSetCurrent", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  // By design the name control fills the row's middle (name-click = rename); the overlay's live target is
  // the row's OPEN areas (avatar/action gaps). Assert the overlay→onSetCurrent binding via dispatchEvent
  // (hit-test-independent) — the disjointness of the visible controls is proven by the sibling tests below.
  await component.getByRole("button", { name: "Switch to Nova" }).dispatchEvent("click");
  await expect(component.getByTestId("fired")).toHaveText("current");
});

test("the chevron fires onToggleExpand only — a disjoint sibling, never 'set current'", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details" }).click();
  await expect(component.getByTestId("fired")).toHaveText("expand");
});

// The create-on-click escape hatch (side-eye P3-2): "New persona" persists a row instantly, so the
// freshly-expanded autosave editor must offer an explicit, always-visible Delete (the row's own delete
// is hover-revealed only). Proves editor-Delete → the row's ConfirmDialog (G7) → confirm → onDelete —
// the same remove mutation the panel wires, so create-then-discard leaves no row.
test("the expanded editor's Delete opens the confirm; confirming fires onDelete", async ({ mount, page }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details" }).click();

  // The editor mounts inside a Collapsible that reveals with a HEIGHT animation under `overflow-hidden`
  // (variants.ts: h-0 → h-(--collapsible-panel-height)). Until that animation settles, the editor's
  // Delete button — near the panel's bottom — is CLIPPED, so a click aimed at it lands in the hidden
  // overflow and is absorbed (setDeleteOpen never fires; the flake). Wait for the panel to reach its
  // fully-expanded height (clientHeight === scrollHeight ⇒ nothing clipped) before clicking Delete.
  const panel = component.locator('[data-slot="collapsible-panel"]');
  await expect(panel).toHaveAttribute("data-open", "");
  await expect.poll(() => panel.evaluate((el) => el.clientHeight === el.scrollHeight && el.clientHeight > 0)).toBe(true);

  await component.getByRole("button", { name: "Delete", exact: true }).click();
  // ConfirmDialog portals to the body — page-scoped locators.
  const confirm = page.getByRole("alertdialog", { name: "Delete this persona?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(component.getByTestId("fired")).toHaveText("delete");
});

test("the name control enters inline rename — it does NOT fire 'set current'", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Rename persona" }).click();
  // The name became an inline input (rename edit), and 'set current' did NOT fire (disjoint sibling).
  await expect(component.getByRole("textbox", { name: "Persona name" })).toBeVisible();
  await expect(component.getByTestId("fired")).toHaveText("none");
});

// ── THE SAME FENCE AT THE NARROWEST REAL MOUNT (side-eye P3) ─────────────────────────────────────────
// This row also renders inside the mobile YOU SHEET, which is 320px wide — narrower than the 358px rail the
// fence above measures. Measured there before the fix: the name read "Tr…" over "Your de…", because the
// name column was the row's only shrinker (the marker cluster carried `shrink-0`). The floor is now the
// name's own `min-w-1/2`, and the markers are what give.

test("at the 320px You-sheet width the name column still keeps HALF the row", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory width={320} />);
  const name = component.locator('[data-slot="persona-row-name"]');
  await expect(name).toBeVisible();
  const [nameWidth, rowWidth] = await name.evaluate((el: HTMLElement): readonly [number, number] => [
    el.getBoundingClientRect().width,
    (el.parentElement as HTMLElement).getBoundingClientRect().width,
  ]);
  // ≥50% of the row's CONTENT box; the row pads, so the fraction of the padded box sits just under it.
  expect(nameWidth / rowWidth).toBeGreaterThan(0.45);
});

test("at 320px the persona's whole name still renders — no ellipsis on a 8-char name", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory width={320} />);
  const nameText = component.getByText("Traveler", { exact: true });
  await expect(nameText).toBeVisible();
  // TRUNCATION IS A GEOMETRY FACT, not a text fact — `truncate` keeps the full string in the DOM and clips
  // it, so the assertion is scrollWidth vs clientWidth on the element that carries the ellipsis.
  const clipped = await nameText.evaluate((el: HTMLElement) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});
