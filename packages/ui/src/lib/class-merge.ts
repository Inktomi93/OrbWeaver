// The ONE tailwind-merge configuration and the TWO seams that ride it: `cn` and `tv`. Tailwind
// Variants composes raw ordinary/slot candidates with its internal merge disabled; Orb applies one
// configured final merge so the receipt sees the same candidates that decide the rendered output.
//
// WHY THIS FILE EXISTS (2026-08-02 root-fix). `@orb/ui/lib` used to re-export tailwind-variants' own
// `cn`, and configure the merger only through `createTV`. tailwind-variants keeps the twMerge config in
// MODULE-LEVEL MUTABLE STATE (`state.cachedTwMergeConfig`, dist/chunk-RZF76H2U.js) that `createTV`
// alone does NOT prime — it is written the first time a tv-built variants factory is actually CALLED.
// So the raw `cn` merged with an UNCONFIGURED tailwind-merge for as long as no variants module had run,
// and with the configured one afterwards: identical source, different result, decided by import-graph
// order. The failure is silent and visual — `cn("text-title", "text-muted-foreground")` returned only
// the color, because an unconfigured tailwind-merge reads the custom `--text-*` DTCG utilities as text
// COLORS and drops the size as a conflict. Building `cn` on our OWN configured merger makes the
// unconfigured one unrepresentable: there is no shared state left to lose a race with.
//
// Enforcers (a prose-only boundary is a wish — constitution §2): dep-cruiser seals both tailwind-merge and
// runtime tailwind-variants imports to this file. Type-only VariantProps imports remain legal.
import { extendTailwindMerge } from "tailwind-merge";
import type { CnOptions, CnReturn, TV } from "tailwind-variants";
import { createTV, cx } from "tailwind-variants";
import { TOKENS } from "#tokens";
import type { CssMergeClassification } from "./css-merge-contract.ts";

export const CSS_MERGE_FAMILY_NAMES = [
  "color",
  "spacing",
  "radius",
  "aspect",
  "shadow",
  "blur",
  "border-width",
  "font",
  "text",
  "leading",
  "tracking",
  "container",
  "width",
  "ease",
] as const;

// The DTCG type-scale utilities are custom `--text-*`/`--leading-*`/`--tracking-*` namespaces, so
// tailwind-merge cannot classify them: it reads `text-title` as a text COLOR (dropping the size beside
// a real color class), and does not know `leading-body` conflicts with core `leading-tight` (keeping
// BOTH, leaving the winner to stylesheet source order, i.e. luck). The four-voice grammar
// (primitives/text/variants.ts) rides exactly this override — a voice re-spells leading/tracking over
// the size default — so an unregistered group is a silently-wrong line-height, not a lint nit.
// THE THREE TYPE SCALES ARE DERIVED, NOT HAND-LISTED (#2450) — the rule the spacing block below states in
// full ("a token added to `tokens.json` is registered by existing"), finally applied to the namespaces that
// were written before it. The hand-lists here were missing `text-field` / `text-field-dense` and
// `leading-field` / `leading-field-dense` the whole time they existed, and the cost was not hypothetical: an
// unregistered size beside a real text COLOR is read as a second color and DROPPED, so `Combobox` and
// `Autocomplete` — whose control class lists end `… text-field leading-field text-foreground …` — painted
// no field step at all and re-armed the iOS focus zoom this repo had already fixed once (#1868/#1872).
// `Input` escaped only because its class lists carry no `text-<color>`. Deriving closes the class AND
// registers `text.code-field` / `leading.code-field` without a second edit.
const CUSTOM_CLASS_GROUPS = {
  "font-size": [{ text: scaleOf("text") }],
  leading: [{ leading: scaleOf("leading") }],
  tracking: [{ tracking: scaleOf("tracking") }],
};

