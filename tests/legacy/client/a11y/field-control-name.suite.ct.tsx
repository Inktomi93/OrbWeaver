// CT SUITE: WHICH NAME A CONTROL INSIDE A `<Field>` ACTUALLY ANSWERS TO, per @orb/ui primitive family
// (#1621, finishing what #1587 started on the Input family alone).
//
// THE QUESTION. `Field` renders a visible label and Base UI reaches the field's `Field.Control` with an
// `aria-labelledby` built from it — and `aria-labelledby` OUTRANKS `aria-label` (accname 1.2, step 2B before
// 2C). So a control that sits inside a `Field` AND carries its own `aria-label` has two candidate names and
// exactly one winner, and which one wins is a fact about the PRIMITIVE, not about the call site. #1587
// measured it for `Input`, found the attribute dead at five sites, and removed them. The census behind #1621
// found the same shape on eight more families and 43 more sites — so this file measures each family once,
// and the per-site decisions cite it.
//
// THE MEASUREMENT IS `ariaSnapshot()`, deliberately: it is Playwright's OWN accname computation, i.e. the
// tree an agent driving `getByRole(role, { name })` and a screen reader both see. Every hand-rolled name key
// in this repo's own instruments reads `aria-label` BEFORE `aria-labelledby` — the reverse of the spec — and
// a cross-check between two of them agrees while both lie (memory: accname-key-aria-label-before-labelledby).
// So the name is never derived here; it is read off the tree.
//
// THE POSITIVE CONTROL is the `Input` row: #1587's verdict is already landed and acted on, so a run in which
// the Input answers to its own `aria-label` is a run whose method has broken, not a discovery.
//
// ── THE MEASURED TABLE (2026-09-05, this file's own output) ────────────────────────────────────────────
//   family        | reported name          | the caller's aria-label is…
//   Input   (ctl) | the Field's label      | DEAD           — #1587 removed 5
//   Textarea      | the Field's label      | DEAD           — #1621 removed 2
//   Combobox      | the Field's label      | DEAD           — #1621 removed 1
//   Switch        | the Field's label      | DEAD           — #1633 removed 6 once the lint floor let go
//   Select        | the Field's label      | DEAD on the trigger, KEPT — the hidden input consumes it (below)
//   NumberField   | the Field's label      | LOAD-BEARING — it names the two STEPPER buttons (side-eye F-20)
//   ToggleGroup   | its OWN aria-label     | LOAD-BEARING — and it is the group's ONLY name
//
// THE SWITCH NOTE — RESOLVED BY #1633, and the resolution is the reason this row now reads like the others.
// Until 2026-09-19 six measured-dead `aria-label`s stood on `<Switch>`es inside a `<Field>` for a reason that
// was NOT accessibility: `eslint.config.js` mapped `Switch` to `button` for `jsx-a11y`, and `button` is not in
// `control-has-associated-label`'s `ignoreElements`, so a bare `<Switch>` was RED at every call site — the
// rule resolves the tag through the components map BEFORE testing that list, which is also why the `"Switch"`
// entry sitting IN the list was inert. The class fix remapped `Switch` to `input` (the semantic proxy
// `Checkbox` has taken since #579; Base UI renders both as a button plus a hidden input), so the six
// attributes and the wrapper's cited suppression are gone. What this file still owns is the MEASUREMENT: the
// lint floor no longer consumes the attribute, so the `Switch own` row below is the only thing standing
// between a re-added `aria-label` and a caller believing it names something.
//
// THE SELECT NOTE, because "dead on the trigger" is not the whole answer. `select.tsx` also stamps a name on
// the hidden form input Base UI renders for submission, and it sources that from the caller's `aria-label`
// (falling back to the literal "Hidden select value"). Inside a `Field` the trigger ignores the attribute but
// the hidden input still consumes it, so dropping the 18 would trade 18 real names for 18 generic ones on an
// element axe does scan. They stay, and the reason is a fact about the PRIMITIVE — reported to the orchestrator
// as an @orb/ui documentation gap rather than edited here (`packages/ui` is fenced for this lane).
//
// THE TOGGLEGROUP NOTE is the inverse and is the one genuine surprise: a `ToggleGroup` is NOT a
// `Field.Control`, so the enclosing Field's label reaches nothing and the group is named solely by its own
// `aria-label`. Every live site passes the Field's own label string, so today they agree — but a site that
// dropped the attribute for symmetry with the Switch/Input verdict would leave the group anonymous. That is
// exactly why this is a per-family MEASUREMENT and never a bulk edit.

