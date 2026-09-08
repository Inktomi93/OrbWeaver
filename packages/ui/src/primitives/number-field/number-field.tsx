import type { NumberFieldRootProps } from "@base-ui/react/number-field";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn, variantAttrs } from "#lib";
import { Icon, Lock, Minus, MoveHorizontal, Plus } from "#primitives/icons";
import { numberFieldVariants } from "./variants.ts";

// THE STEPPERS NAME THEIR SUBJECT (side-eye F-20, 2026-08-03). A bare "Decrease"/"Increase" is fine for
// ONE number on a screen; the params deck stacks three NumberFields in one column, so a screen-reader user
// heard "Decrease" three times with nothing saying decrease WHAT. The subject is the field's own accessible
// name when the call site supplies one (`aria-label`) — never invented, so a field inside a `<Field label>`
// (where the visible label is already adjacent and Base UI wires it to the input) keeps the bare verb
// rather than guessing at a name it cannot read.
const DECREMENT_LABEL = "Decrease";
const INCREMENT_LABEL = "Increase";

/** The stepper's accessible name — the verb, plus the field's own name when the call site named it. */
function stepperLabel(verb: string, subject: string | undefined): string {
  return subject === undefined || subject.trim() === "" ? verb : `${verb} ${subject}`;
}

const SCRUB_CURSOR_ICON: ReactElement = <Icon icon={MoveHorizontal} size="xs" />;

/**
 * The ONE home for the bounds sentence — no call site spells it, so none can drift from it.
 *
 * Base UI renders an editable TEXTBOX, not a `role="spinbutton"` (deliberate: spinbutton semantics are
 * hostile to typed editing in screen readers), so there is no `aria-valuemin`/`aria-valuemax` carrying the
 * range. The bounds reach assistive tech as an accessible DESCRIPTION instead (owner ruling 2026-08-02) —
 * never by stamping a spinbutton role back on.
 *
 * Bounds are formatted with the field's own `locale`/`format` because Base UI formats the input's VISIBLE
 * value the same way: an unformatted "1024" description under a "1,024" input reads as a different number.
 */
function boundsDescription(
  min: number | undefined,
  max: number | undefined,
  locale: Intl.LocalesArgument,
  format: Intl.NumberFormatOptions | undefined,
): string | null {
  const formatter = new Intl.NumberFormat(locale, format);
  if (min !== undefined && max !== undefined) {
    return `Between ${formatter.format(min)} and ${formatter.format(max)}`;
  }
  if (min !== undefined) {
    return `Minimum ${formatter.format(min)}`;
  }
  if (max !== undefined) {
    return `Maximum ${formatter.format(max)}`;
  }
  return null;
}

export interface NumberFieldProps extends NumberFieldRootProps, VariantProps<typeof numberFieldVariants> {
  className?: string;
  /** Renders a drag-to-scrub label above the steppers — click-drag to change the value. Omit to hide. */
  scrubLabel?: ReactNode;
  /** @defaultValue "horizontal" */
  scrubDirection?: "horizontal" | "vertical";
  /** Empty-state text for the native input — the "blank means the default applies" affordance (show the
   *  effective default here, never a value the field silently writes). Routed to `NumberField.Input`, NOT
   *  the Root: `NumberFieldRootProps` inherits `placeholder` from React's `HTMLAttributes` and would land
   *  it on the wrapper `<div>`, where it renders nothing. */
  placeholder?: string | undefined;
  /** Extra description id(s) for the input. COMPOSED with the auto-derived bounds description, never
   *  replacing it — and routed to `NumberField.Input` for the same reason `placeholder` is (the Root spread
   *  would park it on the wrapper `<div>`, describing nothing). A `<Field description>` needs nothing here:
   *  Base UI appends the Field's own message ids to whatever the control carries. */
  "aria-describedby"?: string | undefined;
  /** Accessible name for a field with no visible `<Field label>`. Routed to `NumberField.Input` — the same
   *  Root-spread footgun as `placeholder`: on the wrapper `<div>` (no role) it names nothing at all. Inside a
   *  `<Field>` the Label's `aria-labelledby` takes precedence, as it should — which is exactly why a
   *  Field-wrapped call site may ALSO pass it: it costs the input nothing and it is what names the
   *  Increment/Decrement buttons, which no `<Field>` label reaches (see `stepperLabel`). */
  "aria-label"?: string | undefined;
}

