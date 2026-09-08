// Type pins for the Button seal's ICON-ONLY NAME REQUIREMENT (#1021). An icon-only size arm paints a
// glyph in a square box, so nothing inside the button can supply an accessible name — §13.10 N1 makes
// `aria-label`/`aria-labelledby` the only source, and a nameless one used to compile fine and be caught
// only at ui-audit time (`checks-a11y.ts` `checkAccessibleName`), i.e. only on a surface someone walked.
//
// Pinned here because the failure mode is silent in TWO directions: `IconOnlyButtonSize` is an `Extract`
// over the tv() size axis, so RENAMING a size arm would resolve it to `never` and disarm the rule while
// every call site still compiled — the membership assertions below are what red that.

import type { ButtonProps, IconOnlyButtonSize } from "@orb/ui/button";
import { expectTypeOf, test } from "vitest";

test("every icon-only size arm still resolves — the Extract has not gone to never", () => {
  expectTypeOf<"icon">().toExtend<IconOnlyButtonSize>();
  expectTypeOf<"icon-sm">().toExtend<IconOnlyButtonSize>();
  expectTypeOf<"glyph-xs">().toExtend<IconOnlyButtonSize>();
  expectTypeOf<"glyph-sm">().toExtend<IconOnlyButtonSize>();
  expectTypeOf<"glyph-md">().toExtend<IconOnlyButtonSize>();
  expectTypeOf<"glyph-lg">().toExtend<IconOnlyButtonSize>();
});

test("an icon-only button with NO name does not compile", () => {
  // @ts-expect-error — `size="icon"` has no text child to name it, so a name attribute is required
  const nameless: ButtonProps = { size: "icon" };
  // @ts-expect-error — the whole `glyph-*` ramp is icon-only too
  const namelessGlyph: ButtonProps = { size: "glyph-sm" };
  // @ts-expect-error — `title` is a TOOLTIP, not the accessible name this rule asks for
  const titled: ButtonProps = { size: "icon-sm", title: "Delete" };
  expectTypeOf(nameless).not.toBeAny();
  expectTypeOf(namelessGlyph).not.toBeAny();
  expectTypeOf(titled).not.toBeAny();
});

test("an icon-only button names itself with either accname attribute", () => {
  const labelled: ButtonProps = { size: "icon", "aria-label": "Delete character" };
  const labelledBy: ButtonProps = { size: "glyph-md", "aria-labelledby": "row-title" };
  expectTypeOf(labelled).not.toBeAny();
  expectTypeOf(labelledBy).not.toBeAny();
});

test("a text button is named by its child and asks for nothing extra", () => {
  const text: ButtonProps = { children: "Save changes" };
  const sized: ButtonProps = { size: "sm", intent: "secondary", children: "Cancel" };
  // The content-sized `media` arm is NOT icon-only: its portrait/avatar child carries the name.
  const media: ButtonProps = { size: "media" };
  expectTypeOf(text).not.toBeAny();
  expectTypeOf(sized).not.toBeAny();
  expectTypeOf(media).not.toBeAny();
});
