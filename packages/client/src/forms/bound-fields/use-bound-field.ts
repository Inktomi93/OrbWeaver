// useBoundField — the bound-fields' shared wrapper scaffolding (clone-audit item 7, forms-local): every
// bound field reads its `useFieldContext<T>()`, normalizes the touch-gated error, and assembles the same
// `<Field>` prop bundle (label/description/hint/error/disabled/name). This hook is the ONE home for that
// wiring so a bound field shrinks to its control; `field-error.ts` already homed the error policy the same
// way. Consumed by EVERY bound field — the raw `useFieldContext(` door is sealed to this ONE home
// (G28 `bound-field-via-hook`), so a new bound field cannot re-hand-roll the wiring.

import type { ReactNode } from "react";
import { useFieldContext } from "../contexts.ts";
import { touchedFieldError } from "./field-error.ts";

/** The label/description/hint/disabled a bound field passes through to `<Field>`. */
export interface BoundFieldShellProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`). */
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
}

interface BoundField<T> {
  /** The bound field context (`.state.value` / `.handleChange` / `.handleBlur` / `.name`). */
  readonly field: ReturnType<typeof useFieldContext<T>>;
  /** Spread onto `<Field>` — the label/description/hint/error/disabled/name bundle. */
  readonly fieldProps: {
    readonly label: ReactNode;
    readonly description: ReactNode;
    readonly hint: ReactNode;
    readonly error: string | null;
    readonly disabled: boolean;
    readonly name: string;
  };
}

/** Read the bound field context + assemble its `<Field>` props (touch-gated error included). */
export function useBoundField<T>(shell: BoundFieldShellProps): BoundField<T> {
  const field = useFieldContext<T>();
  const error = touchedFieldError(field.state.meta);
  return {
    field,
    fieldProps: {
      label: shell.label,
      description: shell.description,
      hint: shell.hint,
      error,
      disabled: shell.disabled ?? false,
      name: field.name,
    },
  };
}