// THE SPACING SCALE (#146) — the same defect, one namespace wider. `--spacing-*` is a Tailwind THEME
// namespace, not a single utility family: it feeds `gap`/`gap-x`/`gap-y`, every `p`/`m` side and axis,
// `w`/`h`/`size`/`min-*`/`max-*`, `inset`/`top`…, `space-x|y`, `scroll-m*`/`scroll-p*` and `translate`.
// tailwind-merge's default spacing scale is `["px", isNumber]`, so `gap-tight` is opaque to it and
// survives beside `gap-field` — the winner then being whichever class Tailwind emitted LAST, which is
// alphabetical within the family and has nothing to do with which layer meant to override which. Two
// live instances were rendering right only by that accident (`CHIP_BOX`'s `gap-tight` over the control
// primitives' `gap-field` base; the `Section` root's `gap-tight` over its own `gap-block`), and one was
// rendering WRONG (the Tabs `stacked` arm's `gap-0` losing to the tab base's `gap-field`).
//
// So this extends the THEME entry rather than enumerating class groups: one registration, every group
// Tailwind itself derives from the namespace — registering only `gap` would leave the identical latent
// bug in padding, in the sealed control HEIGHTS, and in every family added later. The scale is DERIVED
// from the generated token map, so a token added to `tokens.json` is registered by existing; the
// completeness pin is `tests/ui/lib/class-merge.test.ts`.
/** Every token name under one DTCG namespace, e.g. `radius.control` → `control`. The scale is DERIVED,
 *  never hand-listed: a token added to `tokens.json` is registered by existing. */
function scaleOf(namespace: string): string[] {
  const prefix = `${namespace}.`;
  return Object.keys(TOKENS)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
}

const SPACING_SCALE = scaleOf("spacing");

// THE OTHER CUSTOM NAMESPACES (#169) — the same latent defect, one namespace at a time.
//
// `--radius-*` feeds `rounded` and every corner/side variant of it. Live instance: Button's and Toggle's
// `shape` axis (`rounded-control` vs `rounded-full`) and Card's `elevated`/`nested` arms over its
// `rounded-base` — all of which kept BOTH classes and were decided by the emitted stylesheet's order.
const RADIUS_SCALE = scaleOf("radius");
// `--container-*` feeds `w`/`min-w`/`max-w`/`basis` (the `max-w-cq-*` container-query steps).
const CONTAINER_SCALE = scaleOf("container");
// `--width-*` is the odd one out and is NOT a theme registration: tailwind-merge 3.6 has no `width` key
// in `DefaultThemeGroupIds` (a `theme.width` entry would be an inert no-op), and the v4.3 engine emits
// `w-<name>` for this namespace but NOT `max-w-<name>`/`min-w-<name>` — probed, not assumed. So the one
// group it can conflict in is `w`, and it registers as a classGroup extension (which CONCATS onto the
// built-in `w` group, `mergeArrayProperties`), still derived from the token map.
const WIDTH_SCALE = scaleOf("width");
const ASPECT_SCALE = scaleOf("aspect");
const BLUR_SCALE = scaleOf("blur");
const EASE_SCALE = scaleOf("ease");

const CLASS_GROUPS = { ...CUSTOM_CLASS_GROUPS, w: [{ w: WIDTH_SCALE }] };
const THEME = {
  spacing: SPACING_SCALE,
  radius: RADIUS_SCALE,
  container: CONTAINER_SCALE,
  aspect: ASPECT_SCALE,
  blur: BLUR_SCALE,
  ease: EASE_SCALE,
};

const FAMILY_TOKEN_NAMES = CSS_MERGE_FAMILY_NAMES.map((family) => ({ family, tokens: scaleOf(family) }));

function hasFamilyToken(className: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => className.endsWith(`-${token}`));
}

function conflictAxis(loser: string, winner: string): string {
  for (const family of FAMILY_TOKEN_NAMES) {
    if (hasFamilyToken(loser, family.tokens) || hasFamilyToken(winner, family.tokens)) {
      return `orb:${family.family}`;
    }
  }
  return "tailwind-core";
}

