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

// ── The select target's NAME is state-aware (side-eye 2026-08-07 P3a / §13.10 N3+N4) ────────────────
// A fixed `Switch to X` made a screen reader announce "Switch to Traveler, current true" on the persona you
// are ALREADY playing as: a verb offering a no-op, contradicted by its own `aria-current` one word later.
// Both arms keep the persona's NAME leading, so a name-scoped lookup survives the state change.

test("the CURRENT persona's row is named for its STATE, never for a switch that would do nothing", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory />);
  const current = component.getByRole("button", { name: "Traveler — current persona" });
  await expect(current).toHaveAttribute("aria-current", "true");
  // …and the verb it would have offered is gone, not merely re-worded around.
  await expect(component.getByRole("button", { name: "Switch to Traveler" })).toHaveCount(0);
});

test("a NON-current row keeps the verb — the name only changes where the act is a no-op", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  const target = component.getByRole("button", { name: "Switch to Nova" });
  await expect(target).toBeAttached();
  await expect(target).not.toHaveAttribute("aria-current", "true");
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

// THE 320px INVARIANT IS NON-OVERLAP, NOT A FRACTION (side-eye leg-4 P2, correcting leg 3). A `min-w-1/2`
// floor on the name lane DID give it half — and squeezed the marker cluster to a 38px box whose contents
// still laid out at their own width, painting 58px LEFTWARD through the name. A floor on one side of a
// two-item row is a squeeze on the other. So the markers reserve what they need, the name shrinks and
// truncates, and what the CT guards is that the two lanes never occupy the same pixels.
test("at the 320px You-sheet width the name lane and the marker cluster never overlap", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory width={320} />);
  const name = component.locator('[data-slot="persona-row-name"]');
  const markers = component.locator('[data-slot="persona-row-markers"]');
  await expect(name).toBeVisible();
  await expect(markers).toBeVisible();

  const nameBox = await name.boundingBox();
  const markerBox = await markers.boundingBox();
  expect(nameBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  // The measured defect: markers box at 38px wide with its contents rendering at x=152, i.e. 58px of the
  // name lane painted through. Boxes, not classes.
  expect(nameBox?.x ?? 0).toBeLessThan(markerBox?.x ?? 0);
  expect((nameBox?.x ?? 0) + (nameBox?.width ?? 0)).toBeLessThanOrEqual((markerBox?.x ?? 0) + 1);

  // …and the name still gets a real share of the row. The floor is what the CURRENT composition affords
  // with the "Playing as" words kept (measured 0.32); it is a fence against another collapse, not a target.
  const rowWidth = await name.evaluate((el: HTMLElement) => (el.parentElement as HTMLElement).getBoundingClientRect().width);
  expect((nameBox?.width ?? 0) / rowWidth).toBeGreaterThan(0.3);
});

// The row header claims the kicker truncates. It did not — `white-space: normal` wrapped "Playing as" to
// two lines even at rest, which is part of what made the cluster wider and taller than the row budgeted
// for. A claim in a header is a wish until something measures it.
test("the 'Playing as' kicker renders on ONE line at 320px — the header's truncation claim is true", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowDenseStory width={320} />);
  const kicker = component.getByText("Playing as", { exact: true });
  await expect(kicker).toBeVisible();
  const lines = await kicker.evaluate((el: HTMLElement) => {
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight);
    return el.getBoundingClientRect().height / (Number.isNaN(lineHeight) ? el.getBoundingClientRect().height : lineHeight);
  });
  expect(lines).toBeLessThan(1.5);
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
