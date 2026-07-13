import type { ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { buttonVariants } from "./variants";

export interface ButtonProps extends BaseButtonProps, VariantProps<typeof buttonVariants> {
  className?: string;
  /** Busy state: sets `aria-busy` and disables the button (a state, not a variant). */
  loading?: boolean;
}

export function Button({
  className,
  intent,
  size,
  loading = false,
  disabled = false,
  focusableWhenDisabled,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <BaseButton
      data-slot="button"
      // The gradient-border accent ring keys off this attr, painting on the primary CTA only.
      data-cta={intent === "primary" ? "" : undefined}
      aria-busy={loading ? true : undefined}
      className={cn(buttonVariants({ intent, size }), className)}
      disabled={disabled || loading}
      // Loading is a transient busy state, not a real disablement — stay in the tab sequence for AT.
      focusableWhenDisabled={focusableWhenDisabled ?? loading}
      {...rest}
    />
  );
}
