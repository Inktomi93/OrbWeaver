import type { FieldRootProps, FieldValidityProps } from "@base-ui/react/field";
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "#lib";
import { Button } from "#primitives/button";
import { Icon, Info } from "#primitives/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "#primitives/tooltip";
import { fieldVariants } from "./variants";

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
  const ambient = useContext(FieldOrientationContext);
  const resolved = orientation ?? ambient;
  const slots = fieldVariants({ orientation: resolved });
  const hasError = error !== undefined && error !== null;
  const hasDescription = description !== undefined && description !== null;
  const hasHint = hint !== undefined && hint !== null;
  // Derive the hint trigger's accessible name from the label so multiple hinted fields don't share one name.
  let hintAriaLabel = "More info";
  if (typeof label === "string" && label.trim().length > 0) {
    const labelString: string = label;
    hintAriaLabel = `More info about ${labelString}`;
  }

  const labelText = (
    <BaseField.Label className={slots.label()} data-slot="field-label">
      {label}
    </BaseField.Label>
  );
  // Hint trigger is a SIBLING of `<BaseField.Label>`, never a descendant — nesting it inside leaks
  // "More info" into the control's accessible name via the W3C accname subtree-concatenation algorithm.
  const labelNode = hasHint ? (
    <span className={slots.labelRow()}>
      {labelText}
      <Tooltip>
        {/* THE HINT COSTS NO VERTICAL SPACE — this prop's own contract, and `size="icon"` broke it: a full
            `--spacing-control-md` box (34px fine / 44px coarse) made a hinted label row stand 16px taller
            than a plain one, so every side-by-side pair of a hinted and an unhinted field sheared — its
            labels off one baseline, its controls off another (the preset drill-ins' DELIVERY row, crunch
            item 10, owner-reported live). `size="inline"` is the arm for exactly this: no control box,
            text-height, and the touch floor kept by its own layout-neutral hit-area pseudo. A className
            height CANNOT express it — a custom-token height is opaque to tailwind-merge, so both heights
            would survive and stylesheet order would pick the winner. */}
        <TooltipTrigger
          render={
            <Button aria-label={hintAriaLabel} className={slots.hintTrigger()} intent="ghost" size="inline" type="button">
              <Icon icon={Info} size="xs" />
            </Button>
          }
        />
        <TooltipPopup side="top">{hint}</TooltipPopup>
      </Tooltip>
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