// CROSS-GROUP EVICTION — the #2450 defect made detectable (#2460).
//
// `conflictAxis` above answers "which orb family is this conflict ABOUT", and it tags a pair `orb:<family>`
// when EITHER side carries a family token. That made a scale-vs-COLOR eviction — `text-field` dropped by
// `text-foreground`, because `text-field` was unregistered and tailwind-merge read it as a second text
// COLOR — indistinguishable from a legitimate size-over-size override, so the trace filed it as a normal
// receipt and #2450 shipped. An eviction ACROSS class groups is not an override at all: it is the merger
// mis-classifying a utility, and the rendered result is a declaration that silently never paints.
//
// THE DISCRIMINATOR IS COLOR-NESS UNDER A SHARED UTILITY PREFIX, not "one side carries a scale token".
// The broader reading is unusable: a custom token overriding a CORE keyword on the same axis (`gap-block`
// over `gap-0`, `h-control-sm` over `h-auto`, `rounded-control` over `rounded-none`, `leading-body` over
// `leading-tight`) also has a token on exactly one side, and every one of those is a LEGITIMATE override
// this repo's suite pins by name. What cannot be legitimate is an eviction between a color utility and a
// non-color one: Tailwind's color groups (text-color, bg-color, border-color, …) conflict only with
// themselves, so if the merger made one evict the other it has put them in one group by mistake.
//
// Both sides must share a color-capable prefix, because that is the only place the two vocabularies meet —
// `text-` is font-size AND text-color, `border-` is width AND color. An arbitrary value (`bg-[#fff]`) is
// unclassifiable from the class name alone and is left to the ordinary conflict arm rather than guessed at.
const COLOR_CAPABLE_PREFIXES = ["inset-ring", "inset-shadow", "text", "bg", "border", "outline", "ring", "shadow", "decoration", "divide", "stroke"] as const;
// Tailwind's own color vocabulary. Recognizing it is what keeps a core-color override (`text-red-500`
// dropped by `text-foreground`) out of the instrument-error arm — both sides are colors, one group.
const CORE_COLOR_NAMES = new Set(["current", "inherit", "transparent", "black", "white"]);
const CORE_PALETTE_STEP = /^[a-z]+-\d{2,3}$/u;
const COLOR_TOKEN_NAMES = new Set(scaleOf("color"));

/** `hover:text-foreground/50!` → `text-foreground`: the merge groups a class by its base utility, so the
 *  modifier prefix, the important marker and the opacity postfix are all stripped before classification. */
function baseUtility(className: string): string {
  const afterModifiers = className.slice(className.lastIndexOf(":") + 1);
  const withoutImportant = afterModifiers.startsWith("!") ? afterModifiers.slice(1) : afterModifiers.replace(/!$/u, "");
  const slash = withoutImportant.indexOf("/");
  return slash === -1 ? withoutImportant : withoutImportant.slice(0, slash);
}

/** The longest color-capable prefix this class is built on, or `undefined` when it is on none of them or
 *  carries an arbitrary value (which the class name cannot classify). */
function colorCapableSplit(className: string): { readonly prefix: string; readonly name: string } | undefined {
  const base = baseUtility(className);
  if (base.includes("[")) {
    return;
  }
  let found: { readonly prefix: string; readonly name: string } | undefined;
  for (const prefix of COLOR_CAPABLE_PREFIXES) {
    if (base.startsWith(`${prefix}-`) && (found === undefined || prefix.length > found.prefix.length)) {
      found = { prefix, name: base.slice(prefix.length + 1) };
    }
  }
  return found;
}

function isColorName(name: string): boolean {
  return COLOR_TOKEN_NAMES.has(name) || CORE_COLOR_NAMES.has(name) || CORE_PALETTE_STEP.test(name);
}

