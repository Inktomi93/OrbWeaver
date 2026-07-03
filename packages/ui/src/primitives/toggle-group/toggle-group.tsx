import type { ToggleGroupProps as BaseToggleGroupProps } from "@base-ui/react/toggle-group";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { toggleGroupVariants } from "./variants";

// `orientation` is narrowed OUT: Base UI accepts "vertical" but the variants ship no vertical CSS
// branch, so exposing it would promise a silently-broken layout. Vertical support (type + CSS +
// test, together) lands when a real consumer needs it — see ui-primitive-contract BATCH 1.
export interface ToggleGroupProps extends Omit<BaseToggleGroupProps<string>, "orientation"> {
  className?: string;
}

/**
 * The toggle-group — Base UI ToggleGroup wrapping `<Toggle>` (`@orb/ui/toggle`) children; single
 * selection by default, `multiple` for many. Controlled-capable via `value`/`onValueChange`
 * (an array of the pressed items' `value`s) (D42 §2 — Base UI seal).
 *
 * Usage: `<ToggleGroup value={align} onValueChange={setAlign}><Toggle value="left">L</Toggle></ToggleGroup>`
 */
export function ToggleGroup({ className, ...rest }: ToggleGroupProps): ReactElement {
  return (
    <BaseToggleGroup
      data-slot="toggle-group"
      className={cn(toggleGroupVariants(), className)}
      {...rest}
    />
  );
}
