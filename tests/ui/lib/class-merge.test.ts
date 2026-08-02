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
import { expect, test } from "../../support/fixtures";

// `text-title` is a custom DTCG type-scale utility (--text-title); `text-muted-foreground` is a real
// text COLOR. They are different axes and MUST both survive. An unconfigured tailwind-merge puts them
// in one class group and keeps only the last.
const SIZE_VS_COLOR = ["text-title", "text-muted-foreground"] as const;
// `leading-body` (custom --leading-*) vs core `leading-tight`: the SAME axis, so the caller's override
// must win outright — an unconfigured merger keeps both and lets stylesheet order decide.
const LEADING_OVERRIDE = ["leading-tight", "leading-body"] as const;

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
