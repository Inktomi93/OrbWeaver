// The class-merger contract: `cn` from `@orb/ui/lib` resolves conflicts through the CONFIGURED
// tailwind-merge — always, regardless of what else the import graph has loaded.
//
// This file is the regression pin for a silent visual defect. tailwind-variants keeps its twMerge
// config in module-level mutable state that only a CALLED variants factory writes, so the `cn` this
// barrel used to re-export merged with an UNCONFIGURED tailwind-merge until some unrelated module
// happened to run a `tv({…})`. An unconfigured merger classifies our custom `--text-*` DTCG utilities
// as text COLORS and drops the size class — the same source rendering in a different font size
// depending on import order. The first test below is deliberately the FIRST statement to touch a
// merger in this module graph (nothing here imports a variants module), so it exercises exactly the
// cold-graph state that used to be wrong; the second proves a warm graph gives the same answer.
import { cn } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "../../support/fixtures.ts";

// `text-title` is a custom DTCG type-scale utility (--text-title); `text-muted-foreground` is a real
// text COLOR. They are different axes and MUST both survive. An unconfigured tailwind-merge puts them
// in one class group and keeps only the last.
const SIZE_VS_COLOR = ["text-title", "text-muted-foreground"] as const;
// `leading-body` (custom --leading-*) vs core `leading-tight`: the SAME axis, so the caller's override
// must win outright — an unconfigured merger keeps both and lets stylesheet order decide.
const LEADING_OVERRIDE = ["leading-tight", "leading-body"] as const;

// The SPACING half of the same defect (#146). Every `--spacing-*` token feeds the whole Tailwind spacing
// scale — gap/padding/margin/size/inset/space/scroll — so an unregistered family leaves TWO utilities of
// one axis alive in the emitted string and lets stylesheet order pick the winner. Live instances at the
// time of the fix: `CHIP_BOX`'s `gap-tight` over both control primitives' `gap-field` base, and the Tabs
// `stacked` arm's `gap-0` over the tab base's `gap-field`. `later argument wins` is the whole contract.
const SPACING_AXES = [
  // gap and its two axis halves
  ["gap-field", "gap-tight"],
  ["gap-x-block", "gap-x-tight"],
  ["gap-y-block", "gap-y-tight"],
  // padding — the shorthand, both axes, and every logical/physical side
  ["p-block", "p-field"],
  ["px-block", "px-field"],
  ["py-block", "py-field"],
  ["ps-block", "ps-field"],
  ["pe-block", "pe-field"],
  ["pt-block", "pt-field"],
  ["pb-block", "pb-field"],
  // the axes a custom token shares with a CORE keyword, and the numeric-vs-token pair the Tabs
  // `stacked` arm rides (`gap-0` is a core numeric; `gap-field` is ours — one axis, so one survivor).
  ["gap-block", "gap-0"],
  ["gap-0", "gap-block"],
  ["h-control-sm", "h-auto"],
  ["m-block", "m-auto"],
  ["size-glyph-md", "size-glyph-lg"],
] as const;

test.for(SPACING_AXES)("cn resolves the custom spacing scale as ONE axis: %s then %s → only the second", ([first, second]) => {
  const merged = cn(first, second);
  expect(merged, "the LAST spacing class on an axis must win — the caller's override").toContain(second);
  expect(merged, "the one it overrides must be DROPPED, not left to stylesheet order").not.toContain(first);
});

test("every --spacing-* token is registered — a new token cannot silently re-open the defect", () => {
  const spacingTokens = Object.keys(TOKENS)
    .filter((path) => path.startsWith("spacing."))
    .map((path) => path.slice("spacing.".length));
  expect(spacingTokens.length, "the spacing namespace must be non-empty, or this assertion proves nothing").toBeGreaterThan(0);
  const unresolved = spacingTokens.filter((token) => cn(`gap-${token}`, "gap-0")?.includes(`gap-${token}`));
  expect(unresolved, "these spacing tokens are opaque to the merger — gap-<token> survived beside gap-0").toStrictEqual([]);
});

test("cn keeps a custom type-scale class beside a text COLOR on a COLD graph (no variants module loaded yet)", () => {
  const merged = cn(...SIZE_VS_COLOR);
  expect(merged, "the custom --text-title size class must survive the merge").toContain("text-title");
  expect(merged, "the text color must survive too — different axes, no conflict").toContain("text-muted-foreground");
});

test("cn resolves custom leading against core leading as ONE axis (last wins, not both)", () => {
  const merged = cn(...LEADING_OVERRIDE);
  expect(merged, "the caller's custom leading must win").toContain("leading-body");
  expect(merged, "the core leading it overrides must be dropped, not left to stylesheet order").not.toContain("leading-tight");
});

test("the answer does not depend on import order — a warm graph (variants module loaded) merges identically", async () => {
  const cold = { size: cn(...SIZE_VS_COLOR), leading: cn(...LEADING_OVERRIDE) };
  // Evaluating a tv-built variants module is what used to prime the shared merger state (the `tv({…})`
  // call itself writes it). Imported by PATH, not by package subpath, to keep this file React-free.
  await import("../../../packages/ui/src/primitives/button/variants.ts");
  expect({ size: cn(...SIZE_VS_COLOR), leading: cn(...LEADING_OVERRIDE) }).toStrictEqual(cold);
});