/**
 * Numeric stepper input. `readOnly` renders distinctly from `disabled`: the group/steppers keep their
 * normal token colors and the +/− glyphs swap to a Lock glyph as a non-color "you can't touch this" signal.
 *
 * `min`/`max` automatically become the input's accessible description (see `boundsDescription`) — zero call
 * sites opt in. The input's `inputMode` is deliberately NOT set here: Base UI already defaults it to
 * `numeric` and narrows it per-platform (iOS drops to `text` when `min` allows negatives, whose soft
 * keyboard has no minus key), so an override would break negative entry on iOS.
 *
 * `size="inline"` is the slider's number twin (preset-surface-redesign.md §4.1): a compact mono cell that
 * OMITS the Increment/Decrement parts (R2's sanctioned omission — a knob row's coarse steps are the slider
 * beside it, and two stepper buttons per row would triple a seven-row deck's control count). Nothing is
 * lost: ArrowUp/ArrowDown on the input still step, `scrubLabel` still drags, and the derived bounds
 * description is unchanged. The read-only LOCK glyph rides the steppers, so an inline read-only field
 * signals through the input's own `readonly` semantics alone.
 */
export function NumberField(props: NumberFieldProps): ReactElement {
  const { className, scrubLabel, scrubDirection = "horizontal", placeholder, "aria-describedby": describedBy, "aria-label": ariaLabel, size, ...rest } = props;
  const slots = numberFieldVariants({ size });
  const hasSteppers = size !== "inline";
  const hasScrub = scrubLabel !== undefined && scrubLabel !== null;
  const boundsId = useId();
  const bounds = boundsDescription(rest.min, rest.max, rest.locale, rest.format);
  const inputDescribedBy = [describedBy, bounds === null ? undefined : boundsId].filter((id) => id !== undefined && id !== "").join(" ");
  return (
    <BaseNumberField.Root className={cn(slots.root(), className)} data-slot="number-field-root" {...rest}>
      {hasScrub ? (
        <BaseNumberField.ScrubArea className={slots.scrubArea()} data-slot="number-field-scrub-area" direction={scrubDirection}>
          {scrubLabel}
          <BaseNumberField.ScrubAreaCursor className={slots.scrubCursor()} data-slot="number-field-scrub-cursor">
            {SCRUB_CURSOR_ICON}
          </BaseNumberField.ScrubAreaCursor>
        </BaseNumberField.ScrubArea>
      ) : null}
      {/* THE GROUP CARRIES NO NAME (fix #73 — the group/input duplicate-name defect): the INPUT is the
          ONE accessible-name owner (its own `aria-label` in bare use; a wrapping `<Field>`'s
          `aria-labelledby`, which OUTRANKS `aria-label` by the ARIA spec's own precedence, when
          Field-composed — see `forms/editor/bound-fields/number-field.tsx`'s header). A `role="group"` wrapper
          with no name is a pure layout node: AT does not separately announce it, and every automated
          `getByLabel`/manual voice-control match resolves to exactly the input. The steppers still name
          their subject (`stepperLabel`, below) — that reads the `ariaLabel` JS variable directly, never
          the group's DOM attribute, so dropping it here costs the steppers nothing. */}
      <BaseNumberField.Group className={slots.group()} data-slot="number-field-group">
        {hasSteppers ? (
          <BaseNumberField.Decrement aria-label={stepperLabel(DECREMENT_LABEL, ariaLabel)} className={slots.decrement()} data-slot="number-field-decrement">
            <Icon className={slots.stepIcon()} icon={Minus} size="xs" />
            <Icon className={slots.stepReadOnlyIcon()} icon={Lock} size="xs" />
          </BaseNumberField.Decrement>
        ) : null}
        {/* STAMP SITE (#1097): the INPUT. `size` sets the input's own control height (and whether the
            steppers exist at all), and the input is the interactive element the tap-target census keys
            on — a stamp on the outer root would be invisible to it (identity never walks ancestors). */}
        <BaseNumberField.Input
          aria-describedby={inputDescribedBy === "" ? undefined : inputDescribedBy}
          aria-label={ariaLabel}
          className={slots.input()}
          data-slot="number-field-input"
          placeholder={placeholder}
          {...variantAttrs(numberFieldVariants, { size })}
        />
        {hasSteppers ? (
          <BaseNumberField.Increment aria-label={stepperLabel(INCREMENT_LABEL, ariaLabel)} className={slots.increment()} data-slot="number-field-increment">
            <Icon className={slots.stepIcon()} icon={Plus} size="xs" />
            <Icon className={slots.stepReadOnlyIcon()} icon={Lock} size="xs" />
          </BaseNumberField.Increment>
        ) : null}
      </BaseNumberField.Group>
      {bounds === null ? null : (
        <span className={slots.boundsDescription()} data-slot="number-field-bounds" id={boundsId}>
          {bounds}
        </span>
      )}
    </BaseNumberField.Root>
  );
}
