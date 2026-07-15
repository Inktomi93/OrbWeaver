import type { SwitchRootProps } from "@base-ui/react/switch";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactElement } from "react";
import { cn } from "#lib";
import { Icon, Lock } from "#primitives/icons";
import { switchVariants } from "./variants";

export interface SwitchProps extends SwitchRootProps {
  className?: string;
}

// `readOnly` renders distinctly from `disabled`: track/thumb keep their normal ON/OFF colors and a
// Lock glyph fades in on the thumb as the non-color "you can't touch this" signal.
export function Switch({ className, ...rest }: SwitchProps): ReactElement {
  const slots = switchVariants();
  return (
    <BaseSwitch.Root className={cn(slots.root(), className)} data-slot="switch-root" {...rest}>
      <BaseSwitch.Thumb className={slots.thumb()} data-slot="switch-thumb">
        <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
      </BaseSwitch.Thumb>
    </BaseSwitch.Root>
  );
}
