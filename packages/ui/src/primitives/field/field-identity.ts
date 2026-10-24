// Every field primitive emits an `id` and a `name`, so a control is always addressable by autofill, by a label's `for`
// and by Chrome's form-field audit. A `<Field>` owns the pair for the controls it wraps: it mints a name when the caller
// gave none and publishes it here, and Base UI mints the control id. A bare control mints the pair itself.

import { createContext, use, useId } from "react";
import { useFieldLabelled } from "./field-labelled.ts";

/** The wrapping Field's name, for the inputs Base UI does not name itself (a number field's visible input). */
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
  const resolvedName = inField ? (name ?? fieldName) : (name ?? id ?? generated);
  return { ...(resolvedId === undefined ? {} : { id: resolvedId }), ...(resolvedName === undefined ? {} : { name: resolvedName }) };
}