import { expect, test } from "@playwright/experimental-ct-react";
import { FieldControlNameStory } from "./_ct-stories.tsx";

test("the Field's label wins for every Field.Control family — Input (the control), Textarea, Select, Switch, Combobox", async ({ mount }) => {
  const story = await mount(<FieldControlNameStory />);

  // THE POSITIVE CONTROL: #1587's landed verdict, re-measured. If this row ever reads "Input own", the
  // method is broken and no other row in this file means anything.
  await expect(story.getByRole("textbox", { name: "Input group", exact: true })).toBeVisible();
  await expect(story.getByRole("textbox", { name: "Input own", exact: true })).toHaveCount(0);

  await expect(story.getByRole("textbox", { name: "Textarea group", exact: true })).toBeVisible();
  await expect(story.getByRole("textbox", { name: "Textarea own", exact: true })).toHaveCount(0);

  // The Select TRIGGER (Base UI gives it role=combobox). Its own `aria-label` loses here; what it still buys
  // is the hidden submission input's name — see the header's Select note.
  await expect(story.getByRole("combobox", { name: "Select group", exact: true })).toBeVisible();
  await expect(story.getByRole("combobox", { name: "Select own", exact: true })).toHaveCount(0);

  await expect(story.getByRole("switch", { name: "Switch group", exact: true })).toBeVisible();
  await expect(story.getByRole("switch", { name: "Switch own", exact: true })).toHaveCount(0);

  await expect(story.getByRole("combobox", { name: "Combobox group", exact: true })).toBeVisible();
  await expect(story.getByRole("combobox", { name: "Combobox own", exact: true })).toHaveCount(0);
});

test("NumberField's aria-label is LOAD-BEARING — the Field names the value box, the attribute names the steppers", async ({ mount }) => {
  const story = await mount(<FieldControlNameStory />);

  // The value box is the Field.Control, so it takes the Field's label like every other family…
  await expect(story.getByRole("textbox", { name: "NumberField group", exact: true })).toBeVisible();
  // …and the attribute is the ONLY source for the two stepper buttons' names (`stepperLabel(…, ariaLabel)` in
  // `packages/ui/src/primitives/number-field/number-field.tsx`). Dropping it as "dead" — which is what a bulk
  // sweep off the Input verdict would do — renames both buttons to a bare "Decrease"/"Increase" and two
  // number fields on one pane become indistinguishable by name. This is side-eye F-20's deliberate forward.
  await expect(story.getByRole("button", { name: "Decrease NumberField own", exact: true })).toBeVisible();
  await expect(story.getByRole("button", { name: "Increase NumberField own", exact: true })).toBeVisible();
});

test("ToggleGroup is NOT a Field.Control — its own aria-label is the group's only name", async ({ mount }) => {
  const story = await mount(<FieldControlNameStory />);

  // The group answers to its attribute, and the enclosing Field's label reaches NOTHING — the inverse of
  // every row above, and the reason the three live ToggleGroup sites keep their attribute.
  await expect(story.getByRole("group", { name: "ToggleGroup own", exact: true })).toBeVisible();
  await expect(story.getByRole("group", { name: "ToggleGroup group", exact: true })).toHaveCount(0);
  // A Toggle ITEM is named by its own content or its own attribute; it was never a Field control either.
  await expect(story.getByRole("button", { name: "Toggle own", exact: true })).toBeVisible();
});
