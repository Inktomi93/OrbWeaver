import type { ToggleProps as BaseToggleProps } from "@base-ui/react/toggle";
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { toggle } from "./variants";

export interface ToggleProps extends BaseToggleProps<string>, VariantProps<typeof toggle> {
  className?: string;
}

/**
 * The toggle — Base UI Toggle sealed behind the token skin; a two-state pressable button
 * (bold/italic-style), pressed state on `data-pressed`. Controlled-capable via
 * `pressed`/`onPressedChange`; a bad `intent`/`size` is a tsc error (D42 §2 — Base UI seal).
 *
 * Usage: `<Toggle aria-label="Bold" pressed={bold} onPressedChange={setBold}>B</Toggle>`
 */
export function Toggle({ className, intent, size, ...rest }: ToggleProps): ReactElement {
  return <BaseToggle className={cn(toggle({ intent, size }), className)} {...rest} />;
}
