// The SETTING-ROW ANNOTATION seam (#932 E5 / #927) — how a config row's registry-owned prose reaches the
// `<Field>` that owns the label it annotates.
//
// WHY A CONTEXT AND NOT A PROP. The row (`SettingRow`) knows the leaf's `teach`; the `<Field>` owns the
// label, the `aria-describedby` wiring and the label-adjacent `HintTrigger` slot (#927) — and the two are
// separated by the call site's `form.AppField` render prop, which is the section author's code and must
// not have to thread prose it does not own. So the row PUBLISHES and `useBoundField` (the ONE home for the
// `<Field>` prop bundle, sealed by the `bound-field-via-hook` gate) CONSUMES. Exactly one bound field per
// row may consume it, which is why `SettingRow` re-provides `null` around any secondary content it hosts.
//
// HOMED IN `#state`, not `#components`: `forms/` may reach `state/` and `lib/` and nothing else
// (`client-forms-direction`), so a context living beside the row component would be an illegal import for
// the consumer that needs it. It is vocabulary, not a store — the `configSectionRegistryContext`
// precedent, minus the registry.
//
// NULL IS THE ORDINARY CASE. Every bound field outside a config `SettingRow` reads `null` and renders
// byte-identically to before; a null is "this field carries no registry annotation", never an error.

import type { ReactNode } from "react";
import { createContext, use } from "react";

/** One config row's registry-owned annotation, resolved from the leaf's `teach` by the row. */
export interface ConfigRowAnnotation {
  /** The VISIBLE one-line gloss, rendered as the Field's description — so it is on screen at rest AND in
   *  `aria-describedby`. This is the E5 half: 16 of 24 Config rows meant nothing at rest without it. */
  readonly gloss: ReactNode;
  /** The `i` tooltip. It answers "MORE", never "what" — the gloss already said what (re-drive #1099). */
  readonly hint: ReactNode;
  /** Activating the `i` reveals the teacher on this row (owner ruling F-6: the pane is never forced open
   *  by focus alone — the `i` is the door). */
  readonly onHintClick: () => void;
}

const ConfigRowAnnotationContext = createContext<ConfigRowAnnotation | null>(null);

/** The provider element type — `SettingRow` publishes with it, and re-publishes `null` around the
 *  secondary content of a composite row so one address never renders its gloss twice. */
export const ConfigRowAnnotationProvider = ConfigRowAnnotationContext;

/** Read the ambient row annotation. `null` outside a config `SettingRow` — the ordinary case. */
export function useConfigRowAnnotation(): ConfigRowAnnotation | null {
  return use(ConfigRowAnnotationContext);
}