function classifyConflict(loser: string, winner: string): CssMergeClassification {
  const loserSplit = colorCapableSplit(loser);
  const winnerSplit = colorCapableSplit(winner);
  if (loserSplit !== undefined && winnerSplit !== undefined && loserSplit.prefix === winnerSplit.prefix) {
    const loserIsColor = isColorName(loserSplit.name);
    if (loserIsColor !== isColorName(winnerSplit.name)) {
      const color = loserIsColor ? loser : winner;
      const other = loserIsColor ? winner : loser;
      return {
        kind: "cross-group",
        detail: `cross-group eviction under the "${loserSplit.prefix}-" prefix: "${loser}" was evicted by "${winner}" — "${color}" is a COLOR utility and "${other}" is not, so they are different Tailwind class groups and BOTH must survive. The merger is mis-classifying one of them (an unregistered custom token reads as a color — #2450).`,
      };
    }
  }
  return { kind: "conflict", axis: conflictAxis(loser, winner) };
}

type MergeClassList = (classList: string) => string;
type ClassifyConflict = (loser: string, winner: string) => CssMergeClassification;
type CssMergeObserver = (classList: string, output: string, merge: MergeClassList, classify: ClassifyConflict) => void;

let cssMergeObserver: CssMergeObserver | undefined;

/** Dev/test instrumentation registers here; production keeps no trace implementation in its graph. */
export function setCssMergeObserver(observer: CssMergeObserver): void {
  cssMergeObserver = observer;
}

/** The configured tailwind-merge instance — built once, at module scope, from the customizations above. */
const mergeClasses = extendTailwindMerge({
  extend: { classGroups: CLASS_GROUPS, theme: THEME },
});

/**
 * Join class values (strings / arrays / `{cls: cond}` objects, like clsx) and resolve Tailwind
 * conflicts through the CONFIGURED merger. Returns `undefined` for an empty result — the exact
 * contract tailwind-variants' `cn` had, so this is a drop-in for every existing call site.
 */
export function cn(...classes: CnOptions): CnReturn {
  const joined = cx(...classes);
  if (joined === undefined) {
    return;
  }
  const output = mergeClasses(joined);
  cssMergeObserver?.(joined, output, mergeClasses, classifyConflict);
  // `|| undefined` not `??`: tailwind-merge returns "" for an all-dropped list, and the contract is
  // undefined-when-empty (a `className=""` attribute would otherwise appear where none did before).
  return output || undefined;
}

type RuntimeSlots = Readonly<Record<string, (...args: unknown[]) => string>>;
type RuntimeVariantResult = string | RuntimeSlots | undefined;
type RuntimeVariantComponent = ((...args: unknown[]) => RuntimeVariantResult) & Readonly<Record<string, unknown>>;

const composeVariants = createTV({ twMerge: false });

function finalizeVariantResult(result: RuntimeVariantResult): string | RuntimeSlots {
  if (typeof result === "string" || result === undefined) {
    // Tailwind Variants' public TV contract returns `string`, including an empty recipe. `cn` keeps its
    // own undefined-when-empty contract, so normalize only at this adapter boundary instead of lying to
    // TypeScript about TV's return shape.
    return cn(result) ?? "";
  }
  const slots: Record<string, (...args: unknown[]) => string> = {};
  for (const [slot, render] of Object.entries(result)) {
    slots[slot] = (...args: unknown[]): string => cn(render(...args)) ?? "";
  }
  return slots;
}

function wrapVariantComponent<Component extends RuntimeVariantComponent>(component: Component): Component {
  // Proxy preserves Tailwind Variants' generic callable type and attached recipe metadata while routing
  // every invocation through Orb's configured final merge. A cast here would erase the API mismatch that
  // caught the old undefined return; the platform's Proxy type keeps Component exact.
  return new Proxy(component, {
    apply(target, thisArg, args): RuntimeVariantResult {
      return finalizeVariantResult(Reflect.apply(target, thisArg, args));
    },
  });
}

/** Tailwind Variants composes raw candidates; every returned ordinary/slot string gets one Orb merge. */
export const tv: TV = new Proxy(composeVariants, {
  apply(target, thisArg, args): RuntimeVariantComponent {
    return wrapVariantComponent(Reflect.apply(target, thisArg, args));
  },
});
