import type { CheckboxRootProps } from "@base-ui/react/checkbox";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ReactElement } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Check/Icon/Lock/Minus fine.
import { Check, Icon, Lock, Minus } from "#primitives/icons";
import { checkboxVariants } from "./variants";

export interface CheckboxProps extends CheckboxRootProps {
  className?: string;
}

/**
 * The checkbox — Base UI Checkbox (Root + Indicator) sealed behind the token skin; checked and
 * indeterminate both flip to the primary token with a glyph, and the hit area meets the ≥44px touch
 * floor. Controlled-capable via `checked`/`onCheckedChange` passthrough (D42 §2 — Base UI seal).
 *
 * `readOnly` (Base UI passthrough — sets `data-readonly`, blocks pointer/keyboard toggling) renders
 * DISTINCTLY from `disabled`: the border/fill keep their normal token colors (never the
 * `data-disabled` grey-out) and a Lock glyph replaces the check/dash mark as the non-color
 * "you can't touch this" signal (mirrors `Switch`'s treatment — ui-package-design work-order A3).
 *
 * Usage: `<Checkbox aria-label="Remember me" checked={on} onCheckedChange={setOn} />`
 * Read-only: `<Checkbox aria-label="Archived" checked readOnly />`
 */
export function Checkbox({ className, ...rest }: CheckboxProps): ReactElement {
  const slots = checkboxVariants();
  return (
    <BaseCheckbox.Root className={cn(slots.root(), className)} data-slot="checkbox-root" {...rest}>
      <BaseCheckbox.Indicator
        className={slots.indicator()}
        data-slot="checkbox-indicator"
        keepMounted={true}
      >
        <Icon className={slots.check()} icon={Check} size="xs" />
        <Icon className={slots.dash()} icon={Minus} size="xs" />
        <Icon className={slots.readOnlyIcon()} icon={Lock} size="xs" />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
