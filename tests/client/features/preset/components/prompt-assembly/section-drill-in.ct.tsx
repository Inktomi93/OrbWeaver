// CT: the rack's SELECT ≠ DRILL split and the drill-in's structural rules (preset-surface-redesign
// §5.1/§5.2, audit §16 rows 18/19/21). These are properties of the COMPOSITION — no unit test of either
// component can see them — and each one is a rule the old surface actually broke:
//
//   · a row CLICK used to mount the editor. It must now only SELECT (the readout is the inspect view).
//   · the chevron DRILLS, and the drill-in owns the whole section — body AND placement AND triggers AND
//     locks, in one place (the CONTEXT inspector that held half of them is deleted).
//   · a MARKER's ⋯ menu omits Delete and Duplicate ENTIRELY (never a disabled Delete); a LITERAL keeps
//     them, and Delete persists the shorter list through the boundary's store driver with no flush.
//   · the PIVOT carries NO enable switch anywhere — a disabled pivot is an assembly with nowhere to
//     splice the conversation.
//   · a plain-marker CARRIER gets NO depth/order/triggers: the schema's own branch declares neither
//     `inject` nor `trigger` on it, so offering the field would write a shape the contract rejects.

import { expect, test } from "@playwright/experimental-ct-react";
import { RackStory } from "./_rack-stories";

test("a row CLICK selects without mounting the drill-in; the CHEVRON drills", async ({ mount }) => {
  const probe = await mount(<RackStory />);

  // Clicking the row body (its accessible name is the section title) must NOT open the editor.
  await probe.getByRole("button", { name: "DeleteMe", exact: true }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeHidden();
  // The rack is still what's rendered — the other rows are all still there.
  await expect(probe.getByRole("button", { name: "Alpha", exact: true })).toBeVisible();

  // The trailing chevron is the drill.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  // ONE OBJECT, ONE PLACE: body + delivery + placement + triggers all live here now.
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("DeleteMe");
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toBeVisible();
  await expect(probe.getByRole("textbox", { name: "Order" })).toBeVisible();
});

// ── F-04: the drill-in is a NAVIGATION, so focus has to travel with it ────────────────────────────────
// Drilling in unmounts the chevron that opened the editor, and backing out unmounts the editor: both
// dropped focus to <body>, which restarts a keyboard user at the top of the document, twice per edit.
// This is a COMPOSITION property — neither component can see it alone — and it is invisible to any
// assertion that is not about `document.activeElement`.

test("F-04 — focus lands in the drill-in on entry and RETURNS to the originating chevron on exit", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);

  const chevron = probe.getByRole("button", { name: "Edit DeleteMe" });
  await chevron.click();

  // ENTRY: the region's first control — Back-to-rack, which also names the way out.
  const back = probe.getByRole("button", { name: "Back to rack" });
  await expect(back).toBeFocused();
  // …inside a NAMED region, so the editor is reachable by landmark and announces what it edits (rec 2).
  await expect(probe.getByRole("region", { name: "DeleteMe — section editor" })).toBeVisible();

  await back.click();

  // EXIT: back to the chevron the user left from — a BRAND-NEW node (the rack remounted), which is why
  // the restore is keyed on the section id rather than a held ref.
  await expect(probe.getByRole("button", { name: "Edit DeleteMe" })).toBeFocused();
  await expect(page.locator("body")).not.toBeFocused();
});

test("the drilled header's enable switch and the rack row's switch write ONE field", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("on=6");

  // Off from the RACK row's switch…
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=5");

  // …and back on from the DRILLED header's echo: same path, so the count returns.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=6");
});

// The two menus are separate mounts on purpose: Base UI's popup leaves an inert backdrop behind for a beat
// after it closes, which swallows the next click on the surface underneath — a fresh mount is the honest
// isolation, not a sleep.
test("a MARKER's ⋯ menu OMITS Delete and Duplicate — the structural rule (§5.2), never a disabled Delete", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);

  await probe.getByRole("button", { name: "Edit Post-history" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Move below the conversation" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
});

test("a LITERAL keeps the full ⋯ set, and Delete persists the shorter list through the store driver", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("ids=sec_a,sec_del,sec_mark,sec_wi,sec_pivot,sec_z");

  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(state).toContainText("ids=sec_a,sec_mark,sec_wi,sec_pivot,sec_z");
  await expect(state).toContainText("savedCount=5");
});

test("the PIVOT carries no enable switch — on the rack or in its drill-in", async ({ mount }) => {
  const probe = await mount(<RackStory />);

  await expect(probe.getByRole("switch", { name: "Chat history enabled" })).toHaveCount(0);
  await probe.getByRole("button", { name: "Edit Chat history" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  await expect(probe.getByRole("switch", { name: "Chat history enabled" })).toHaveCount(0);
  // And no arrangement vocabulary either: it cannot be re-zoned or trigger-filtered.
  await expect(probe.getByLabel("Zone")).toHaveCount(0);
});

test("a CARRIER's drill-in offers no depth, no order and no triggers — the schema has no such fields", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  await probe.getByRole("button", { name: "Edit World info (before)" }).click();
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // It IS arrangeable in the rack sense — zone is array position, which every section has…
  await expect(probe.getByRole("combobox", { name: "Zone" })).toBeVisible();
  // …but `inject` and `trigger` exist only on the literal / templated-marker arms of the union, so the
  // fields are ABSENT rather than rendered-and-disabled (writing either would fail the contract).
  await expect(probe.getByRole("textbox", { name: "Inject at depth" })).toHaveCount(0);
  await expect(probe.getByRole("textbox", { name: "Order" })).toHaveCount(0);
  await expect(probe.getByRole("group", { name: "Fires on" })).toHaveCount(0);
  // Its body is the source-attribution panel plus the shared entry wrapper — never a body textarea.
  // Located by ROLE: the field's explainer moved to the hover HINT (side-eye F-32 — a one-line format
  // string does not need a 90px textarea plus a paragraph), and the hint trigger's own accessible name
  // contains the label, so a bare `getByLabel` now matches two elements.
  await expect(probe.getByRole("combobox", { name: "Entry wrapper" })).toBeVisible();
});

test("Add mints a section AND drills straight into it, where the Name field is", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Literal text" }).click();

  // Auto-drilled: the editor is open on the NEW section, not the rack.
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("New literal");
  await expect(state).toContainText("savedCount=7");
});
