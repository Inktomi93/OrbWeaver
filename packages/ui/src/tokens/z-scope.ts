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
// The nonempty source-key constraint requires every token to declare its scope before generation.

/** Every `z.*` path in the canonical source, without loading the vault at runtime. */
export type ZTokenPath = `z.${keyof typeof import("./tokens.json").z}`;

/** The axis, homed ONCE as a tuple so the union derives and a reader can enumerate
 *  it. See the header for the rule each value carries. */
export const Z_STACKING_SCOPES = ["app-frame", "in-context", "portal-float"] as const;

/** Where a rung is allowed to be spelled. */
export type ZStackingScope = (typeof Z_STACKING_SCOPES)[number];

/** Total over a nonempty source: `Record<never, ...>` alone would accept a stale map after all keys vanish. */
export const Z_TOKEN_SCOPES = {
  "z.base": "in-context",
  "z.raised": "in-context",
  "z.overlay": "app-frame",
  "z.modal": "portal-float",
  "z.popover": "portal-float",
  "z.toast": "portal-float",
  "z.tooltip": "portal-float",
} as const satisfies ZTokenPath extends never ? never : Record<ZTokenPath, ZStackingScope>;
