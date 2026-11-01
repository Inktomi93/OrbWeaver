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
import { accordionVariants } from "./variants.ts";

const slots = accordionVariants();

export type AccordionProps = Omit<BaseRootProps, "className">;

// Keyboard focus is plain tab order, not roving nav — Base UI deprecated loopFocus/arrow-key roving focus.
export function Accordion(props: AccordionProps): ReactElement {
  return <BaseAccordion.Root className={slots.root()} data-slot="accordion-root" {...props} />;
}

export type AccordionItemProps = Omit<BaseItemProps, "className">;

export function AccordionItem(props: AccordionItemProps): ReactElement {
  return <BaseAccordion.Item className={slots.item()} data-slot="accordion-item" {...props} />;
}

export type AccordionHeaderProps = Omit<BaseHeaderProps, "className">;

export function AccordionHeader(props: AccordionHeaderProps): ReactElement {
  return <BaseAccordion.Header className={slots.header()} data-slot="accordion-header" {...props} />;
}

export type AccordionTriggerProps = Omit<BaseTriggerProps, "className">;

/** Bakes the trailing `ChevronDown` that rotates on open. */
export function AccordionTrigger({ children, ...rest }: AccordionTriggerProps): ReactElement {
  return (
    <BaseAccordion.Trigger className={slots.trigger()} data-slot="accordion-trigger" {...rest}>
      {children}
      <Icon icon={ChevronDown} size="sm" className={slots.chevron()} />
    </BaseAccordion.Trigger>
  );
}

export type AccordionPanelProps = Omit<BasePanelProps, "className">;

/** Animates height off Base UI's `--accordion-panel-height` var. */
export function AccordionPanel(props: AccordionPanelProps): ReactElement {
  return <BaseAccordion.Panel className={slots.panel()} data-slot="accordion-panel" {...props} />;
}
