export interface AccordionItemProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

export function AccordionItem({ className, ...rest }: AccordionItemProps): ReactElement {
  return <BaseAccordion.Item className={slots.item({ className })} data-slot="accordion-item" {...rest} />;
}

export interface MenuViewportProps extends Omit<BaseViewportProps, "className"> {
  /** A class for the viewport. */
  className?: string;
  readonly side?: string;
}

export function MenuViewport(props: MenuViewportProps): ReactElement {
  const { className, side, ...rest } = props;
  return <BaseMenu.Viewport className={className} data-side={side} {...rest} />;
}

export interface KeptProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

export function Kept({ className, ...rest }: KeptProps): ReactElement {
  return <BaseAccordion.Item className={slots.item({ className })} {...rest} />;
}

export interface FieldsetProps extends Omit<BaseRootProps, "className"> {
  className?: string;
}

export function Fieldset(props: FieldsetProps): ReactElement {
  const { className, ...rest } = props;
  return <BaseFieldset.Root className={cn(slots.root(), className)} data-slot="fieldset-root" {...rest} />;
}

export interface RadioProps extends BaseRadioGroupProps {
  className?: string;
}

export function Radio({ className, ...rest }: RadioProps): ReactElement {
  return <BaseRadioGroup className={cn(slots.root(), className)} {...rest} />;
}

export interface SwipeProps extends Omit<BaseSwipeProps, "className">, VariantProps<typeof variants> {
  className?: string;
}

export function Swipe({ className, side, ...rest }: SwipeProps): ReactElement {
  return <BaseSwipe className={slots.swipe({ className })} {...rest} />;
}
