import { Field as BaseField } from "@base-ui/react/field";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import { cn } from "#lib";
import { Field } from "#primitives/field";
import { Input } from "#primitives/input";
import { Popover, PopoverPopup, PopoverTrigger } from "#primitives/popover";
import { isSafeColor } from "../../content/theme-scope/clamp";
import { colorFieldVariants } from "./variants";

export interface ColorSwatchProps {
  /**
   * The color to display. Rendered as inline `background-color` ONLY when it passes the D44
   * §12.1 clamp (`isSafeColor`, mirrored from `<ThemeScope>` — ui-primitive-carve-out-work-order.md
   * item 13); an unsafe/unparsable value renders an empty chip rather than risk an injected style.
   */
  value: string;
  /** Optional text beside the chip (e.g. the raw hex) — omit for a bare swatch. */
  label?: string;
  className?: string;
}

/**
 * The read-only swatch — a plain color chip for list/summary contexts (a themes gallery row, a
 * "current accent" readout) with no popover/edit affordance at all.
 *
 * Usage: `<ColorSwatch value={theme.accent} label={theme.accent} />`
 */
export function ColorSwatch({ value, label, className }: ColorSwatchProps): ReactElement {
  const slots = colorFieldVariants();
  const safe = isSafeColor(value);
  return (
    <span className={slots.root({ className })} data-slot="color-swatch">
      <span
        className={slots.swatch()}
        data-slot="color-swatch-chip"
        style={safe ? { backgroundColor: value } : undefined}
      />
      {label === undefined ? null : <span className={slots.hexText()}>{label}</span>}
    </span>
  );
}

export interface ColorFieldProps {
  /** The current color — any form the D44 clamp accepts (hex / rgb / hsl / oklch / a named color). */
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const NATIVE_HEX_RE = /^#[0-9a-f]{6}$/iu;
// The browser's own <input type="color"> only accepts a strict 6-digit hex — a non-hex committed
// value (oklch(...), rgba(...), a named color) can't seed its internal swatch, so it falls back to
// this neutral default. The FALLBACK never overwrites `value`/`draft` — it's the native control's
// own internal state only, until the user actually interacts with it.
const FALLBACK_NATIVE_HEX = "#000000";

/**
 * The editable color field — a swatch TRIGGER that opens a popover with a native
 * `<input type="color">` plus a hex text field. No color-picker library (D42/the work order):
 * the native input supplies the OS color-picker UI, and the hex field is the ALWAYS-present
 * keyboard/SR-operable alternative — the native swatch is a convenience shortcut, never the only
 * path to a value.
 *
 * Label association: the swatch trigger button is wrapped in Base UI `Field.Control` (the same
 * registration `Textarea` uses for a plain native element), so `<Field label="Accent">
 * <ColorField .../></Field>` gets `htmlFor`/`aria-describedby`/`data-invalid` for free — a button
 * is a labelable HTML element, so a click on the Field label focuses/activates it.
 *
 * Validation mirrors the D44 §12.1 `<ThemeScope>` clamp EXACTLY: `isSafeColor` is imported from
 * `content/theme-scope/clamp` (not re-derived), so a value that fails to parse as a color —
 * including a `url()`/`expression()` injection attempt — is rejected inline (the popover's hex
 * field shows the error) and never reaches `onValueChange`.
 *
 * Usage: `<Field label="Accent"><ColorField value={theme.accent} onValueChange={setAccent} /></Field>`
 */
export function ColorField({
  value,
  onValueChange,
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: ColorFieldProps): ReactElement {
  const slots = colorFieldVariants();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isValid = isSafeColor(draft);
  const nativeHex = NATIVE_HEX_RE.test(draft) ? draft : FALLBACK_NATIVE_HEX;

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) {
      // Re-seed from the last COMMITTED value on every open — a draft left over from a prior
      // open/cancel (invalid or not) must never resurface.
      setDraft(value);
    }
  };

  const commit = (next: string): void => {
    setDraft(next);
    if (isSafeColor(next)) {
      onValueChange(next);
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <BaseField.Control
        render={
          <PopoverTrigger
            render={
              <button
                className={cn(slots.swatchTrigger(), className)}
                data-disabled={disabled ? "" : undefined}
                disabled={disabled}
                type="button"
                // Base UI's render-prop chain (Field.Control → PopoverTrigger → this button) merges
                // props via `mergeProps`, which treats an EXPLICITLY-declared key on the innermost
                // element as an override even when its VALUE is `undefined` (a bare `id={id}` here
                // would silently erase the id Field.Control computes and registers with the Field
                // context — breaking `<Field>` label association whenever the caller doesn't pass
                // an id, the common case). Conditionally spreading keeps the key OFF this element's
                // props so the computed id/aria-labelledby win through instead (verified empirically
                // — a bare `id={id}` reproduces a `getByLabel` timeout in the CT suite).
                {...(id === undefined ? {} : { id })}
                {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
                {...(ariaLabelledby === undefined ? {} : { "aria-labelledby": ariaLabelledby })}
                {...(ariaDescribedby === undefined ? {} : { "aria-describedby": ariaDescribedby })}
              >
                <span
                  className={slots.swatch()}
                  data-slot="color-field-swatch"
                  style={isValid ? { backgroundColor: value } : undefined}
                />
              </button>
            }
          />
        }
      />
      <PopoverPopup>
        <div className={slots.popupBody()} data-slot="color-field-popup-body">
          <input
            aria-label="Pick color"
            className={slots.nativeColorInput()}
            data-slot="color-field-native-input"
            onChange={(event: ChangeEvent<HTMLInputElement>): void => commit(event.target.value)}
            type="color"
            value={nativeHex}
          />
          <Field
            className={slots.hexField()}
            label="Hex"
            {...(isValid ? {} : { error: "Enter a valid color (hex, rgb, hsl, or oklch)." })}
          >
            <Input onValueChange={commit} spellCheck={false} value={draft} />
          </Field>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
