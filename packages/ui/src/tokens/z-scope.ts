// The stacking SCOPE map — which z token may be consumed WHERE (#1794). Beside the scale it maps, because
// the scale (`tokens.json` `z.*`) is the only authority for the ORDER and this is the only authority for the
// REACH; a reader who has one without the other will make the mistake this file was minted from.
//
// WHY A SECOND FACT AT ALL. `packages/client/.../shell.css` spelled `--z-modal` on the mobile side-panel
// sheet from the phone arm's first commit. It was not a paint bug — `.shell-grid` is `isolation: isolate`,
// so the only boxes that number ordered were the shell's own children, and 50 sorted them exactly as 40
// does. It was a REACH claim the scope could not honour: a portal-tier rung named from inside a scope that
// cannot reach the portal. `no-raw-z-index` was green throughout, correctly — it proves the VOCABULARY
// (the seven names, set-equal against tokens.json), never the scope a name is legal in.
//
// THE THREE SCOPES, and the only asymmetry that matters:
//   · `in-context`  — a rung INSIDE whatever stacking context the element already sits in (a sticky
//                     attribution band over its own prose, a tab over its indicator, an art bleed under its
//                     card's ink). Legal everywhere; orders siblings, crosses nothing.
//   · `app-frame`   — the shell frame's own float rung, resolved inside `.shell-grid`'s isolated scope:
//                     side panels, the dismiss scrim one below them, the skip link, a drawer's closed-edge
//                     swipe area, an in-column floating bar. Legal everywhere; it can never out-paint a
//                     portal float, and it is not trying to.
//   · `portal-float` — a surface that leaves its subtree by MOUNT POSITION: portaled to
//                     `[data-slot="portal-root"]` (the shell grid's `display: contents` sibling) or mounted
//                     at the document root (the boot veil). Only there does the number decide anything
//                     cross-boundary, because only there is the element in the document's own context.
//
// THE RULE (one direction, and that is deliberate): a `portal-float` token consumed at a site that is NOT a
// portal-mounted / document-root float is a defect — it claims a reach its stacking scope cannot grant, and
// it reads to the next agent as "this beats dialogs", which it does not. The converse is fine: a portal
// float may spell `in-context`/`app-frame` rungs for its own internals (the dialog header's sticky
// `--z-raised`, the select's scroll arrows) — those order the float's own children and claim nothing.
//
// ENFORCEMENT TIERS, named so nobody reads one as the other:
//   · TYPE (live): `satisfies Record<ZTokenPath, ZStackingScope>` — a new `z.*` token regenerates
//     `TOKENS`, and a row missing here fails `tsc`. A scope is not optional metadata; it is minted with
//     the token.
//   · TEST (live): `tests/ui/styles/css-structure.suite.test.ts` reads `shell.css` — the ONE structural
//     shell stylesheet, and the file the drift lived in — and reds on any `portal-float` token in it,
//     with a planted positive control in the same test.
//   · GATE (SPEC ONLY, not built here — #1584's gate worker owns it): the TSX half. Every `z-(--z-<name>)`
//     class recipe under `packages/{client,ui}/src` whose token is `portal-float` must sit in a module that
//     is a portal-mounted float. The honest discriminator is not "is this file a primitive" but "does this
//     element mount outside its subtree": today's whole population is the `positioner`/`viewport`/`backdrop`
//     slots of the overlay primitives (alert-dialog · autocomplete · combobox · dialog · drawer · menu ·
//     popover · select · toast · tooltip), the two shared recipes those slots compose (`lib/popup-surface.ts`,
//     `lib/scrim.ts`), and `art/web-weave`'s boot veil (a document-root `fixed inset-0`) — enumerated
//     2026-09-06, so re-derive it rather than trusting this list. A gate should key on the SLOT NAME the recipe feeds (positioner ·
//     viewport · backdrop · popup) or on an explicit `/** @portal-float */` marker beside the recipe, and
//     must NOT key on the package or the directory — `shell.css` is client CSS and `web-weave` is ui TSX,
//     and both answers would be wrong. Note the CSS half is deliberately left to the test tier above:
//     the gate corpus is ts-morph over TSX and does not parse stylesheets.

import type { TokenPath } from "./index.ts";

/** Every `z.*` path in the generated scale, derived — never a hand-spelled union that can drift from it. */
export type ZTokenPath = Extract<TokenPath, `z.${string}`>;

/** The axis, homed ONCE as a tuple so the union derives and a reader (or the future gate) can enumerate
 *  it. See the header for the rule each value carries. */
export const Z_STACKING_SCOPES = ["app-frame", "in-context", "portal-float"] as const;

/** Where a rung is allowed to be spelled. */
export type ZStackingScope = (typeof Z_STACKING_SCOPES)[number];

/** The map. TOTAL by `satisfies`: a new z token that declares no scope fails the typecheck. */
export const Z_TOKEN_SCOPES = {
  "z.base": "in-context",
  "z.raised": "in-context",
  "z.overlay": "app-frame",
  "z.modal": "portal-float",
  "z.popover": "portal-float",
  "z.toast": "portal-float",
  "z.tooltip": "portal-float",
} as const satisfies Record<ZTokenPath, ZStackingScope>;

/** `--z-overlay` → `z.overlay`, for a consumer holding the CSS custom property rather than the token path
 *  (a stylesheet reader, the future gate's class-recipe arm). Returns `undefined` for an unknown name —
 *  which is itself a finding: an unknown `--z-*` resolves to no declaration at all. */
export function zScopeOfCssVar(cssVar: string): ZStackingScope | undefined {
  const path = cssVar.replace(/^--z-/u, "z.");
  return path in Z_TOKEN_SCOPES ? Z_TOKEN_SCOPES[path as ZTokenPath] : undefined;
}
