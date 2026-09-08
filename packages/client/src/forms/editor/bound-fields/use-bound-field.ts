// useBoundField — the bound-fields' shared wrapper scaffolding (clone-audit item 7, forms-local): every
// bound field reads its `useFieldContext<T>()`, normalizes the touch-gated error, and assembles the same
// `<Field>` prop bundle (label/description/hint/error/disabled/name). This hook is the ONE home for that
// wiring so a bound field shrinks to its control; `field-error.ts` already homed the error policy the same
// way. Consumed by EVERY bound field — the raw `useFieldContext(` door is sealed to this ONE home
// (G28 `bound-field-via-hook`), so a new bound field cannot re-hand-roll the wiring.
//
// THE ONE DELIBERATE DEVIATION FROM THE BASE UI HANDBOOK (vendor/base-ui/handbook/forms.md, "TanStack
// Form → Integrate components"). The handbook maps `invalid={!field.state.meta.isValid}` straight onto
// `<Field.Root>`. We map `error` (which `@orb/ui/field` turns into `invalid`) from `touchedFieldError`
// instead — the SAME errors, gated on `isTouched`. Reason: with raw `isValid`, a required field is invalid
// from first paint, so every autosaving editor opens painted red on fields the user has not reached yet.
// `dirty` and `touched` ARE forwarded verbatim as the handbook requires, so Base UI's own `data-dirty` /
// `data-touched` remain honest — only the SHOW-THE-ERROR moment is ours. `MultiToggleField` documents the
// one state a touch gate cannot reach (untouched-and-empty) and passes an explicit `error` to cover it.
// Pinned by tests/client/forms/editor/bound-fields/use-bound-field.ct.tsx (attributes read off the rendered DOM).

import type { ReactNode } from "react";
import { useConfigRowAnnotation } from "#state";
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
    readonly onHintClick?: () => void;
    readonly error: string | null;
    readonly disabled: boolean;
    readonly name: string;
    readonly dirty: boolean;
    readonly touched: boolean;
  };
}

/**
 * Read the bound field context + assemble its `<Field>` props (touch-gated error included).
 *
 * THE CONFIG-ROW ANNOTATION (#932/#927) is merged HERE, and here only, because this is the one home for
 * the `<Field>` prop bundle (the `bound-field-via-hook` gate seals the raw `useFieldContext(` door): a
 * `SettingRow` publishes its leaf's registry gloss + teacher door, and every bound field inside one picks
 * it up without its section author threading prose it does not own. Outside a `SettingRow` the read is
 * `null` and every field renders byte-identically to before.
 *
 * THE CALL SITE WINS on both slots. A section that spells its own `description` has already said what the
 * row means in the words it chose, and a section that spells its own `hint` owns that tooltip — the
 * registry gloss is the FALLBACK for the 16-of-24 rows that said nothing at rest, never an override.
 */
export function useBoundField<T>(shell: BoundFieldShellProps): BoundField<T> {
  const field = useFieldContext<T>();
  const annotation = useConfigRowAnnotation();
  const error = touchedFieldError(field.state.meta);
  return {
    field,
    fieldProps: {
      label: shell.label,
      description: shell.description ?? annotation?.gloss,
      hint: shell.hint ?? annotation?.hint,
      // The `i` is a DOOR only where the row published one; a plain hinted field keeps the
      // hover/focus-only atom it always was (`Field`'s own `onHintClick` contract).
      ...(annotation === null || shell.hint !== undefined ? {} : { onHintClick: annotation.onHintClick }),
      error,
      disabled: shell.disabled ?? false,
      name: field.name,
      dirty: field.state.meta.isDirty,
      touched: field.state.meta.isTouched,
    },
  };
}
