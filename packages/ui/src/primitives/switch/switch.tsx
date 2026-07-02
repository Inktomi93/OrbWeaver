import type { SwitchRootProps } from "@base-ui/react/switch";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { switchVariants } from "./variants";

export interface SwitchProps extends SwitchRootProps {
  className?: string;
}

/**
 * The on/off toggle — Base UI Switch (Root + Thumb) sealed behind the token skin;
 * controlled-capable via `checked`/`onCheckedChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<Switch aria-label="Streaming" checked={enabled} onCheckedChange={setEnabled} />`
 */
export function Switch({ className, ...rest }: SwitchProps): ReactElement {
  const slots = switchVariants();
  return (
    <BaseSwitch.Root className={cn(slots.root(), className)} {...rest}>
      <BaseSwitch.Thumb className={slots.thumb()} />
    </BaseSwitch.Root>
  );
}
