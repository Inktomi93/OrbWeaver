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

export function Collapsible({ className, ...rest }: CollapsibleProps): ReactElement {
  return <BaseCollapsible.Root className={slots.root({ className })} data-slot="collapsible-root" {...rest} />;
}

export interface CollapsibleTriggerProps extends Omit<BaseTriggerProps, "className"> {
  className?: string;
}

export function CollapsibleTrigger({ className, ...rest }: CollapsibleTriggerProps): ReactElement {
  return <BaseCollapsible.Trigger className={slots.trigger({ className })} data-slot="collapsible-trigger" {...rest} />;
}

export interface CollapsiblePanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
}

// Removed from the DOM while closed by default. `keepMounted` keeps it mounted but hidden;
// `hiddenUntilFound` renders `hidden="until-found"` so find-in-page can locate + auto-expand it.
export function CollapsiblePanel({ className, ...rest }: CollapsiblePanelProps): ReactElement {
  return <BaseCollapsible.Panel className={slots.panel({ className })} data-slot="collapsible-panel" {...rest} />;
}
