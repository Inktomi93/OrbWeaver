// The variant-axis stamp's DERIVATION contract (#1080) — what `variantAttrs`/`variantProps` emit for a
// given recipe + selection. The RENDERED half (the pilot primitives actually carrying the attributes in a
// browser, beside Base UI's own state attrs) is tests/ui/lib/variant-attrs.ct.tsx; the walker half (the
// audit reading them back as authored identity) is
// tests/tooling/ui-audit/ops/walker/target-identity.test.ts.
//
// Recipes are built HERE with the real `tv` rather than imported from a primitive: the claims under test
// are about the mechanism (defaults, undeclared axes, unstamped axes, verbatim keys), and a pilot's own
// arms are pinned where they render.
import { STAMPED_VARIANT_AXES, tv, variantAttrs, variantProps } from "@orb/ui/lib";
import { expect, test } from "../../support/fixtures.ts";

const recipe = tv({
  base: "inline-flex",
  variants: {
    intent: { primary: "bg-primary", ghost: "bg-transparent" },
    size: { md: "h-control-md", "glyph-xs": "size-glyph-xs" },
    // NOT a stamped axis — a rendered `data-shape` would be vocabulary the walker never learned.
    shape: { control: "rounded-control", pill: "rounded-full" },
  },
  defaultVariants: { intent: "primary", size: "md", shape: "control" },
});

test("the four axes are the closed stamped vocabulary", () => {
  expect([...STAMPED_VARIANT_AXES]).toStrictEqual(["variant", "size", "intent", "tone"]);
});

test("an explicit arm is emitted as the variant KEY verbatim", () => {
  expect(variantAttrs(recipe, { intent: "ghost", size: "glyph-xs" })).toStrictEqual({ "data-intent": "ghost", "data-size": "glyph-xs" });
});

test("an UNSET axis emits the recipe's own default — the arm that actually painted", () => {
  // The whole point of reading `defaultVariants`: `<Button>` with no props renders the `md`/`primary`
  // classes, so an attribute-less element would leave the walker unable to tell it from any other size.
  expect(variantAttrs(recipe, {})).toStrictEqual({ "data-intent": "primary", "data-size": "md" });
});

test("an axis the recipe does not declare emits nothing — never the string undefined", () => {
  const attrs = variantAttrs(recipe, {});
  expect(Object.hasOwn(attrs, "data-variant")).toBe(false);
  expect(Object.hasOwn(attrs, "data-tone")).toBe(false);
});

test("a declared but UNSTAMPED axis stays out of the DOM", () => {
  // `shape` resolves classes exactly as before; it is simply not part of the walker's vocabulary, and an
  // axis nothing reads is DOM weight with no reader.
  expect(Object.keys(variantAttrs(recipe, { shape: "pill" }))).toStrictEqual(["data-size", "data-intent"]);
});

test("an axis explicitly set to undefined falls back to the default, not to an emitted hole", () => {
  // The live call shape: a primitive destructures `size` off its props and forwards it whether or not the
  // caller passed one.
  expect(variantAttrs(recipe, { intent: undefined, size: undefined })).toStrictEqual({ "data-intent": "primary", "data-size": "md" });
});

test("a recipe with NO defaults for an axis emits that axis only when chosen", () => {
  const bare = tv({ variants: { tone: { solid: "bg-accent", soft: "bg-accent/15" } } });
  expect(variantAttrs(bare, {})).toStrictEqual({});
  expect(variantAttrs(bare, { tone: "soft" })).toStrictEqual({ "data-tone": "soft" });
});

test("variantProps resolves the classes and the stamp from ONE selection object", () => {
  const props = variantProps(recipe, { intent: "ghost", size: "glyph-xs" });
  expect(props["data-intent"]).toBe("ghost");
  expect(props["data-size"]).toBe("glyph-xs");
  expect(props.className).toContain("size-glyph-xs");
  expect(props.className).toContain("bg-transparent");
});

test("variantProps merges the caller's className LAST, through the configured merger", () => {
  // `rounded-control` and `rounded-full` are one tailwind-merge group (the registered radius scale), so a
  // caller override must WIN rather than both surviving — the same contract `cn(recipe(...), className)`
  // had before the seam existed.
  const props = variantProps(recipe, { shape: "control" }, "rounded-full");
  expect(props.className).toContain("rounded-full");
  expect(props.className).not.toContain("rounded-control");
});
