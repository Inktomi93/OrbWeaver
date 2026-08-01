// Type pins for the Input seal's NARROWED `type` prop (owner ruling 2026-08-02: numeric entry is the
// NumberField primitive, everywhere). The narrowing IS the enforcement — it makes the old
// `<Input type="number">` shape unwriteable, so a future numeric field has nowhere to go but NumberField.
//
// Pinned here rather than left to a hand-run probe because the failure mode is silent: React's
// `HTMLInputTypeAttribute` carries a `(string & {})` arm, so re-widening the prop (or "fixing" the union
// with an `Exclude<HTMLInputTypeAttribute, "number">`) would accept "number" again while LOOKING narrowed.
//
// Mirrors `primitives/input/index.ts` (the barrel that exports `InputProps`), not `input.tsx`: a `.ts`-kind
// test may only mirror a `.ts` source (test-layout gate), and the pin is on the seal's PUBLIC prop type.

import type { InputProps } from "@orb/ui/input";
import { expectTypeOf, test } from "vitest";

test('type="number" does not compile — the numeric control is NumberField', () => {
  // @ts-expect-error — "number" is deliberately absent from the union (see input.tsx)
  const numeric: InputProps = { type: "number" };
  expectTypeOf(numeric).not.toBeAny();
});

test("the text-shaped families still compile", () => {
  const text: InputProps = { type: "text" };
  const password: InputProps = { type: "password" };
  const dateTime: InputProps = { type: "datetime-local" };
  expectTypeOf(text.type).toEqualTypeOf<InputProps["type"]>();
  expectTypeOf(password).not.toBeAny();
  expectTypeOf(dateTime).not.toBeAny();
});

test("the non-text families route to their own primitives, never Input", () => {
  // @ts-expect-error — Checkbox/RadioGroup/Switch/Slider/ColorField/FileTrigger own these
  const checkbox: InputProps = { type: "checkbox" };
  // @ts-expect-error — a bounded numeric drag is Slider
  const range: InputProps = { type: "range" };
  expectTypeOf(checkbox).not.toBeAny();
  expectTypeOf(range).not.toBeAny();
});
