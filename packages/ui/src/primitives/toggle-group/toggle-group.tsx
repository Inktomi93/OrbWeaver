import type { ToggleGroupProps as BaseToggleGroupProps } from "@base-ui/react/toggle-group";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { toggleGroupVariants } from "./variants";

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS branch.
export interface ToggleGroupProps extends Omit<BaseToggleGroupProps<string>, "orientation"> {
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /**
   * `radio` makes the group the owning `role="radiogroup"` for cells rendered with
   * `<Toggle semantics="radio">` — a ONE-OF-N segmented strip rather than N independent pressed buttons
   * (side-eye ARIA rec 7). The default `toggle` arm is Base UI's own `role="group"`, unchanged.
   */
  semantics?: "toggle" | "radio";
}

export function ToggleGroup({
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  semantics = "toggle",
  ...rest
}: ToggleGroupProps): ReactElement {
  return (
    <BaseToggleGroup
      data-slot="toggle-group"
      className={cn(toggleGroupVariants(), className)}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      {...(ariaLabelledby !== undefined ? { "aria-labelledby": ariaLabelledby } : {})}
      {...(semantics === "radio" ? { role: "radiogroup" } : {})}
      {...rest}
    />
  );
}
