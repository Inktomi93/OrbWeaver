import type {
  CollapsiblePanelProps as BasePanelProps,
  CollapsibleRootProps as BaseRootProps,
  CollapsibleTriggerProps as BaseTriggerProps,
} from "@base-ui/react/collapsible";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type { ReactElement } from "react";
import { collapsibleVariants } from "./variants";

const slots = collapsibleVariants();

export interface CollapsibleProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

/**
 * Collapsible root — seals Base UI Collapsible (open/close state, ARIA wiring, and the
 * `--collapsible-panel-height` measurement come free). Controlled via `open`/`onOpenChange`,
 * uncontrolled via `defaultOpen`.
 * `<Collapsible><CollapsibleTrigger>Advanced</CollapsibleTrigger><CollapsiblePanel>…</CollapsiblePanel></Collapsible>`
 * Spec: ui-package-design §6.1 — the "advanced" expandable line in the crew/rpg panels.
 */
export function Collapsible({ className, ...rest }: CollapsibleProps): ReactElement {
  return (
    <BaseCollapsible.Root
      className={slots.root({ className })}
      data-slot="collapsible-root"
      {...rest}
    />
  );
}

export interface CollapsibleTriggerProps extends Omit<BaseTriggerProps, "className"> {
  className?: string;
}

/**
 * The toggle control (renders a `<button>` with `aria-expanded`/`aria-controls`).
 * `<CollapsibleTrigger>Advanced options</CollapsibleTrigger>`
 * Spec: ui-package-design §6.1.
 */
export function CollapsibleTrigger({ className, ...rest }: CollapsibleTriggerProps): ReactElement {
  return (
    <BaseCollapsible.Trigger
      className={slots.trigger({ className })}
      data-slot="collapsible-trigger"
      {...rest}
    />
  );
}

export interface CollapsiblePanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
}

/**
 * The revealed content — animates height from Base UI's `--collapsible-panel-height` var
 * (variants §5). Removed from the DOM while closed by default. Two Base UI passthrough props (extended
 * from the Base panel type, §13 R2/R5):
 * - `keepMounted` — keep the panel mounted (but hidden) while closed, so its content stays in the DOM
 *   (form state / measurement survive a collapse).
 * - `hiddenUntilFound` — render closed with `hidden="until-found"` so the browser's find-in-page can
 *   locate the text and auto-expand the panel. Overrides `keepMounted` (implies mounted).
 * `<CollapsiblePanel hiddenUntilFound>…</CollapsiblePanel>`
 * Spec: ui-package-design §6.1 / §13 R2.
 */
export function CollapsiblePanel({ className, ...rest }: CollapsiblePanelProps): ReactElement {
  return (
    <BaseCollapsible.Panel
      className={slots.panel({ className })}
      data-slot="collapsible-panel"
      {...rest}
    />
  );
}
