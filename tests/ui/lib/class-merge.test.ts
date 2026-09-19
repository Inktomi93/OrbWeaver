// The class-merger contract: `cn` from `@orb/ui/lib` resolves conflicts through the CONFIGURED
// tailwind-merge — always, regardless of what else the import graph has loaded.
//
// This file is the regression pin for a silent visual defect. tailwind-variants keeps its twMerge
// config in module-level mutable state that only a CALLED variants factory writes, so the `cn` this
// barrel used to re-export merged with an UNCONFIGURED tailwind-merge until some unrelated module
// happened to run a `tv({…})`. An unconfigured merger classifies our custom `--text-*` DTCG utilities
// as text COLORS and drops the size class — the same source rendering in a different font size
// depending on import order. The first test below is deliberately the FIRST statement to touch a
// merger in this module graph, so it exercises exactly the cold-graph state that used to be wrong.
import type { CssMergeTraceSnapshot } from "@orb/ui/lib";
import { CSS_MERGE_FAMILY_NAMES, CSS_MERGE_TRACE_INPUT_LIMIT, cn, cssMergeTrace, tv } from "@orb/ui/lib";
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

/** Namespace → a `<utility>-<token>` speller + the CORE class of the same axis it must defeat. These are
 *  the namespaces Orb registers with an explicit derived scale rather than tailwind-merge's broad defaults. */
