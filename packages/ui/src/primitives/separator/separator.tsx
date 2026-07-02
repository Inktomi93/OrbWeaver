import type { SeparatorProps as BaseSeparatorProps } from "@base-ui/react/separator";
import { Separator as BaseSeparator } from "@base-ui/react/separator";
import type { ReactElement } from "react";
import { separatorVariants } from "./variants";

export interface SeparatorProps extends Omit<BaseSeparatorProps, "className"> {
  className?: string;
}

/**
 * A token-colored rule that divides content — seals Base UI Separator (renders the correct
 * `role="separator"` + `aria-orientation` for screen readers; do not hand-roll the ARIA).
 * `<Separator />` (horizontal) · `<Separator orientation="vertical" />` inside a `Row`.
 * Spec: ui-package-design §5/§6.1 (Base UI is THE headless primitive, D42).
 */
export function Separator(props: SeparatorProps): ReactElement {
  const { className, orientation = "horizontal", ...rest } = props;
  return (
    <BaseSeparator
      className={separatorVariants({ orientation, className })}
      orientation={orientation}
      {...rest}
    />
  );
}
