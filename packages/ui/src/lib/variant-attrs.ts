// THE VARIANT-AXIS STAMP (#1080, owner ruling 2026-09-02) — a primitive's resolved `tv()` axis choices,
// emitted as `data-*` attributes on the element it skins.
//
// WHY IT EXISTS. `@orb/ui` expresses its variant axes as CLASS STRINGS only, so nothing in the rendered
// DOM says which ARM an element is. The ui-audit walker's authored-target identity
// (`tooling/src/ui-audit/ops/walker/target-identity.ts`, `TARGET_VARIANT_ATTRS`) reads exactly these four
// attributes to tell two authored decisions apart — with zero emitters, a `size="glyph-xs"` button beside a
// `size="lg"` button in one toolbar folded into ONE "authored target-size decision" (one repair row where
// two decisions exist, with a muddled min–max range). The audit finding is F8 of
// docs/reviews/stickler/2026-09-02-uiaudit-orbui-mechanism-audit.md.
//
// THE DERIVATION IS HERE, ONCE. A hand-written attribute spread inside a primitive is a SECOND source of
// truth that drifts off its own recipe the first time an arm is renamed. Both doors below read the recipe's
// OWN `variants`/`defaultVariants` metadata (tailwind-variants attaches them to the returned component, and
// `lib/class-merge.ts`'s `tv` Proxy forwards property reads), so:
//   • a value is the variant KEY verbatim — no mapping table, nothing to drift;
//   • an axis the recipe does not declare emits NOTHING (never the string "undefined");
//   • an UNSET axis emits the recipe's own `defaultVariants` value — the arm that actually painted;
//   • an axis value the recipe cannot resolve emits nothing, because the attribute and the classes are
//     read off the same lookup: they cannot disagree about which arm rendered.
//
// SCOPE — THE VOCABULARY IS CLOSED AND MIRRORED. `STAMPED_VARIANT_AXES` is the one home of the axis names
// that get stamped; the walker's `TARGET_VARIANT_ATTRS` must stay a superset of it (pinned both ways by
// tests/tooling/ui-audit/ops/walker/target-identity.test.ts). It is deliberately NOT "every axis a recipe
// declares": `orientation`, `side`, `align`, `disabled`, `selected`, `highlighted` and friends are Base UI's
// RUNTIME state vocabulary (282 files emit `data-disabled`, 110 emit `data-orientation` in
// @base-ui/react@1.7.0 — swept 2026-09-02), and a variant axis shadowing one of those would make an
// authored choice indistinguishable from a live state. None of the four members below appears anywhere in
// that package.
//
// THE DOM COST IS ATTRIBUTES ONLY. Nothing styles or selects on these outside the audit instrument; adding
// a rule that paints off a `data-variant`/`data-size`/`data-intent`/`data-tone` selector would turn a
// census channel into a skin and is not what this is for.
//
// ENFORCER (a prose-only boundary is a wish, constitution §2): the `ui-variant-axes-stamped` gate — a `tv()`
// recipe in `packages/ui/src` declaring a stamped axis must reach the DOM through one of these two doors,
// with the not-yet-stamped remainder carried as a shrink-only committed ratchet.
import { cn } from "./class-merge.ts";

/** The axis names the ui primitives stamp. Closed on purpose — see the header's Base UI collision note. */
export const STAMPED_VARIANT_AXES = ["variant", "size", "intent", "tone"] as const;

export type StampedVariantAxis = (typeof STAMPED_VARIANT_AXES)[number];

/** The emitted half: `data-size="glyph-xs"` and friends, absent when the axis is not declared/resolved. */
export type VariantAxisAttrs = Partial<Record<`data-${StampedVariantAxis}`, string>>;

/** A `tv()` recipe read for its METADATA only — the shape both doors need, and the only shape they need.
 *  Slot recipes (`tv({ slots })`) satisfy this too: `variantAttrs` never calls the recipe. */
export interface VariantAxisSource<Selection> {
  (props?: Selection): unknown;
  readonly variants: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly defaultVariants?: Readonly<Record<string, unknown>> | undefined;
}

/** A NON-SLOT recipe — one that resolves to a class string. `variantProps` narrows to this so a slot
 *  recipe (whose call returns a map of slot functions) is a `tsc` error at the door rather than a
 *  `className="[object Object]"` at runtime. */
export interface VariantClassRecipe<Selection> extends VariantAxisSource<Selection> {
  (props?: Selection): string;
}

/** The className half of `variantProps`, split out so the return type reads as what it is: element props. */
export interface VariantStampProps extends VariantAxisAttrs {
  readonly className: string | undefined;
}

/** The resolved arm of one axis — the caller's choice, else the recipe's own default. Emits only when the
 *  key names a real arm of that axis, which is the same lookup `tv()` uses to pick the classes. */
function resolvedArm<Selection>(recipe: VariantAxisSource<Selection>, axis: string, selection: Selection): string | undefined {
  const arms = recipe.variants[axis];
  const chosen = (selection as Readonly<Record<string, unknown>>)[axis] ?? recipe.defaultVariants?.[axis];
  if (arms === undefined || chosen === undefined || chosen === null) {
    return;
  }
  const key = String(chosen);
  return key in arms ? key : undefined;
}

/**
 * The stamp for a recipe whose classes the caller applies itself — the SLOT-recipe door, and the escape
 * hatch for a primitive that composes its className in some other shape. Prefer `variantProps`, which
 * cannot drift because one argument object feeds both halves.
 */
export function variantAttrs<Selection>(recipe: VariantAxisSource<Selection>, selection: Selection): VariantAxisAttrs {
  const attrs: Record<string, string> = {};
  for (const axis of STAMPED_VARIANT_AXES) {
    const arm = resolvedArm(recipe, axis, selection);
    if (arm !== undefined) {
      attrs[`data-${axis}`] = arm;
    }
  }
  return attrs;
}

/**
 * THE PREFERRED DOOR: the element props for a non-slot recipe — the merged className AND the axis stamp,
 * from ONE selection object. Spread it last on the element so the caller's `className` still lands after
 * the recipe's (the `cn(recipe(...), className)` order every primitive already had).
 *
 * `<span data-slot="badge" {...props} {...variantProps(badgeVariants, { intent, tone, size }, className)} />`
 */
export function variantProps<Selection>(recipe: VariantClassRecipe<Selection>, selection: Selection, className?: string): VariantStampProps {
  return { className: cn(recipe(selection), className), ...variantAttrs(recipe, selection) };
}
