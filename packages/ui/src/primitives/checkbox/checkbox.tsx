import type { CheckboxRootProps } from "@base-ui/react/checkbox";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactElement } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Check/Minus/Icon fine.
import { Check, Icon, Minus } from "#primitives/icons";
import { checkboxVariants } from "./variants";

export interface CheckboxProps extends CheckboxRootProps {
  className?: string;
}

/**
 * The checkbox — Base UI Checkbox (Root + Indicator) sealed behind the token skin; checked and
 * indeterminate both flip to the primary token with a glyph, and the hit area meets the ≥44px touch
 * floor. Controlled-capable via `checked`/`onCheckedChange` passthrough (D42 §2 — Base UI seal).
 *
 * Usage: `<Checkbox aria-label="Remember me" checked={on} onCheckedChange={setOn} />`
 */
export function Checkbox({ className, ...rest }: CheckboxProps): ReactElement {
  const slots = checkboxVariants();
  return (
    <BaseCheckbox.Root className={cn(slots.root(), className)} {...rest}>
      <BaseCheckbox.Indicator className={slots.indicator()} keepMounted={true}>
        <Icon className={slots.check()} icon={Check} size="xs" />
        <Icon className={slots.dash()} icon={Minus} size="xs" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
