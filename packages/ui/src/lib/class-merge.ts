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

/** The configured tailwind-merge instance — built once, at module scope, from CUSTOM_CLASS_GROUPS. */
const mergeClasses = extendTailwindMerge({ extend: { classGroups: CUSTOM_CLASS_GROUPS } });

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
export const tv = createTV({ twMergeConfig: { extend: { classGroups: CUSTOM_CLASS_GROUPS } } });
