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

// The RADIUS half (#169). `--radius-*` is a Tailwind theme namespace feeding `rounded` and every corner
// / side / logical-corner group derived from it. Live instances at the time of the fix: Button's and
// Toggle's `shape` axis (`rounded-control` vs `rounded-full`), Card's `elevated`/`nested` arms over its
// `rounded-base`, ListRow's `rowTint` `rounded-none` over its `rounded-control` base, and one call site
// (`character-hero-band.tsx`) whose `rounded-base` on a Button was inert only because the stylesheet
// emits `.rounded-control` after it — alphabetically, which is the whole defect.
const RADIUS_AXES = [
  ["rounded-full", "rounded-control"],
  ["rounded-control", "rounded-full"],
  ["rounded-base", "rounded-card"],
  ["rounded-card", "rounded-base"],
  // a custom token against the CORE keywords it shares one axis with
  ["rounded-control", "rounded-none"],
  ["rounded-none", "rounded-inset"],
  // the derived groups: one namespace registration has to reach every corner/side/logical family
  ["rounded-t-base", "rounded-t-card"],
  ["rounded-l-full", "rounded-l-control"],
  ["rounded-ss-card", "rounded-ss-inset"],
] as const;

// The CONTAINER half. `--container-*` feeds `w`/`min-w`/`max-w`/`basis` — the `max-w-cq-*` steps.
const CONTAINER_AXES = [
  ["max-w-cq-lg", "max-w-cq-sm"],
  ["max-w-prose", "max-w-cq-md"],
  ["min-w-cq-sm", "min-w-cq-lg"],
  ["w-cq-sm", "w-cq-md"],
  ["basis-cq-md", "basis-cq-sm"],
] as const;

// The WIDTH half — the odd namespace out. tailwind-merge 3.6 has NO `width` theme key, and the v4.3
// engine emits `w-<name>` for `--width-*` but not `max-w-<name>`/`min-w-<name>` (probed), so the one
// group these can conflict in is `w` and they register as a classGroup extension. A width token and a
// spacing token are therefore ONE axis, which is exactly the pair a caller writes.
const WIDTH_AXES = [
  ["w-dialog-lg", "w-number-inline"],
  ["w-number-inline", "w-dialog-lg"],
  ["w-block", "w-content-col"],
  ["w-content-col", "w-0"],
] as const;

const NAMESPACE_AXES = [...RADIUS_AXES, ...CONTAINER_AXES, ...WIDTH_AXES];

test.for(NAMESPACE_AXES)("cn resolves the custom radius/container/width namespaces as ONE axis: %s then %s → only the second", ([first, second]) => {
  const merged = cn(first, second);
  expect(merged, "the LAST class on an axis must win — the caller's override").toContain(second);
  expect(merged, "the one it overrides must be DROPPED, not left to stylesheet order").not.toContain(first);
});

/** Namespace → a `<utility>-<token>` speller + the CORE class of the same axis it must defeat. One row
 *  per REGISTERED namespace; a namespace registered without a row here is caught by the count assertion
 *  in the completeness test below, so a new registration cannot land unproven. */
const REGISTERED_NAMESPACES = [
  { namespace: "spacing", utility: (token: string): string => `gap-${token}`, core: "gap-0" },
  { namespace: "radius", utility: (token: string): string => `rounded-${token}`, core: "rounded-none" },
  { namespace: "container", utility: (token: string): string => `max-w-${token}`, core: "max-w-0" },
  { namespace: "width", utility: (token: string): string => `w-${token}`, core: "w-0" },
] as const;

test.for(REGISTERED_NAMESPACES)("every --$namespace-* token is registered — a new token cannot silently re-open the defect", ({ namespace, utility, core }) => {
  const prefix = `${namespace}.`;
  const tokens = Object.keys(TOKENS)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
  expect(tokens.length, `the ${namespace} namespace must be non-empty, or this assertion proves nothing`).toBeGreaterThan(0);
  const unresolved = tokens.filter((token) => cn(utility(token), core)?.includes(utility(token)));
  expect(unresolved, `these ${namespace} tokens are opaque to the merger — ${utility("<token>")} survived beside ${core}`).toStrictEqual([]);
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
