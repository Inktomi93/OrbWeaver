import { Field as BaseField } from "@base-ui/react/field";
import type { PopoverRootProps as BasePopoverRootProps } from "@base-ui/react/popover";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import { cn, isSafeColor } from "#lib";
import { Button } from "#primitives/button";
import { Field } from "#primitives/field";
import { Check, Icon } from "#primitives/icons";
import { Input } from "#primitives/input";
import { Popover, PopoverPopup, PopoverTrigger } from "#primitives/popover";
import { WebSpinner } from "#primitives/spinner";
import { colorFieldVariants } from "./variants.ts";

export interface ColorSwatchProps {
  /**
   * The color to display. Rendered as inline `background-color` only when it passes `isSafeColor`;
   * an unsafe/unparsable value renders an empty chip rather than risk an injected style.
   */
  value: string;
  /** Optional text beside the chip (e.g. the raw hex) — omit for a bare swatch. */
  label?: string;
  className?: string;
}

/** The read-only swatch — a plain color chip for list/summary contexts, no popover/edit affordance. */
export function ColorSwatch({ value, label, className }: ColorSwatchProps): ReactElement {
  const slots = colorFieldVariants();
  const safe = isSafeColor(value);
  return (
    <span className={slots.root({ className })} data-slot="color-swatch">
      <span className={slots.swatch()} data-slot="color-swatch-chip" style={safe ? { backgroundColor: value } : undefined} />
      {label === undefined ? null : <span className={slots.hexText()}>{label}</span>}
    </span>
  );
}

/** The popover's change eventDetails (reason / cancel() / allowPropagation()), DERIVED from the Root
 *  prop this seal forwards to — hand-spelling `(open: boolean) => void` here would drop the whole
 *  object and with it a consumer's ability to veto a dismiss. */
type ColorFieldOpenChangeDetails = Parameters<NonNullable<BasePopoverRootProps["onOpenChange"]>>[1];

