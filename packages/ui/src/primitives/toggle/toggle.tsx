import type { ToggleProps as BaseToggleProps } from "@base-ui/react/toggle";
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import type { ToneInkSelection } from "#lib";
import { variantProps } from "#lib";
import { toggleVariants } from "./variants.ts";

/** Every Toggle prop but the D336 colour pair, which {@link ToggleProps} adds with its exclusivity. */
interface ToggleBaseProps extends BaseToggleProps<string>, Omit<VariantProps<typeof toggleVariants>, "tone" | "ink"> {
  className?: string;
  /**
   * The cell's ARIA state model. `toggle` (default) is Base UI's own `aria-pressed` two-state button.
   * `radio` is the ONE-OF-N arm — `role="radio"` + `aria-checked`, for a segmented strip where exactly one
   * cell is chosen and "press again to release" is not what the control does (the preset deck's quality
   * dial; side-eye ARIA rec 7). Pair it with `<ToggleGroup semantics="radio">`, which supplies the owning
   * `role="radiogroup"`.
   *
   * `aria-pressed` is deliberately CLEARED on the radio arm: a role=radio carrying aria-pressed is one
   * control claiming two contradictory state models. Base UI merges the caller's element props OVER its
   * own, so an explicit `undefined` removes the attribute it stamps.
   */
  semantics?: "toggle" | "radio";
  /** The checked state for the `radio` arm — the group's value equals this cell's. Spelled as a plain prop
   *  rather than `aria-checked` at the call site so the ARIA vocabulary stays inside the seal (D42 §2). */
  checked?: boolean;
}

/** A named ink excludes a non-neutral tone: the ink would repaint the tone's meaning away (D336). */
export type ToggleProps = ToggleBaseProps & ToneInkSelection;

/**
 * The toggle — Base UI Toggle sealed behind the token skin; a two-state pressable button
 * (bold/italic-style), pressed state on `data-pressed`. Controlled-capable via
 * `pressed`/`onPressedChange`; a bad `variant`/`tone`/`size` is a tsc error (D42 §2 — Base UI seal).
 *
 * Usage: `<Toggle aria-label="Bold" pressed={bold} onPressedChange={setBold}>B</Toggle>`
 */
export function Toggle({ className, variant, tone, ink, size, shape, wrap, semantics = "toggle", checked, ...rest }: ToggleProps): ReactElement {
  const radioAria = semantics === "radio" ? { role: "radio", "aria-checked": checked === true, "aria-pressed": undefined } : {};
  const resolvedTone = tone ?? "neutral";
  // A neutral toggle recedes until pressed; a colour tone inks it with that tone's text role.
  const resolvedInk = ink ?? (resolvedTone === "neutral" ? "muted" : undefined);
  // The className, the axis stamp and the D336 tone scope, from ONE selection object. The AUTHORED choice sits beside
  // Base UI's RUNTIME `data-pressed` without shadowing it — the stamped vocabulary is closed to names Base UI never emits.
  return (
    <BaseToggle
      data-slot="toggle"
      {...variantProps(toggleVariants, { variant, tone: resolvedTone, ink: resolvedInk, size, shape, wrap }, className, resolvedTone)}
      {...rest}
      {...radioAria}
    />
  );
}
