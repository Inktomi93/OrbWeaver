// Every field primitive emits an `id` and a `name`, so a control is always addressable by autofill, by a label's `for`
// and by Chrome's form-field audit. A `<Field>` publishes the name the caller gave it and Base UI mints the control id, so
// a control inside a Field mints a name only when neither the Field nor the control has one. A bare control mints the pair.

import { createContext, use, useId } from "react";
import { useFieldLabelled } from "./field-labelled.ts";

/** The wrapping Field's own name (absent when the caller gave none), for the inputs Base UI does not name itself (a number field's visible input). */
export const FieldNameContext = createContext<string | undefined>(undefined);

interface FieldIdentity {
  readonly id?: string;
  readonly name?: string;
}

/** The props to spread for the control's `id` and `name`: the caller's own win, then the wrapping Field's name, then a minted one. */
export function useFieldIdentity(id: string | undefined, name: string | undefined): FieldIdentity {
  const generated = useId();
  const inField = useFieldLabelled();
  const fieldName = use(FieldNameContext);
  const resolvedId = inField ? id : (id ?? generated);
  const resolvedName = inField ? (name ?? fieldName ?? generated) : (name ?? id ?? generated);
  return { ...(resolvedId === undefined ? {} : { id: resolvedId }), name: resolvedName };
}
