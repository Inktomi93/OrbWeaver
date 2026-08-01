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

test("the drilled header's enable switch and the rack row's switch write ONE field", async ({ mount }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("on=5");

  // Off from the RACK row's switch…
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=4");

  // …and back on from the DRILLED header's echo: same path, so the count returns.
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await probe.getByRole("switch", { name: "DeleteMe enabled" }).click();
  await expect(state).toContainText("on=5");
});

test("a MARKER's ⋯ menu omits Delete and Duplicate; a LITERAL keeps both and Delete persists", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");
  await expect(state).toContainText("ids=sec_a,sec_del,sec_mark,sec_pivot,sec_z");

  // The MARKER: its menu offers the zone move only — the structural rule (§5.2), omitted not disabled.
  await probe.getByRole("button", { name: "Edit Post-history" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
  // Close the menu and let its portal tear down before touching the surface behind it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Move below the conversation" })).toHaveCount(0);
  await probe.getByRole("button", { name: "Back to rack" }).click();

  // The LITERAL: full set, and Delete persists the shorter list through the store driver (no flush).
  await probe.getByRole("button", { name: "Edit DeleteMe" }).click();
  await page.getByRole("button", { name: "Section actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(state).toContainText("ids=sec_a,sec_mark,sec_pivot,sec_z");
  await expect(state).toContainText("savedCount=4");
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

test("Add mints a section AND drills straight into it, where the Name field is", async ({ mount, page }) => {
  const probe = await mount(<RackStory />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Literal text" }).click();

  // Auto-drilled: the editor is open on the NEW section, not the rack.
  await expect(probe.getByRole("button", { name: "Back to rack" })).toBeVisible();
  await expect(probe.getByLabel("Name", { exact: true })).toHaveValue("New literal");
  await expect(state).toContainText("savedCount=6");
});
