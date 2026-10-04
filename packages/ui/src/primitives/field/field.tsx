import type { FieldRootProps, FieldValidityProps } from "@base-ui/react/field";
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { createContext, use } from "react";
import { cn } from "#lib";
import { HintTrigger } from "#primitives/hint-trigger";
// `<Field>` is this context's ONE provider — the consumer half (`useFieldLabelled`) and the reason it has
// to exist at all are in that module's header.
import { FieldControlDockContext } from "./field-control-dock.ts";
import { FieldLabelledContext } from "./field-labelled.ts";
import { fieldVariants } from "./variants.ts";

export type FieldOrientation = "vertical" | "horizontal";

/**
 * How a HORIZONTAL row places its two columns (#932 — the measure-capped settings row).
 *
 * - `block` (the default, and byte-identical to every pre-#932 horizontal row): the row is its own flex
 *   box — label block left, a fixed `width.control-col` dock right, `justify-between` between them. Each
 *   row sizes itself, so a column of rows agrees on the control's RIGHT edge and on nothing else, and the
 *   space between a label and its control is whatever the pane happens to be wide.
 * - `track`: the row is a SUBGRID of an ancestor that declares the tracks, so the label column is sized
 *   `max-content` over EVERY row in the section and the control column starts at one shared x. The gap
 *   between a label and its control stops being a function of the pane width — which is the whole defect
 *   (`row-void` fired 8× at 63–77% on Config and ZERO in the one pane state that narrowed the column).
 *   The ancestor is `@orb/client`'s `SettingRowGroup`; a `track` Field with no such ancestor still renders
 *   (subgrid on a non-grid parent falls back to `none`), it simply gains nothing.
 */
export type FieldAlign = "block" | "track";

// Lets a settings pane set orientation once instead of threading it through every field call site.
const FieldOrientationContext = createContext<FieldOrientation>("vertical");
// SEPARATE from orientation on purpose: `align` is a SECTION-level decision (all the rows share tracks or
// none do) while `orientation` is legitimately per-row, and keeping them apart is what lets `FieldLayout`'s
// default stay byte-identical for the 25 horizontal consumers that are not settings rows.
const FieldAlignContext = createContext<FieldAlign>("block");

/** Sets the ambient `<Field>` orientation (and, opt-in, the column alignment) for its subtree. */
export function FieldLayout({
  orientation,
  align = "block",
  children,
}: {
  readonly orientation: FieldOrientation;
  /** @defaultValue "block" — see {@link FieldAlign}. */
  readonly align?: FieldAlign;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <FieldOrientationContext value={orientation}>
      <FieldAlignContext value={align}>{children}</FieldAlignContext>
    </FieldOrientationContext>
  );
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
  /**
   * An ACTIVATION on the hint trigger beyond its tooltip — the label-adjacent annotation door (#927).
   *
   * THE CONSTRAINT THIS SATISFIES, stated so nobody "simplifies" it back: installed `@base-ui/react` 1.7
   * ships `Field.Root/Label/Error/Description/Control/Validity/Item` and NO label-adjacent action part, so
   * the anatomy is ours — and it is already correct. `HintTrigger` is a SIBLING of `Field.Label` inside
   * `field-label-row`, which is what keeps "More info" out of the control's accessible name (W3C accname
   * subtree concatenation) while `Field.Description` stays in `aria-describedby`. This prop is therefore
   * the whole of the extension: the existing trigger gains a click. It is deliberately NOT an
   * unconstrained `labelAdjacent: ReactNode` slot — an arbitrary node beside the label is exactly the
   * accname leak the sibling anatomy exists to prevent, and it would be a second icon vocabulary.
   *
   * Ignored without `hint` (there is no trigger to activate). The tooltip still opens on hover/focus; on
   * touch, where no tooltip can open, the click is the whole affordance.
   */
  onHintClick?: () => void;
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
  onHintClick,
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
  const align = use(FieldAlignContext);
  const resolved = orientation ?? ambient;
  const hasError = error !== undefined && error !== null;
  const hasDescription = description !== undefined && description !== null;
  // A description or an error makes one column multi-line, which is the only case that wants a top-aligned
  // horizontal row (see `multiline` in ./variants.ts).
  const slots = fieldVariants({ align, orientation: resolved, multiline: hasDescription || hasError });
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
          height does not express it — pre-#146 a custom-token height was opaque to tailwind-merge, so both
          heights survived and stylesheet order picked the winner; with the spacing scale registered the
          call site wins instead, which is silently defeating a sealed box rather than naming an arm. */}
      <HintTrigger className={slots.hintTrigger()} hint={hint} size="inline" subject={label} {...(onHintClick === undefined ? {} : { onClick: onHintClick })} />
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
      <FieldLabelledContext value={true}>
        <FieldControlDockContext value={resolved === "horizontal"}>
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
        </FieldControlDockContext>
      </FieldLabelledContext>
    </BaseField.Root>
  );
}

/** Custom validity render-prop for rows needing more than the single `error` message. */
export function FieldValidity(props: FieldValidityProps): ReactElement {
  return <BaseField.Validity {...props} />;
}
