// The overlay scrim's STRUCTURAL pin (#1871 item 1b, owed by `packages/ui/src/lib/scrim.ts`'s own header
// since #1868 landed primitives + CSS only).
//
// WHY THIS IS NOT A CT, and it is a property of the subject rather than a shortcut: the iOS arm is
// `supports-[-webkit-touch-callout:none]:absolute`, and `-webkit-touch-callout` is a WEBKIT-ONLY property
// chosen (by Base UI, whose backdrops we match) precisely as a "is this WebKit" test. Every browser this
// repo drives — CT, snap, design-audit — is Chromium, which resolves that `@supports` block FALSE and
// renders the byte-identical `fixed` box it always did. A CT asserting the computed `position` would pass
// on a tree with the arm DELETED, i.e. it would be a green test proving nothing, which is worse than none.
// So the honest assertion is over the authored recipe and its reach.
//
// WHAT THE ARM BUYS: a `position: fixed` backdrop is laid against the LAYOUT viewport, and on iOS 26 that
// can be shorter than what the reader is actually looking at once browser chrome collapses — leaving an
// undimmed strip at the edge of every overlay. `absolute` beds the backdrop in the document instead, and
// `min-h-dvh` is what makes that box tall enough to be worth bedding.
//
// HOME: the mirror (`packages/ui/src/lib/scrim.ts` -> `tests/ui/lib/scrim.test.ts`, constitution §0.2).
// scrim.ts's header pointed at `tests/ui/styles/css-structure.suite.test.ts` instead; that file's subject
// is raw CSS TEXT in stylesheets, and `SCRIM_BASE` is a TypeScript constant, so the pointer named the
// wrong home. It is retired in the same commit as this file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCRIM, SCRIM_BASE } from "@orb/ui/lib";
import { expect, test } from "../../support/fixtures.ts";

/** Each fragment with the reason it is load-bearing — a failure names the defect, not a diff. */
const REQUIRED_FRAGMENTS: readonly (readonly [fragment: string, why: string])[] = [
  ["fixed", "the default bedding: a backdrop is laid against the layout viewport everywhere but iOS 26 WebKit"],
  ["inset-0", "full-bleed — a scrim that does not cover leaves undimmed page visible behind the overlay"],
  ["min-h-dvh", "the box has to be as tall as the VISUAL viewport for the `absolute` arm below to be worth bedding"],
  [
    "supports-[-webkit-touch-callout:none]:absolute",
    "THE iOS 26 ARM (#1868): WebKit-only @supports as the UA test, flipping the backdrop to document-bedded so collapsing browser chrome cannot expose an undimmed strip. Chromium resolves it false, so no rendered test in this repo can see it",
  ],
];

const UI_SRC = join(import.meta.dirname, "../../../packages/ui/src");
/** ONE STRING, SIX OVERLAYS — every backdrop slot in the sealed package, by construction. */
const BACKDROP_VARIANTS: readonly string[] = [
  "primitives/alert-dialog/variants.ts",
  "primitives/dialog/variants.ts",
  "primitives/drawer/variants.ts",
  "primitives/menu/variants.ts",
  "primitives/popover/variants.ts",
  "primitives/select/variants.ts",
];

function uiSource(relative: string): string {
  return readFileSync(join(UI_SRC, relative), "utf8");
}

/** Code only. A variants module's HEADER legitimately names `bg-backdrop` while explaining which recipe it
 *  composes (drawer's does), and a prose mention is not a second spelling of the fill. */
function uiCode(relative: string): string {
  return uiSource(relative)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:])\/\/[^\n]*/gu, "$1");
}

test("SCRIM_BASE carries every fragment the backdrop contract depends on, iOS arm included", () => {
  const missing = REQUIRED_FRAGMENTS.filter(([fragment]) => !SCRIM_BASE.includes(fragment)).map(([fragment, why]) => `${fragment} — ${why}`);
  expect(missing, `SCRIM_BASE is "${SCRIM_BASE}"`).toEqual([]);
});

test("both SCRIM tiers embed SCRIM_BASE verbatim — a tier cannot compose its own full-bleed fill and drop the arm", () => {
  for (const tier of ["popover", "modal"] as const) {
    expect(SCRIM(tier), `SCRIM("${tier}") must start from the shared base`).toContain(SCRIM_BASE);
  }
  // The tiers still DIFFER (z + fade), so this is not asserting that the two are the same string.
  expect(SCRIM("popover")).not.toBe(SCRIM("modal"));
});

// THE REACH HALF, and it is the one that actually protects the six overlays: the arm lands on all of them
// only because every backdrop slot goes through this one recipe. A seal that hand-spells its own
// `fixed inset-0 bg-backdrop` would render identically in Chromium and lose the iOS arm silently.
test("every sealed backdrop slot reaches the shared recipe, and no @orb/ui module re-spells the dimming fill", () => {
  const notReaching = BACKDROP_VARIANTS.filter((relative) => !/\bSCRIM(_BASE)?\b/u.test(uiSource(relative)));
  expect(notReaching, "a backdrop variants module that names neither SCRIM nor SCRIM_BASE has rolled its own").toEqual([]);

  // POSITIVE CONTROL for the sweep above: it must have READ six real files whose text mentions `backdrop`.
  // Without this a renamed/moved variants module would make the filter vacuously empty and read as clean.
  const populated = BACKDROP_VARIANTS.filter((relative) => uiSource(relative).includes("backdrop"));
  expect(populated, "the sweep's population — a path that stopped existing or stopped owning a backdrop must fail here, not pass silently").toEqual([
    ...BACKDROP_VARIANTS,
  ]);

  // …and the dimming token itself is spelled in exactly one place. `bg-backdrop` elsewhere in the sealed
  // package is a second scrim recipe by definition (D43 §11.4 homes the token here).
  const respellers = BACKDROP_VARIANTS.filter((relative) => uiCode(relative).includes("bg-backdrop"));
  expect(respellers, "bg-backdrop belongs to lib/scrim.ts alone").toEqual([]);
});
