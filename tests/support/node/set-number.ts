// CT kit: type a value into an `@orb/ui` NumberField and COMMIT it.
//
// Two traps this exists to close, both of which produce a green-looking test that drove the wrong value:
//  - `fill()` APPENDS on a controlled NumberField. Base UI keeps its own input text and re-applies the
//    formatted value, so Playwright's set-value-then-fire-input lands *beside* the existing digits
//    ("60" + fill("25") → "6025" → a clamp to max, not the 25 the test meant). Selecting all first and
//    typing real keystrokes is the only faithful "an admin retyped this field".
//  - the clamp/format runs on BLUR. Without leaving the field, an out-of-range or partially-typed value
//    never becomes the committed one, so a clamp assertion reads whatever was mid-typing.
//
// Locate the field as a TEXTBOX, never a spinbutton — Base UI 1.6 renders the number field as an editable
// textbox on purpose (packages/ui/src/primitives/number-field/number-field.tsx).

import type { Locator } from "@playwright/test";

/** Replace a NumberField's contents with `digits` and commit them (select-all → type → blur). */
export async function setNumber(field: Locator, digits: string): Promise<void> {
  await field.press("ControlOrMeta+a");
  await field.pressSequentially(digits);
  await field.blur();
}

/** EMPTY a NumberField and commit it — the "nothing typed" state a nullable knob reads as its floor. Not
 *  `setNumber(field, "")`: `pressSequentially("")` types nothing, so the select-all would just sit there and
 *  the old value would survive the blur (a green test that drove no change at all). */
export async function clearNumber(field: Locator): Promise<void> {
  await field.press("ControlOrMeta+a");
  await field.press("Backspace");
  await field.blur();
}