const REGISTERED_NAMESPACES = [
  { namespace: "spacing", utility: (token: string): string => `gap-${token}`, core: "gap-0" },
  { namespace: "radius", utility: (token: string): string => `rounded-${token}`, core: "rounded-none" },
  { namespace: "container", utility: (token: string): string => `max-w-${token}`, core: "max-w-0" },
  { namespace: "width", utility: (token: string): string => `w-${token}`, core: "w-0" },
  { namespace: "aspect", utility: (token: string): string => `aspect-${token}`, core: "aspect-square" },
  { namespace: "blur", utility: (token: string): string => `blur-${token}`, core: "blur-none" },
  { namespace: "ease", utility: (token: string): string => `ease-${token}`, core: "ease-linear" },
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

const GOVERNED_FAMILY_AXES = [
  { family: "color", pair: ["bg-primary", "bg-secondary"] },
  { family: "spacing", pair: ["gap-block", "gap-tight"] },
  { family: "radius", pair: ["rounded-base", "rounded-card"] },
  { family: "aspect", pair: ["aspect-portrait", "aspect-banner"] },
  { family: "shadow", pair: ["shadow-overlay", "shadow-glow"] },
  { family: "blur", pair: ["blur-strength", "blur-fill-chrome"] },
  { family: "border-width", pair: ["border-hairline", "border-control"] },
  { family: "font", pair: ["font-sans", "font-mono"] },
  { family: "text", pair: ["text-title", "text-body"] },
  { family: "leading", pair: ["leading-title", "leading-body"] },
  { family: "tracking", pair: ["tracking-micro", "tracking-wide"] },
  { family: "container", pair: ["max-w-cq-sm", "max-w-cq-lg"] },
  { family: "width", pair: ["w-dialog-sm", "w-dialog-lg"] },
  { family: "ease", pair: ["ease-out-expo", "ease-linear"] },
] as const;

test("the later-wins matrix covers every governed family exactly once", () => {
  expect(GOVERNED_FAMILY_AXES.map(({ family }) => family)).toStrictEqual([...CSS_MERGE_FAMILY_NAMES]);
});

test.for(GOVERNED_FAMILY_AXES)("$family obeys later-wins in both argument orders", ({ pair: [first, second] }) => {
  expect(cn(first, second)).toBe(second);
  expect(cn(second, first)).toBe(first);
});

// The two fixed-box members minted by docs/design/integer-line-boxes.md: an unregistered leading name
// keeps BOTH classes and leaves the winner to stylesheet order (this file's founding defect), so each
// new member owes its own later-wins pin the moment it joins CUSTOM_CLASS_GROUPS.
// THE FIELD FAMILY WAS NEVER REGISTERED, AND IT SHIPPED A PLATFORM DEFECT (#2450). `font-size` and
// `leading` used to be HAND-LISTED here, and the list predated `text.field`/`text.field-dense` and their
// paired leadings — so `text-field` beside a real text COLOR was read as a second color and DROPPED.
// `Combobox` and `Autocomplete` spell exactly that (`… text-field leading-field text-foreground …`) and
// therefore painted NO field step, re-arming the iOS focus zoom #1868/#1872 had already fixed once. The
// three type scales are DERIVED from the token map now (the rule the spacing block always stated), so this
// case is BOTH the regression pin and the proof that a newly-minted type token is registered by existing.
test("every text/leading token is registered — an unlisted size beside a text COLOR used to be dropped (#2450)", () => {
  for (const size of ["text-field", "text-field-dense", "text-code-field"]) {
    expect(cn(size, "text-foreground"), `${size} must survive beside a text color`).toContain(size);
    expect(cn(size, "text-foreground"), "…and the color must survive too — different axes").toContain("text-foreground");
  }
  // …and they are ONE axis with the rest of the scale, so later-wins holds in both directions.
  expect(cn("text-body", "text-field")).toBe("text-field");
  expect(cn("text-field", "text-body")).toBe("text-body");
  expect(cn("leading-body", "leading-field")).toBe("leading-field");
  expect(cn("leading-code-field", "leading-label-relaxed")).toBe("leading-label-relaxed");
});

test("the fixed-box leading members (micro, label-relaxed) are governed", () => {
  expect(cn("leading-label-relaxed", "leading-micro")).toBe("leading-micro");
  expect(cn("leading-micro", "leading-label")).toBe("leading-label");
  expect(cn("leading-body", "leading-label-relaxed")).toBe("leading-label-relaxed");
});

test("modifier, important, postfix, and arbitrary candidates reach the configured merger", () => {
  expect(cn("hover:p-2", "hover:p-4")).toBe("hover:p-4");
  expect(cn("p-2!", "p-4!")).toBe("p-4!");
  expect(cn("text-title/6", "text-body/7")).toBe("text-body/7");
  expect(cn("w-[10px]", "w-[20px]")).toBe("w-[20px]");
});

function readOkTrace(): Extract<CssMergeTraceSnapshot, { status: "ok" }> {
  const snapshot = cssMergeTrace.read();
  if (snapshot.status !== "ok") {
    throw new Error(snapshot.error);
  }
  return snapshot;
}

test("the trace is disabled until a dev/test caller explicitly opts in", () => {
  expect(cssMergeTrace.read()).toMatchObject({ status: "instrument-error", error: expect.stringContaining("not enabled") });
});

test("the receipt preserves ordered occurrences and the exact custom-family loser to final winner", () => {
  cssMergeTrace.enable();
  expect(cn("aspect-portrait", "aspect-banner")).toBe("aspect-banner");
  const snapshot = readOkTrace();
  expect(snapshot.calls).toBe(1);
  expect(snapshot.receipts).toStrictEqual([
    {
      input: [
        { index: 0, className: "aspect-portrait" },
        { index: 1, className: "aspect-banner" },
      ],
      conflicts: [
        {
          axis: "orb:aspect",
          loser: { index: 0, className: "aspect-portrait" },
          winner: { index: 1, className: "aspect-banner" },
        },
      ],
      output: "aspect-banner",
    },
  ]);
});

test("reset clears an old conflict while retaining non-conflicting population", () => {
  cssMergeTrace.enable();
  cn("aspect-portrait", "aspect-banner");
  expect(readOkTrace().receipts).toHaveLength(1);
  cssMergeTrace.reset();
  expect(cn("aspect-portrait", "block")).toBe("aspect-portrait block");
  expect(readOkTrace()).toMatchObject({ calls: 1, conflictCalls: 0, receipts: [] });
});

test("duplicate receipts dedupe without erasing call and conflict population", () => {
  cssMergeTrace.enable();
  cn("p-2", "p-4");
  cn("p-2", "p-4");
  expect(readOkTrace()).toMatchObject({ calls: 2, conflictCalls: 2, deduplicatedConflictCalls: 1 });
  expect(readOkTrace().receipts).toHaveLength(1);
});

test("occurrence replay distinguishes duplicates and asymmetric padding conflicts", () => {
  cssMergeTrace.enable();
  expect(cn("p-2", "p-2")).toBe("p-2");
  expect(readOkTrace().receipts[0]?.conflicts[0]).toMatchObject({
    loser: { index: 0, className: "p-2" },
    winner: { index: 1, className: "p-2" },
  });

  cssMergeTrace.reset();
  expect(cn("pr-4", "px-2")).toBe("px-2");
  expect(readOkTrace().receipts[0]?.conflicts[0]).toMatchObject({
    loser: { index: 0, className: "pr-4" },
    winner: { index: 1, className: "px-2" },
  });

  cssMergeTrace.reset();
  expect(cn("px-2", "pr-4")).toBe("px-2 pr-4");
  expect(readOkTrace().receipts).toStrictEqual([]);
});

test("occurrence replay follows evictor chains to the final surviving winner", () => {
  cssMergeTrace.enable();
  expect(cn("p-2", "p-4", "p-6")).toBe("p-6");
  expect(readOkTrace().receipts[0]?.conflicts).toMatchObject([
    { loser: { index: 0, className: "p-2" }, winner: { index: 2, className: "p-6" } },
    { loser: { index: 1, className: "p-4" }, winner: { index: 2, className: "p-6" } },
  ]);
});

test("modifier and arbitrary conflicts retain occurrence-aware receipts", () => {
  cssMergeTrace.enable();
  expect(cn("hover:p-2", "hover:p-4")).toBe("hover:p-4");
  expect(readOkTrace().receipts[0]?.conflicts[0]).toMatchObject({
    axis: "tailwind-core",
    loser: { index: 0, className: "hover:p-2" },
    winner: { index: 1, className: "hover:p-4" },
  });

  cssMergeTrace.reset();
  expect(cn("w-[10px]", "w-[20px]")).toBe("w-[20px]");
  expect(readOkTrace().receipts[0]?.conflicts[0]).toMatchObject({
    axis: "tailwind-core",
    loser: { index: 0, className: "w-[10px]" },
    winner: { index: 1, className: "w-[20px]" },
  });
});

test("the trace fails loud when empty or beyond its occurrence replay bound", () => {
  cssMergeTrace.enable();
  expect(cssMergeTrace.read()).toMatchObject({ status: "instrument-error", error: expect.stringContaining("zero merge calls") });

  const overbound = Array.from({ length: CSS_MERGE_TRACE_INPUT_LIMIT + 1 }, () => "p-2");
  expect(cn(...overbound)).toBe("p-2");
  expect(cssMergeTrace.read()).toMatchObject({ status: "instrument-error", error: expect.stringContaining("replay limit") });
});

test("TV ordinary and slot results each reach Orb exactly once with their raw candidates", () => {
  const ordinary = tv({ base: "aspect-portrait", variants: { shape: { banner: "aspect-banner" } } });
  cssMergeTrace.enable();
  expect(ordinary({ shape: "banner" })).toBe("aspect-banner");
  expect(readOkTrace()).toMatchObject({ calls: 1 });
  expect(readOkTrace().receipts[0]?.input.map(({ className }) => className)).toStrictEqual(["aspect-portrait", "aspect-banner"]);

  const slotted = tv({ slots: { root: "blur-strength", icon: "ease-out-expo" } });
  const slots = slotted();
  cssMergeTrace.enable();
  expect(slots.root({ class: "blur-fill-chrome" })).toBe("blur-fill-chrome");
  expect(readOkTrace()).toMatchObject({ calls: 1 });
  expect(readOkTrace().receipts[0]?.input.map(({ className }) => className)).toStrictEqual(["blur-strength", "blur-fill-chrome"]);

  cssMergeTrace.reset();
  expect(slots.icon({ class: "ease-linear" })).toBe("ease-linear");
  expect(readOkTrace()).toMatchObject({ calls: 1 });
});

test("TV extension metadata and composed ordinary semantics survive the final-merge wrapper", () => {
  const parent = tv({ base: "p-2", variants: { tone: { warm: "aspect-portrait" } } });
  cssMergeTrace.enable();
  const child = tv({ extend: parent, base: "p-4", variants: { elevation: { glow: "shadow-glow" } } });
  expect(child({ tone: "warm", elevation: "glow" })).toBe("p-4 shadow-glow aspect-portrait");
  expect(readOkTrace()).toMatchObject({ calls: 1 });
});

test("TV preserves empty ordinary and slot return semantics", () => {
  expect(tv({})()).toBe("");
  expect(tv({ slots: { root: "" } })().root()).toBe("");
});
