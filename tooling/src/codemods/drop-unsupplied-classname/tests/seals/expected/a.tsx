export type AccordionItemProps = Omit<BaseItemProps, "className">;

export function AccordionItem(rest: AccordionItemProps): ReactElement {
  return <BaseAccordion.Item className={slots.item()} data-slot="accordion-item" {...rest} />;
}

export interface MenuViewportProps extends Omit<BaseViewportProps, "className"> {
  readonly side?: string;
}

export function MenuViewport(props: MenuViewportProps): ReactElement {
  const { side, ...rest } = props;
  return <BaseMenu.Viewport  data-side={side} {...rest} />;
}

export interface KeptProps extends Omit<BaseItemProps, "className"> {
  className?: string;
}

export function Kept({ className, ...rest }: KeptProps): ReactElement {
  return <BaseAccordion.Item className={slots.item({ className })} {...rest} />;
}

export type FieldsetProps = Omit<BaseRootProps, "className">;

export function Fieldset(props: FieldsetProps): ReactElement {
  const rest = props;
  return <BaseFieldset.Root className={slots.root()} data-slot="fieldset-root" {...rest} />;
}

export interface RadioProps extends BaseRadioGroupProps {
  className?: string;
}

export function Radio({ className, ...rest }: RadioProps): ReactElement {
  return <BaseRadioGroup className={cn(slots.root(), className)} {...rest} />;
}

export type SwipeProps = Omit<BaseSwipeProps, "className"> & VariantProps<typeof variants>;

export function Swipe({ side, ...rest }: SwipeProps): ReactElement {
  return <BaseSwipe className={slots.swipe()} {...rest} />;
}
