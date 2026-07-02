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
  return <BaseCollapsible.Root className={slots.root({ className })} {...rest} />;
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
  return <BaseCollapsible.Trigger className={slots.trigger({ className })} {...rest} />;
}

export interface CollapsiblePanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
}

/**
 * The revealed content — animates height from Base UI's `--collapsible-panel-height` var
 * (variants §5). Kept out of the DOM while closed by default (`keepMounted` overridable).
 * `<CollapsiblePanel>…</CollapsiblePanel>`
 * Spec: ui-package-design §6.1.
 */
export function CollapsiblePanel({ className, ...rest }: CollapsiblePanelProps): ReactElement {
  return <BaseCollapsible.Panel className={slots.panel({ className })} {...rest} />;
}
