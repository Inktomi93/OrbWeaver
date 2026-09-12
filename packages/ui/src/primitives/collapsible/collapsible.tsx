import type {
  CollapsiblePanelProps as BasePanelProps,
  CollapsibleRootProps as BaseRootProps,
  CollapsibleTriggerProps as BaseTriggerProps,
} from "@base-ui/react/collapsible";
import { Collapsible as BaseCollapsible } from "@base-ui/react/collapsible";
import type { ReactElement } from "react";
import { variantAttrs } from "#lib";
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
  /** The trigger's BOX. `control` (the default since #884 C2 — the inversion) pins the pointer-conditional
   *  `--spacing-control-sm` row floor: a disclosure is the thing you press to reach a whole section, and
   *  the recurring defect was this arm not taken. `text` is text-height, for a disclosure sitting in
   *  running content where a control box would shear it off its copy — every `size="text"` mount owes a
   *  reasoned `@orb-waive sub-floor-disclosure("text"): <reason>` waiver (policy `sub-floor-disclosure`; variants.ts carries the
   *  measurements). */
  size?: "text" | "control";
}

/** Bakes the trailing `ChevronDown` that rotates on `data-panel-open` (the accordion precedent) unless the
 *  consumer opts out with `chevron={false}` (it renders its own). */
export function CollapsibleTrigger({ className, chevron = true, size = "control", children, ...rest }: CollapsibleTriggerProps): ReactElement {
  return (
    // STAMP SITE (#1097): the TRIGGER, not the root. `size` IS the trigger's tap box (`text` vs the
    // `control` floor), and the tap-target census reads the axis off the interactive element itself.
    <BaseCollapsible.Trigger
      className={collapsibleVariants({ instant: false, size }).trigger({ className })}
      data-slot="collapsible-trigger"
      {...variantAttrs(collapsibleVariants, { size })}
      {...rest}
    >
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
