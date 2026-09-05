// Does an ancestor `<Field>` already supply this control's accessible NAME?
//
// It exists because Base UI's own answer is unreachable: `Field.Control` reads `labelId` off an INTERNAL
// `LabelableContext` and writes `aria-labelledby={labelId}` (`@base-ui/react` 1.7
// `field/control/FieldControl.js`), and that context is not exported. A control that must NAME ITSELF when
// nothing else does — `FileDropzone`, whose real `<input type="file">` otherwise announces the UA's
// "Choose File" (#1660) — has to know which case it is in, because pointing its own `aria-labelledby` at
// its instruction line unconditionally would SHADOW the Field's label at every bound-field site.
//
// This MIRRORS Base UI rather than replacing it: the label wiring stays Base UI's, this only reports
// whether it happened. `<Field>` (./field.tsx) is the only `Field.Root` in the tree — `@orb/ui` and
// `@orb/client` both — so the mirror cannot drift out from under a second provider without that grep
// changing. It lives in its own module because biome's `useComponentExportOnlyModules` forbids a
// non-component export beside components, and a context is not a component.

import { createContext, use } from "react";

export const FieldLabelledContext = createContext(false);

/** Does an ancestor `<Field>` already name this control? See the module header. */
export function useFieldLabelled(): boolean {
  return use(FieldLabelledContext);
}
