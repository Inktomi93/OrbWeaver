import type {
  AccordionHeaderProps as BaseHeaderProps,
  AccordionItemProps as BaseItemProps,
  AccordionPanelProps as BasePanelProps,
  AccordionRootProps as BaseRootProps,
  AccordionTriggerProps as BaseTriggerProps,
} from "@base-ui/react/accordion";
import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type { ReactElement } from "react";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the icons subpath; tsc + vite resolve ChevronDown fine.
import { ChevronDown, Icon } from "#primitives/icons";
import { accordionVariants } from "./variants";

const slots = accordionVariants();

export interface AccordionProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

/**
 * Accordion root — seals Base UI Accordion (value-driven open state, roving keyboard nav, ARIA).
 * `multiple` lets several sections stay open at once; single-open is the default.
 * `<Accordion><AccordionItem value="a"><AccordionHeader><AccordionTrigger>…</AccordionTrigger></AccordionHeader><AccordionPanel>…</AccordionPanel></AccordionItem></Accordion>`
 * Spec: ui-package-design §6.1 — multiple collapsible sections in the crew/rpg panels.
 */
export function Accordion({ className, ...rest }: AccordionProps): ReactElement {
  return <BaseAccordion.Root className={slots.root({ className })} {...rest} />;
}

export interface AccordionItemProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

/**
 * One section — pairs a header with its panel, keyed by `value`.
 * `<AccordionItem value="stats">…</AccordionItem>`
 * Spec: ui-package-design §6.1.
 */
export function AccordionItem({ className, ...rest }: AccordionItemProps): ReactElement {
  return <BaseAccordion.Item className={slots.item({ className })} {...rest} />;
}

export interface AccordionHeaderProps extends Omit<BaseHeaderProps, "className"> {
  className?: string;
}

/**
 * The section heading element (wraps the trigger; renders the correct heading semantics).
 * `<AccordionHeader><AccordionTrigger>Stats</AccordionTrigger></AccordionHeader>`
 * Spec: ui-package-design §6.1.
 */
export function AccordionHeader({ className, ...rest }: AccordionHeaderProps): ReactElement {
  return <BaseAccordion.Header className={slots.header({ className })} {...rest} />;
}

export interface AccordionTriggerProps extends Omit<BaseTriggerProps, "className"> {
  className?: string;
}

/**
 * The toggle for a section — bakes the trailing `ChevronDown` that rotates on open
 * (`data-panel-open`, variants §5). Renders a `<button>` with `aria-expanded`/`aria-controls`.
 * `<AccordionTrigger>Stats</AccordionTrigger>`
 * Spec: ui-package-design §6.1 — chevron via `@orb/ui/icons`, rotating on open.
 */
export function AccordionTrigger({
  className,
  children,
  ...rest
}: AccordionTriggerProps): ReactElement {
  return (
    <BaseAccordion.Trigger className={slots.trigger({ className })} {...rest}>
      {children}
      <Icon icon={ChevronDown} size="sm" className={slots.chevron()} />
    </BaseAccordion.Trigger>
  );
}

export interface AccordionPanelProps extends Omit<BasePanelProps, "className"> {
  className?: string;
}

/**
 * The revealed content — animates height off Base UI's `--accordion-panel-height` var (variants §5).
 * `<AccordionPanel>…</AccordionPanel>`
 * Spec: ui-package-design §6.1.
 */
export function AccordionPanel({ className, ...rest }: AccordionPanelProps): ReactElement {
  return <BaseAccordion.Panel className={slots.panel({ className })} {...rest} />;
}
