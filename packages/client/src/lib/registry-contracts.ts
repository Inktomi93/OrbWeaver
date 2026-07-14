// Tier-4 contract home for the registry primitive (client-architecture-lockdown.md §6b/§6c) — the
// vocabulary-independent shapes a host feature and its cross-feature contributors both need (the CONTEXT
// model + a contributor tab def) without either importing the other. May import `@orb/contracts` types +
// the registry primitive; imports zero features. `SectionDefinition` itself lives in `#state` (it binds
// these shapes to the shell's SectionId/PanelMode vocabulary, which state owns — §5 rule 5).

import type { ReactNode } from "react";
import type { ContributorRegistry } from "./registry";

/** One CONTEXT-panel tab. `S` is the host section's OWN context-state projection — a real named type
 *  published by the host (never `any`/`unknown`/a loose index signature; O5 strict). A `void` host has
 *  no shared context state, so `when`/`body` take no argument. */
export interface ContextTabDef<S> {
  readonly id: string;
  readonly label: string;
  /** Absent = always visible. THE dynamic axis — subsumes chat's isHost/group/member conditionals. */
  readonly when?: (state: S) => boolean;
  readonly body: (state: S) => ReactNode;
}

/** A section's CONTEXT-panel model — the four legacy wirings (registry-tabs · chat's bespoke Tabs ·
 *  worldInfo's single body · refinery's nothing) unified. `kind:"none"` is an EXPLICIT decision, never
 *  an absence; a `tabs` host may also accept cross-feature contributions (§6c). */
export type ContextDefinition<S = void> =
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly body: () => ReactNode }
  | {
      readonly kind: "tabs";
      readonly tabs: readonly ContextTabDef<S>[];
      /** The cross-feature seam (§6c) — contributions render AFTER own tabs, same `when` gating. */
      readonly contributors?: ContributorRegistry<ContextTabDef<S>>;
    };
