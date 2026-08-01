// Surface — the ONE writer of `data-surface-tier` (density-pass-spec.md §4.1). A surface declares which
// of the two density tiers its subtree is (`instrument` = read-mostly, scanned, dense · `form` =
// write-mostly, one decision per row, airy); `styles/tiers.css` turns that attribute into the island
// padding/radius every primitive underneath resolves. Features therefore never express island spacing or
// radius at all — the D44 impossible-by-construction pattern.
//
// Why an ATTRIBUTE and not a prop/context: `no-layout-context-props` bans `density`/`compact`/`inDrawer`
// props and UI-Architecture-and-Layout §4 states density is the `data-*` axis. This is the SURFACE-CLASS
// axis; the user-pref `data-density="comfortable|compact"` axis is orthogonal and untouched (D9).
//
// `display: contents` is load-bearing, not a style choice: a tier declaration must be droppable anywhere
// (a pane root already inside a flex/grid height chain) without adding a box that breaks it. The attribute
// still resolves for the whole subtree — custom properties and descendant selectors are unaffected by
// `display: contents`. Element choice is deliberately limited to the two semantics-free intrinsics so the
// contents display can never strip a role from the a11y tree.
import type { ComponentProps, ReactElement } from "react";

const SURFACE_ELEMENTS = { div: "div", span: "span" } as const;
type SurfaceElement = keyof typeof SURFACE_ELEMENTS;

/** The two density tiers (density-pass-spec.md §3) — a surface has exactly one. */
export type SurfaceTier = "instrument" | "form";

export interface SurfaceProps extends Omit<ComponentProps<"div">, "className"> {
  /** REQUIRED — there is no default tier: an unclassified surface is the defect this primitive exists to end. */
  tier: SurfaceTier;
  /** @defaultValue "div" — `span` for a tier declaration inside phrasing content. */
  as?: SurfaceElement;
}

/**
 * Declares its subtree's density tier (density-pass-spec.md §3.1).
 *
 * Usage: `<Surface tier="instrument">…a list pane / context panel…</Surface>` ·
 * `<Surface tier="form">…a settings pane / editor / dialog body…</Surface>`.
 *
 * Nesting the OTHER tier is legal and common (a form island inside an instrument surface); the tier steps
 * ride inherited custom properties, so the nearest ancestor always wins. Nesting the SAME tier means
 * someone wrapped for no reason.
 */
export function Surface({ tier, as = "div", ...props }: SurfaceProps): ReactElement {
  const Component = SURFACE_ELEMENTS[as];
  return <Component {...props} className="contents" data-surface-tier={tier} />;
}
