import type { FieldRootProps, FieldValidityProps } from "@base-ui/react/field";
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Info/Icon fine (the add-member-popover precedent).
import { Icon, Info } from "#primitives/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { fieldVariants } from "./variants";

export interface FieldProps extends Omit<FieldRootProps, "className"> {
  /** Visible label — Base UI associates it with the control child automatically. */
  label: ReactNode;
  description?: ReactNode;
  /**
   * A short explainer surfaced as an info-icon hover tooltip beside the label, instead of always-on
   * helper text — the persona-panel redesign's replacement for `description` on lightly-used fields
   * (a hover tip costs no vertical space; `description` still renders when a field wants copy that's
   * ALWAYS visible, e.g. a live validation hint). Additive — existing `description` callers unaffected.
   */
  hint?: ReactNode;
  /** Non-null marks the row invalid (`data-invalid` on the control) and renders destructive error text. */
  error?: ReactNode;
  className?: string;
  /** The control — any Base UI-backed form control (`<Input>`, `<Select>`, `<Switch>`, …). */
  children: ReactNode;
}

/**
 * The labeled-form-row primitive — Base UI Field sealed as Root/Label/Description/Error around a
 * composed control (D42 §2 — Base UI seal; ui-package-design §6.1). `FieldProps` extends the FULL
 * `Field.Root` prop surface (R5, ui-package-design §13) — `validate`/`validationMode`/
 * `validationDebounceTime`/`dirty`/`touched`/`actionsRef` all flow through untouched; `error` is a
 * convenience that ORs into `invalid` (pass `invalid` explicitly if it needs to diverge from `error`).
 *
 * Composable with any Field-aware Base UI control — Input/Textarea/Checkbox/Switch/RadioGroup/
 * Slider/NumberField/Select all register (label association + `aria-describedby` + `data-invalid`)
 * because their Roots extend Base UI's `FieldRootState` (verified per-primitive `.d.ts`).
 *
 * For validity UI beyond a single `error` message (per-constraint branching, multi-message lists),
 * drop to the raw render-prop — `FieldValidity` below re-exports Base UI's `Field.Validity`
 * unstyled; most rows only need `error`.
 *
 * Usage: `<Field label="Display name" error={errors.name}><Input /></Field>`
 */
export function Field({
  label,
  description,
  hint,
  error,
  disabled = false,
  name,
  className,
  children,
  invalid,
  ...rest
}: FieldProps): ReactElement {
  const slots = fieldVariants();
  const hasError = error !== undefined && error !== null;
  const hasDescription = description !== undefined && description !== null;
  const hasHint = hint !== undefined && hint !== null;
  return (
    <BaseField.Root
      className={cn(slots.root(), className)}
      data-slot="field-root"
      disabled={disabled}
      // Only force `invalid` when there's an explicit override (`invalid` prop) or `error` — leave
      // it `undefined` otherwise so Base UI's OWN `validate`-driven invalid computation runs
      // unobstructed (forcing `invalid={false}` at rest would silently defeat internal validation).
      invalid={invalid ?? (hasError || undefined)}
      name={name}
      {...rest}
    >
      <BaseField.Label className={slots.label()} data-slot="field-label">
        {hasHint ? (
          // The hint trigger is a real <button> nested inside the native <label> — per the HTML label
          // spec, a click landing on an interactive descendant does NOT ALSO forward-activate the
          // associated control, so this never double-fires a Switch/Checkbox underneath.
          <span className={slots.labelRow()}>
            {label}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="More info"
                    className={slots.hintTrigger()}
                    intent="ghost"
                    size="icon"
                    type="button"
                  >
                    <Icon icon={Info} size="xs" />
                  </Button>
                }
              />
              <TooltipPopup side="top">{hint}</TooltipPopup>
            </Tooltip>
          </span>
        ) : (
          label
        )}
      </BaseField.Label>
      {children}
      {hasDescription ? (
        <BaseField.Description className={slots.description()} data-slot="field-description">
          {description}
        </BaseField.Description>
      ) : null}
      {hasError ? (
        <BaseField.Error className={slots.error()} data-slot="field-error" match={true}>
          {error}
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}

/**
 * Custom validity render-prop — Base UI's `Field.Validity` passed through unstyled, for rows that
 * need more than the `error` convenience prop (multi-message lists, per-constraint branching via
 * `valueMissing`/`patternMismatch`/etc.). The cut: `Field` itself only renders a single `error`
 * message; reach for `FieldValidity` when that's not enough.
 *
 * Usage: `<FieldValidity>{(validity) => <span>{validity.errors.join(", ")}</span>}</FieldValidity>`
 */
export function FieldValidity(props: FieldValidityProps): ReactElement {
  return <BaseField.Validity {...props} />;
}
