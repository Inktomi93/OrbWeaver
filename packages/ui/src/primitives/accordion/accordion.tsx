import type {
  AccordionHeaderProps as BaseHeaderProps,
  AccordionItemProps as BaseItemProps,
  AccordionPanelProps as BasePanelProps,
  AccordionRootProps as BaseRootProps,
  AccordionTriggerProps as BaseTriggerProps,
} from "@base-ui/react/accordion";
import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type { ReactElement } from "react";
import { ChevronDown, Icon } from "#primitives/icons";
import { accordionVariants } from "./variants";

const slots = accordionVariants();

export interface AccordionProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

// Keyboard focus is plain tab order, not roving nav — Base UI deprecated loopFocus/arrow-key roving focus.
export function Accordion({ className, ...rest }: AccordionProps): ReactElement {
  return <BaseAccordion.Root className={slots.root({ className })} data-slot="accordion-root" {...rest} />;
}

export interface AccordionItemProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

export function AccordionItem({ className, ...rest }: AccordionItemProps): ReactElement {
  return <BaseAccordion.Item className={slots.item({ className })} data-slot="accordion-item" {...rest} />;
}

export interface AccordionHeaderProps extends Omit<BaseHeaderProps, "className"> {
  className?: string;
}

export function AccordionHeader({ className, ...rest }: AccordionHeaderProps): ReactElement {
  return <BaseAccordion.Header className={slots.header({ className })} data-slot="accordion-header" {...rest} />;
}

export interface AccordionTriggerProps extends Omit<BaseTriggerProps, "className"> {
  className?: string;
}

/** Bakes the trailing `ChevronDown` that rotates on open. */
export function AccordionTrigger({ className, children, ...rest }: AccordionTriggerProps): ReactElement {
  return (
    <BaseAccordion.Trigger className={slots.trigger({ className })} data-slot="accordion-trigger" {...rest}>
      {children}
      <Icon icon={ChevronDown} size="sm" className={slots.chevron()} />
    </BaseAccordion.Trigger>
  );
}

export interface AccordionPanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
}

/** Animates height off Base UI's `--accordion-panel-height` var. */
export function AccordionPanel({ className, ...rest }: AccordionPanelProps): ReactElement {
  return <BaseAccordion.Panel className={slots.panel({ className })} data-slot="accordion-panel" {...rest} />;
}
