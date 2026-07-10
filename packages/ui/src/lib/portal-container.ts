// The float-portal container seam (D44 §12.1) — the ONE mechanism that keeps anchored floats inside the
// active theme scope. Base UI's Portal defaults to `<body>`, OUTSIDE the app-shell `<ThemeScope>`, so a
// popover/menu/select/tooltip/autocomplete/combobox popup would inherit Hearth defaults under a custom
// theme (the persona-panel "unthemed float" defect). Base UI ships no public provider to set a default
// portal container (its `usePortalContext` is internal + read-only), so THIS context is that provider:
// the shell renders the THEMED portal root (a node INSIDE `<ThemeScope>`) and hands its ref to
// `<PortalContainerContext.Provider>`; every float seal reads it as its Portal default, so the popup
// portals into the themed node instead of `<body>`. Unprovided (CTs, bare mounts) => `null` => floats
// keep Base UI's `<body>` default, unchanged. A context (not a component wrapper) so this stays a pure
// non-component module the consumers render `.Provider` on directly.
import type { RefObject } from "react";
import { createContext, useContext } from "react";

// ShadowRoot resolved CONDITIONALLY off globalThis, not named bare: this module rides ui's `#lib`
// barrel, which node-lane tests reach transitively (clamp.ts et al.), and the root typecheck:graph
// program is deliberately DOM-LESS (lib.dom breaks server BodyInit — 2026-06-28). A bare `ShadowRoot`
// is TS2304 there; this infer yields the real DOM type when the program has lib.dom and `never` when
// it doesn't (the never arm simply drops out of the union — nothing in a node program constructs one).
// biome-ignore lint/style/useNamingConvention: matches the GLOBAL `ShadowRoot` constructor name — the whole point of the probe.
type MaybeShadowRoot = typeof globalThis extends { ShadowRoot: new () => infer T } ? T : never;

/**
 * A Base UI Portal target — an element, a shadow root, or a ref to one (structurally identical to Base
 * UI's Portal `container` prop, so it threads straight into `<X.Portal container={…}>`). A ref is the
 * shell's case: the themed node mounts after first paint, and Base UI reads `.current` in an effect.
 * `undefined` (no provider) leaves the Portal at Base UI's `body` default. NOTE the sentinel is
 * `undefined`, never `null`: floating-ui treats an explicit `container={null}` as "a container is
 * pending" and WAITS (the popup never mounts) — so unset must stay `undefined`.
 */
export type PortalContainer =
  | HTMLElement
  | MaybeShadowRoot
  | RefObject<HTMLElement | MaybeShadowRoot | null>
  | undefined;

/** The default float Portal target. The app shell wraps its tree in `.Provider` with the THEMED portal
 *  root; every float seal reads it via {@link usePortalContainer}. `undefined` (default) means `body`. */
export const PortalContainerContext = createContext<PortalContainer>(undefined);

/** The default float Portal target from context (`undefined` with no provider) — a float seal prefers
 *  its own explicit `container` prop, then this, then Base UI's `<body>` default. */
export function usePortalContainer(): PortalContainer {
  return useContext(PortalContainerContext);
}
