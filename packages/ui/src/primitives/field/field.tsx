import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { fieldVariants } from "./variants";

export interface FieldProps {
  /** Visible label — Base UI associates it with the control child automatically. */
  label: ReactNode;
  description?: ReactNode;
  /** Non-null marks the row invalid (`data-invalid` on the control) and renders destructive error text. */
  error?: ReactNode;
  disabled?: boolean;
  /** Identifies the field when a form is submitted. */
  name?: string;
  className?: string;
  /** The control — any Base UI-backed form control (`<Input>`, `<Select>`, `<Switch>`, …). */
  children: ReactNode;
}

/**
 * The labeled-form-row primitive — Base UI Field sealed as Root/Label/Description/Error around a
 * composed control (D42 §2 — Base UI seal; ui-package-design §6.1).
 *
 * Usage: `<Field label="Display name" error={errors.name}><Input /></Field>`
 */
export function Field({
  label,
  description,
  error,
  disabled = false,
  name,
  className,
  children,
}: FieldProps): ReactElement {
  const slots = fieldVariants();
  const hasError = error !== undefined && error !== null;
  const hasDescription = description !== undefined && description !== null;
  return (
    <BaseField.Root
      className={cn(slots.root(), className)}
      disabled={disabled}
      invalid={hasError}
      name={name}
    >
      <BaseField.Label className={slots.label()}>{label}</BaseField.Label>
      {children}
      {hasDescription ? (
        <BaseField.Description className={slots.description()}>{description}</BaseField.Description>
      ) : null}
      {hasError ? (
        <BaseField.Error className={slots.error()} match={true}>
          {error}
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}
