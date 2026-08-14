import type { FieldRootProps, FieldValidityProps } from "@base-ui/react/field";
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { createContext, use } from "react";
import { cn } from "#lib";
import { HintTrigger } from "#primitives/hint-trigger";
import { fieldVariants } from "./variants.ts";

export type FieldOrientation = "vertical" | "horizontal";

// Lets a settings pane set orientation once instead of threading it through every field call site.
const FieldOrientationContext = createContext<FieldOrientation>("vertical");

/** Sets the ambient `<Field>` orientation for its subtree. */
export function FieldLayout({ orientation, children }: { readonly orientation: FieldOrientation; readonly children: ReactNode }): ReactElement {
  return <FieldOrientationContext value={orientation}>{children}</FieldOrientationContext>;
}

export interface FieldProps extends Omit<FieldRootProps, "className"> {
  /** Visible label — Base UI associates it with the control child automatically. */
  label: ReactNode;
  /**
   * The id of a control this Field does NOT own — an element that is not a `Field.Control` (the CodeMirror
   * editable surface is the live case). Base UI mints a `for` from the Field context regardless, so without
   * this the label ships a `for` pointing at an element that never mounts: `getElementById` returns null and
   * clicking the label does nothing, while every sibling label focuses its field (side-eye 2026-08-03 P2).
   *
   * It sets BOTH halves, because `for` alone cannot carry them: the attribute (so the DOM association is
   * true rather than dangling) and a click that focuses the element (HTML only forwards a label click to
   * LABELABLE elements — an `[contenteditable]` / `role=textbox` div is not one, so the attribute alone
   * would still be inert). The foreign control keeps its own `aria-label` for the accessible name.
   */
  labelFor?: string;
  description?: ReactNode;
  /** Layout of label vs control. Defaults to the ambient `FieldLayout` (else `vertical`). */
  orientation?: FieldOrientation;
  /** Short explainer surfaced as an info-icon hover tooltip beside the label (no vertical-space cost). */
  hint?: ReactNode;
  /** Non-null marks the row invalid (`data-invalid` on the control) and renders destructive error text. */
  error?: ReactNode;
  className?: string;
  /** The control — any Base UI-backed form control (`<Input>`, `<Select>`, `<Switch>`, …). */
  children: ReactNode;
}

/** Labeled-form-row primitive — Base UI Field sealed as Root/Label/Description/Error around a composed control. */
export function Field({
  label,
  labelFor,
  description,
  hint,
  orientation,
  error,
  disabled = false,
  name,
  className,
  children,
  invalid,
  ...rest
}: FieldProps): ReactElement {
  const ambient = use(FieldOrientationContext);
  const resolved = orientation ?? ambient;
  const hasError = error !== undefined && error !== null;
  const hasDescription = description !== undefined && description !== null;
  // A description or an error makes one column multi-line, which is the only case that wants a top-aligned
  // horizontal row (see `multiline` in ./variants.ts).
  const slots = fieldVariants({ orientation: resolved, multiline: hasDescription || hasError });
  const hasHint = hint !== undefined && hint !== null;

  const labelText = (
    <BaseField.Label
      className={slots.label()}
      data-slot="field-label"
      {...(labelFor === undefined
        ? {}
        : {
            htmlFor: labelFor,
            onClick: (): void => {
              document.getElementById(labelFor)?.focus();
            },
          })}
    >
      {label}
    </BaseField.Label>
  );
  // Hint trigger is a SIBLING of `<BaseField.Label>`, never a descendant — nesting it inside leaks
  // "More info" into the control's accessible name via the W3C accname subtree-concatenation algorithm.
  const labelNode = hasHint ? (
    <span className={slots.labelRow()}>
      {labelText}
      {/* THE HINT COSTS NO VERTICAL SPACE — this prop's own contract, and `size="icon"` broke it: a full
          `--spacing-control-md` box (34px fine / 44px coarse) made a hinted label row stand 16px taller
          than a plain one, so every side-by-side pair of a hinted and an unhinted field sheared — its
          labels off one baseline, its controls off another (the preset drill-ins' DELIVERY row, crunch
          item 10, owner-reported live). `size="inline"` is the arm for exactly this: no control box,
          text-height, and the touch floor kept by its own layout-neutral hit-area pseudo. A className
          height CANNOT express it — a custom-token height is opaque to tailwind-merge, so both heights
          would survive and stylesheet order would pick the winner. */}
      <HintTrigger className={slots.hintTrigger()} hint={hint} size="inline" subject={label} />
    </span>
  ) : (
    labelText
  );
  const descriptionNode = hasDescription ? (
    <BaseField.Description className={slots.description()} data-slot="field-description">
      {description}
    </BaseField.Description>
  ) : null;
  const errorNode = hasError ? (
    <BaseField.Error className={slots.error()} data-slot="field-error" match={true}>
      {error}
    </BaseField.Error>
  ) : null;

  return (
    <BaseField.Root
      className={cn(slots.root(), className)}
      data-orientation={resolved}
      data-slot="field-root"
      disabled={disabled}
      // Leave `invalid` undefined at rest so Base UI's own validate-driven computation still runs.
      invalid={invalid ?? (hasError || undefined)}
      name={name}
      {...rest}
    >
      {resolved === "horizontal" ? (
        <>
          <div className={slots.labelBlock()} data-slot="field-label-block">
            {labelNode}
            {descriptionNode}
          </div>
          <div className={slots.controlCol()} data-slot="field-control-col">
            {children}
            {errorNode}
          </div>
        </>
      ) : (
        <>
          {labelNode}
          {children}
          {descriptionNode}
          {errorNode}
        </>
      )}
    </BaseField.Root>
  );
}

/** Custom validity render-prop for rows needing more than the single `error` message. */
export function FieldValidity(props: FieldValidityProps): ReactElement {
  return <BaseField.Validity {...props} />;
}
