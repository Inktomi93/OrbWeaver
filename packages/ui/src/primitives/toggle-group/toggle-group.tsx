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
}

export function ToggleGroup({ className, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, ...rest }: ToggleGroupProps): ReactElement {
  return (
    <BaseToggleGroup
      data-slot="toggle-group"
      className={cn(toggleGroupVariants(), className)}
      {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
      {...(ariaLabelledby !== undefined ? { "aria-labelledby": ariaLabelledby } : {})}
      {...rest}
    />
  );
}
