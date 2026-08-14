import type {
  CollapsiblePanelProps as BasePanelProps,
  CollapsibleRootProps as BaseRootProps,
  CollapsibleTriggerProps as BaseTriggerProps,
} from "@base-ui/react/collapsible";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type { ReactElement } from "react";
import { ChevronDown, Icon } from "#primitives/icons";
import { collapsibleVariants } from "./variants.ts";

const slots = collapsibleVariants({ instant: false });

export interface CollapsibleProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

export function Collapsible({ className, ...rest }: CollapsibleProps): ReactElement {
  return <BaseCollapsible.Root className={slots.root({ className })} data-slot="collapsible-root" {...rest} />;
}

export interface CollapsibleTriggerProps extends Omit<BaseTriggerProps, "className"> {
  className?: string;
  /** Bake the trailing `ChevronDown` that rotates on open (the discovery affordance; default `true`). Set
   *  `false` when the consumer renders its OWN chevron/icon inside the trigger, to avoid a double chevron. */
  chevron?: boolean;
}

/** Bakes the trailing `ChevronDown` that rotates on `data-panel-open` (the accordion precedent) unless the
 *  consumer opts out with `chevron={false}` (it renders its own). */
export function CollapsibleTrigger({ className, chevron = true, children, ...rest }: CollapsibleTriggerProps): ReactElement {
  return (
    <BaseCollapsible.Trigger className={slots.trigger({ className })} data-slot="collapsible-trigger" {...rest}>
      {children}
      {chevron ? <Icon icon={ChevronDown} size="sm" className={slots.chevron()} /> : null}
    </BaseCollapsible.Trigger>
  );
}

export interface CollapsiblePanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
  /** Snap the height change instead of the smooth fold (no perceptible transition — mirrors the
   *  reduced-motion floor). Set on an AUTO open/close where the content BELOW the panel must land at its
   *  final position in one commit (the reasoning disclosure's answer-token collapse). Default `false`. */
  instant?: boolean;
}

// Removed from the DOM while closed by default. `keepMounted` keeps it mounted but hidden;
// `hiddenUntilFound` renders `hidden="until-found"` so find-in-page can locate + auto-expand it.
export function CollapsiblePanel({ className, instant = false, ...rest }: CollapsiblePanelProps): ReactElement {
  return <BaseCollapsible.Panel className={collapsibleVariants({ instant }).panel({ className })} data-slot="collapsible-panel" {...rest} />;
}