export interface ColorFieldProps {
  /**
   * The current color — any form the D44 clamp accepts (hex / rgb / hsl / oklch / a named color).
   * NOTE `onValueChange` below is this composite's OWN commit callback (it fires only for a value that
   * passes `isSafeColor`, and for the `""` clear), not a passthrough of any Base UI change arm — there
   * is no eventDetails to preserve on it.
   */
  value: string;
  onValueChange: (value: string) => void;
  onOpenChange?: (open: boolean, details: ColorFieldOpenChangeDetails) => void;
  disabled?: boolean;
  /** Busy state: swaps the swatch for a `<WebSpinner>` and inerts the trigger. Caller-driven, same shape as `Button.loading`. */
  loading?: boolean;
  /** Momentary success flash: a checkmark over the swatch. Caller clears it — this primitive holds no timer. */
  success?: boolean;
  className?: string;
  /**
   * The clear button's label. It is a prop because the empty value means different things to different
   * consumers and each must say its OWN word: a theme field clears to `Inherit`, a tag colour clears to no
   * colour at all. @defaultValue "Reset to default"
   */
  resetLabel?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

interface ColorFieldTriggerGlyphProps {
  readonly loading: boolean;
  readonly success: boolean;
  readonly isValid: boolean;
  readonly value: string;
  readonly slots: ReturnType<typeof colorFieldVariants>;
}

/** The trigger's swatch/spinner/checkmark dispatch, split out to avoid a 3-way nested ternary. */
function ColorFieldTriggerGlyph({ loading, success, isValid, value, slots }: ColorFieldTriggerGlyphProps): ReactElement {
  if (loading) {
    return <WebSpinner label="Saving color…" size="sm" />;
  }
  if (success) {
    return <Icon icon={Check} label="Saved" size="sm" />;
  }
  return <span className={slots.swatch()} data-slot="color-field-swatch" style={isValid ? { backgroundColor: value } : undefined} />;
}

const NATIVE_HEX_RE = /^#[0-9a-f]{6}$/iu;
// The browser's <input type="color"> only accepts a strict 6-digit hex — a non-hex committed value
// (including the UNSET "" clear state) falls back to this neutral default, never overwriting
// `value`/`draft` itself.
//
// IT IS A MID-TONE, NOT BLACK (side-eye 2026-08-08 P3). The fallback was `#000000`, which meant an UNSET
// field opened its picker already showing black: against the near-black popup the swatch read as an empty
// hole, and INSIDE the picker "no colour is set" and "the colour is set to black" were the same pixels —
// the exact indistinguishability the tag editor's own readout sentence exists to fix one level up. A mid
// grey is legible on either a light or a dark popup and is obviously not a chosen colour. It is still only
// a DISPLAY seed: nothing commits until the user picks, so an unset field that is opened and dismissed
// stays unset.
const FALLBACK_NATIVE_HEX = "#808080";

/**
 * The editable color field — a swatch trigger that opens a popover with a native
 * `<input type="color">` plus a hex text field, the always-present keyboard/SR-operable
 * alternative. `isSafeColor` (imported from `content/theme-scope/clamp`, not re-derived) rejects
 * an unparsable/injected value inline before it reaches `onValueChange`. A "Reset to default"
 * button emits the empty `""` sentinel for the consumer's own clear semantic; deleting the hex
 * field mid-typing never fires a clear (a transiently-empty draft fails the commit gate).
 */
export function ColorField({
  value,
  onValueChange,
  onOpenChange,
  disabled = false,
  loading = false,
  success = false,
  className,
  resetLabel = "Reset to default",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
}: ColorFieldProps): ReactElement {
  const slots = colorFieldVariants();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isDraftValid = isSafeColor(draft);
  // An empty draft is the "clear = inherit" state, not a validation error — isSafeColor("") is
  // correctly false, so the error must gate on a non-empty value that fails the clamp.
  const showError = draft.trim() !== "" && !isDraftValid;
  const nativeHex = NATIVE_HEX_RE.test(draft) ? draft : FALLBACK_NATIVE_HEX;

  const handleOpenChange = (next: boolean, details: ColorFieldOpenChangeDetails): void => {
    setOpen(next);
    onOpenChange?.(next, details);
    if (next) {
      // Re-seed from the last committed value — a draft left over from a prior open/cancel must never resurface.
      setDraft(value);
    }
  };

  const commit = (next: string): void => {
    setDraft(next);
    if (isSafeColor(next)) {
      onValueChange(next);
    }
  };

  // The explicit clear: emits "" so the consumer maps it to its own clear semantic. Deliberately not
  // wired to a transiently-empty hex draft — commit("") never fires since isSafeColor("") is false.
  const handleReset = (): void => {
    setDraft("");
    onValueChange("");
    setOpen(false);
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
                data-loading={loading ? "" : undefined}
                data-slot="color-field-trigger"
                data-success={success ? "" : undefined}
                // biome-ignore lint/nursery/useNullishCoalescing: a real boolean OR — `disabled`/`loading` are both plain `boolean` (defaulted above), so `??` (which only falls through on null/undefined) would silently ignore an explicit `false` and isn't equivalent here.
                disabled={disabled || loading}
                type="button"
                // mergeProps treats an explicitly-declared key on this innermost element as an
                // override even when undefined — a bare id={id} would erase Field.Control's own
                // computed id, breaking label association whenever the caller doesn't pass one.
                {...(id === undefined ? {} : { id })}
                {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
                {...(ariaLabelledby === undefined ? {} : { "aria-labelledby": ariaLabelledby })}
                {...(ariaDescribedby === undefined ? {} : { "aria-describedby": ariaDescribedby })}
              >
                <ColorFieldTriggerGlyph isValid={isSafeColor(value)} loading={loading} slots={slots} success={success} value={value} />
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
          <Field className={slots.hexField()} label="Hex" {...(showError ? { error: "Enter a valid color (hex, rgb, hsl, or oklch)." } : {})}>
            <Input onValueChange={commit} spellCheck={false} value={draft} />
          </Field>
          <Button className={slots.resetButton()} data-slot="color-field-reset" intent="ghost" onClick={handleReset} size="sm" type="button">
            {resetLabel}
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
