// The float-portal container seam — keeps anchored floats inside the active theme scope. Base UI's
// Portal defaults to `<body>`, outside the app-shell `<ThemeScope>`, so this context is a provider the
// shell wires with the themed portal root; every float seal reads it as its Portal default.
import type { RefObject } from "react";
import { createContext, useContext } from "react";

// ShadowRoot resolved conditionally off globalThis: the root typecheck:graph program is DOM-less, and a
// bare `ShadowRoot` is TS2304 there; this infer yields the real DOM type when lib.dom is present, else never.
// biome-ignore lint/style/useNamingConvention: matches the GLOBAL `ShadowRoot` constructor name — the whole point of the probe.
type MaybeShadowRoot = typeof globalThis extends { ShadowRoot: new () => infer T } ? T : never;

// The sentinel is `undefined`, never `null` — floating-ui treats `container={null}` as "pending" and waits.
export type PortalContainer =
  | HTMLElement
  | MaybeShadowRoot
  | RefObject<HTMLElement | MaybeShadowRoot | null>
  | undefined;

export const PortalContainerContext = createContext<PortalContainer>(undefined);

/** A float seal prefers its own explicit `container` prop, then this, then Base UI's `<body>` default. */
export function usePortalContainer(): PortalContainer {
  return useContext(PortalContainerContext);
}
