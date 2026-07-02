import type { ButtonProps as BaseButtonProps } from "@base-ui/react/button";
import { Button as BaseButton } from "@base-ui/react/button";
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { cn } from "#lib";
import { button } from "./variants";

export interface ButtonProps extends BaseButtonProps, VariantProps<typeof button> {
  className?: string;
  /** Busy state: sets `aria-busy` and disables the button (a state, not a variant). */
  loading?: boolean;
}

/**
 * The one button — Base UI Button sealed behind the token skin (D42 §2 — Base UI seal;
 * ui-package-design §5 — tv variant unions, a bad `intent`/`size` is a tsc error).
 *
 * Usage: `<Button intent="destructive" size="sm" onClick={onDelete}>Delete</Button>`
 */
export function Button({
  className,
  intent,
  size,
  loading = false,
  disabled = false,
  ...rest
}: ButtonProps): ReactElement {
  return (
    <BaseButton
      aria-busy={loading ? true : undefined}
      className={cn(button({ intent, size }), className)}
      disabled={disabled || loading}
      {...rest}
    />
  );
}
