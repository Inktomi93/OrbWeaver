// The ONE tailwind-merge configuration in the repo, and BOTH seams that ride it: `cn` (the class
// merger) and `tv` (the variant factory). They live in one module because they must share one config
// object — the whole defect class below is what happens when they don't.
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
// Enforcers (a prose-only boundary is a wish — AGENTS §2.3): `tailwind-merge` is dep-cruiser-sealed to
// this file (`ui-class-merge-seal`), and biome's `noRestrictedImports` bans the named imports
// `cn`/`cnMerge`/`tv` from "tailwind-variants" repo-wide. `createTV` stays importable precisely so this
// sanctioned home needs zero exemptions.
import { extendTailwindMerge } from "tailwind-merge";
import type { CnOptions, CnReturn } from "tailwind-variants";
import { createTV, cx } from "tailwind-variants";
import { TOKENS } from "#tokens";

// The DTCG type-scale utilities are custom `--text-*`/`--leading-*`/`--tracking-*` namespaces, so
// tailwind-merge cannot classify them: it reads `text-title` as a text COLOR (dropping the size beside
// a real color class), and does not know `leading-body` conflicts with core `leading-tight` (keeping
// BOTH, leaving the winner to stylesheet source order, i.e. luck). The four-voice grammar
// (primitives/text/variants.ts) rides exactly this override — a voice re-spells leading/tracking over
// the size default — so an unregistered group is a silently-wrong line-height, not a lint nit.
const CUSTOM_CLASS_GROUPS = {
  "font-size": [{ text: ["display", "headline", "title", "body", "label", "code", "micro"] }],
  leading: [{ leading: ["display", "headline", "title", "body", "label"] }],
  tracking: [{ tracking: ["micro"] }],
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

const CLASS_GROUPS = { ...CUSTOM_CLASS_GROUPS, w: [{ w: WIDTH_SCALE }] };
const THEME = { spacing: SPACING_SCALE, radius: RADIUS_SCALE, container: CONTAINER_SCALE };

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
  // `|| undefined` not `??`: tailwind-merge returns "" for an all-dropped list, and the contract is
  // undefined-when-empty (a `className=""` attribute would otherwise appear where none did before).
  return mergeClasses(joined) || undefined;
}

/** The variant factory — a `createTV`-CONFIGURED one, never tailwind-variants' bare `tv` export. */
export const tv = createTV({
  twMergeConfig: { extend: { classGroups: CLASS_GROUPS, theme: THEME } },
});
