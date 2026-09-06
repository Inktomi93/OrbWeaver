// CT: the shared label-left / control-right settings rows. The pin is the INAPPLICABLE-STATE contract
// (side-eye 2026-08-06 P2): `SettingRowControlProps` advertises `disabled` + `disabledReason` to BOTH
// arms, and the SWITCH arm destructured neither — it accepted them and silently dropped them, so the first
// call site to reach for them would have shipped a fully live switch with no note and no compile error.
// Both arms now honour them through one `describeRow` helper, so the two rows cannot drift again.
//
// The reason rides the DESCRIPTION slot on purpose: that is what puts it in `aria-describedby` (Base UI's
// Field.Description registers its id there), which is the only thing that turns a dead control into an
// honest one for a screen reader.

import { SettingCheckboxRow, SettingSwitchRow } from "@orb/client/components";
import { expect, test } from "@playwright/experimental-ct-react";
import { readSwitchRowOrientation } from "../../support/ct/settings-geometry.ts";

test("SettingSwitchRow honours disabled + renders its reason as the row's description", async ({ mount, page }) => {
  await mount(
    <SettingSwitchRow
      checked={false}
      disabled={true}
      disabledReason="Turn on auto-continue first."
      label="Auto-continue rounds"
      onChange={(): void => undefined}
    />,
  );

  const control = page.getByRole("switch", { name: "Auto-continue rounds" });
  await expect(control).toBeVisible();
  await expect(control).toBeDisabled();
  // The reason is ON SCREEN…
  await expect(page.getByText("Turn on auto-continue first.")).toBeVisible();
  // …and IN the control's accessible description, which is the half a sighted-only check would miss.
  await expect(control).toHaveAccessibleDescription("Turn on auto-continue first.");
});

test("SettingSwitchRow with no disabled state is a live switch with no stray description", async ({ mount, page }) => {
  await mount(<SettingSwitchRow checked={true} label="Show avatars in chat" onChange={(): void => undefined} />);

  const control = page.getByRole("switch", { name: "Show avatars in chat" });
  await expect(control).toBeEnabled();
  await expect(page.locator('[data-slot="field-description"]')).toHaveCount(0);
});

// The arm that already worked — pinned beside its twin so "both arms, one behaviour" is a fact the suite
// states rather than a claim the header makes.
test("SettingCheckboxRow honours the same pair, and both arms compose one description", async ({ mount, page }) => {
  await mount(
    <SettingCheckboxRow
      checked={false}
      description="Keeps the library index current."
      disabled={true}
      disabledReason="Only the owner can change this."
      label="Background indexing"
      onChange={(): void => undefined}
    />,
  );

  await expect(page.getByRole("checkbox", { name: "Background indexing" })).toBeDisabled();
  const description = page.locator('[data-slot="field-description"]');
  await expect(description).toContainText("Keeps the library index current.");
  await expect(description).toContainText("Only the owner can change this.");
});

// ── #980 F22 · THIS ROW IS THE REFERENCE ORIENTATION ─────────────────────────────────────────────────
// Three collection surfaces hand-rolled this row three other ways, one of them INVERTED (the tag member
// editor drew switch x=561 / label x=615 — a control-left row in a pane where every other control is
// label-left, three orientations in one 720px form; side-eye 2026-09-06, run main-1931103). They are
// converted, and `readSwitchRowOrientation` is the ONE definition of what they were converted TO: this
// test is the reference reading, and `tag-member-surface.ct.tsx` / `regex-context-body.ct.tsx` assert the
// same helper against the same expectations, so the three cannot drift apart again.
test("#980 F22: the shared row IS the house orientation — label left, control right, on one line, clickable", async ({ mount, page }) => {
  await mount(<SettingSwitchRow checked={false} label="Show avatars in chat" onChange={(): void => undefined} />);

  expect(await readSwitchRowOrientation(page, "Show avatars in chat")).toEqual({
    label: "Show avatars in chat",
    labelLeadsControl: true,
    onOneLine: true,
    labelIsLabel: true,
  });
});
