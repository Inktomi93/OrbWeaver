import type { SwitchRootProps } from "@base-ui/react/switch";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ReactElement } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Icon/Lock fine.
import { Icon, Lock } from "#primitives/icons";
import { switchVariants } from "./variants";

export interface SwitchProps extends SwitchRootProps {
  className?: string;
}

/**
 * The on/off toggle — Base UI Switch (Root + Thumb) sealed behind the token skin;
 * controlled-capable via `checked`/`onCheckedChange` passthrough (D42 §2 — Base UI seal).
 *
 * `readOnly` (Base UI passthrough — sets `data-readonly` on Root/Thumb, blocks pointer/keyboard
 * toggling) renders DISTINCTLY from `disabled`: the track/thumb keep their normal ON/OFF token
 * colors (never the `data-disabled` grey-out — a non-host viewer must still read the state at a
 * glance) and a Lock glyph fades in on the thumb as the non-color "you can't touch this" signal
 * (ui-package-design work-order A3; chat-crew-design/07 §1 — member read-only toggles).
 *
 * Usage: `<Switch aria-label="Streaming" checked={enabled} onCheckedChange={setEnabled} />`
 * Read-only: `<Switch aria-label="Autopilot" checked={crew.autopilot} readOnly />`
 */
export function Switch({ className, ...rest }: SwitchProps): ReactElement {
  const slots = switchVariants();
  return (
    <BaseSwitch.Root className={cn(slots.root(), className)} {...rest}>
      <BaseSwitch.Thumb className={slots.thumb()}>
        <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
      </BaseSwitch.Thumb>
    </BaseSwitch.Root>
  );
}
