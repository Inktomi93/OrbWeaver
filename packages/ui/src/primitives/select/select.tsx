import { Field as BaseField } from "@base-ui/react/field";
import type { SelectPositionerProps, SelectRootProps } from "@base-ui/react/select";
import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_INPUT, cn, usePortalContainer } from "#lib";
import { Check, ChevronDown, Icon } from "#primitives/icons";
import { selectVariants } from "./variants";

// Breathing room between trigger and popup.
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

const slots = selectVariants();

// Minimal DOM shape for the hidden-input a11y fixup — the node typecheck lane has no `dom` lib.
interface AttributeSettable {
  setAttribute: (name: string, value: string) => void;
}

const CHEVRON_ICON: ReactElement = <Icon icon={ChevronDown} size="xs" />;

const CHECK_ICON: ReactElement = <Icon icon={Check} size="xs" />;

export interface SelectOption<Value = string> {
  label: string;
  value: Value;
  disabled?: boolean;
}

/** A labeled group of options — renders a `Select.GroupLabel` above its items. */
export interface SelectOptionGroup<Value = string> {
  label: string;
  items: readonly SelectOption<Value>[];
}

/** Flat options or grouped options — the seal renders `Select.Group` for the grouped shape. */
export type SelectItems<Value = string> = readonly SelectOption<Value>[] | readonly SelectOptionGroup<Value>[];

function isGrouped<Value>(items: SelectItems<Value>): items is readonly SelectOptionGroup<Value>[] {
  const first = items[0];
  return typeof first === "object" && "items" in first;
}

function renderOption<Value>(option: SelectOption<Value>): ReactElement {
  return (
    <BaseSelect.Item className={slots.item()} data-slot="select-item" disabled={option.disabled} key={String(option.value)} value={option.value}>
      <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className={slots.itemIndicator()} data-slot="select-item-indicator">
        {CHECK_ICON}
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

function renderGroup<Value>(group: SelectOptionGroup<Value>): ReactElement {
  return (
    <BaseSelect.Group className={slots.group()} data-slot="select-group" key={group.label}>
      <BaseSelect.GroupLabel className={slots.groupLabel()} data-slot="select-group-label">
        {group.label}
      </BaseSelect.GroupLabel>
      {group.items.map(renderOption)}
    </BaseSelect.Group>
  );
}

function renderItems<Value>(items: SelectItems<Value>): ReactNode {
  if (isGrouped(items)) {
    // A Separator between adjacent groups, not before the first.
    return items.flatMap((group, index) =>
      index > 0
        ? [<BaseSelect.Separator className={slots.separator()} data-slot="select-separator" key={`separator-${group.label}`} />, renderGroup(group)]
        : [renderGroup(group)],
    );
  }
  return items.map(renderOption);
}

export interface SelectProps<Value = string, Multiple extends boolean = false> extends Omit<SelectRootProps<Value, Multiple>, "items"> {
  /**
   * The options — flat (`{ label, value }[]`) or grouped (`{ label, items }[]`). `Select.Value`
   * renders the selected option's label(s) automatically (comma-joined when `multiple`).
   */
  items: SelectItems<Value>;
  placeholder?: ReactNode;
  /** Applied to the trigger (the in-flow element). */
  className?: string;
  /**
   * A visible accessible label rendered above the trigger. Omit when the Select composes inside a
   * `<Field>` or when `aria-label` suffices. Base UI's `Select.Label` doesn't reach the Trigger's
   * `aria-labelledby` standalone (outside `<Field>`), so we wire it ourselves via a locally-`useId()`'d
   * span (unless the caller passes an explicit `aria-labelledby`, which wins).
   */
  label?: ReactNode;
  /** Custom formatting for the trigger's selected-value text, forwarded to `Select.Value`'s render-fn. */
  renderValue?: (value: unknown) => ReactNode;
  /** Render sticky hover-to-scroll arrows in the popup (long lists). @defaultValue false */
  scrollArrows?: boolean;
  /** Render a dimming `bg-scrim` backdrop behind the (modal-by-default) popup. @defaultValue false */
  backdrop?: boolean;
  /** Render an arrow pointing at the trigger inside the popup. @defaultValue false */
  arrow?: boolean;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" (Base UI default) */
  side?: SelectPositionerProps["side"];
  /** Alignment on the side. @defaultValue "start" (Base UI default) */
  align?: SelectPositionerProps["align"];
  /** Anchor gap in px. @defaultValue 4 */
  sideOffset?: SelectPositionerProps["sideOffset"];
  /** Portal target — defaults to the themed portal root; pass a node/ref to override. */
  container?: PortalContainer;
  /** Accessible name for the trigger. `Select.Root` renders no element, so these ride the Trigger. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * The select — Base UI Select sealed with the full explicit anatomy (Trigger/Value/Icon → Portal →
 * Positioner → Popup → List/Item), so features never hand-assemble parts. The generics thread Base
 * UI's `<Value, Multiple>` overload: pass `multiple` and the value becomes an array.
 */
export function Select<Value = string, Multiple extends boolean = false>(props: SelectProps<Value, Multiple>): ReactElement {
  const {
    items,
    placeholder,
    className,
    label,
    renderValue,
    scrollArrows = false,
    backdrop = false,
    arrow = false,
    side,
    align,
    sideOffset = POPUP_SIDE_OFFSET,
    container,
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-describedby": ariaDescribedby,
    ...rootProps
  } = props;
  // The grouped shape ({ label, items }) is a Base UI `Group` structurally; the union widening to
  // Root's `items` type needs a nudge the compiler won't infer through our stricter option union.
  const rootItems = items as SelectRootProps<Value, Multiple>["items"];
  const portalContainer = usePortalContainer();
  const hasLabel = label !== undefined && label !== null;
  // Base UI's Select.Label strips any id we pass, so the association id lives on an inner span instead.
  const generatedLabelId = useId();
  const labelId = hasLabel ? generatedLabelId : undefined;

  // The visually hidden input Base UI generates for form submission gets flagged by axe-core as an
  // unlabeled interactive element; give it a fallback accessible name.
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (hiddenInputRef.current) {
      const node = hiddenInputRef.current as AttributeSettable;
      const fallbackLabel = ariaLabel !== undefined && ariaLabel !== "" ? ariaLabel : ariaLabelledby;
      node.setAttribute("aria-label", fallbackLabel !== undefined && fallbackLabel !== "" ? fallbackLabel : "Hidden select value");
    }
  }, [ariaLabel, ariaLabelledby]);

  return (
    <BaseSelect.Root items={rootItems} inputRef={hiddenInputRef} {...rootProps}>
      {hasLabel ? (
        <BaseSelect.Label className={slots.label()} data-slot="select-label">
          <span id={labelId}>{label}</span>
        </BaseSelect.Label>
      ) : null}
      <BaseField.Control
        render={
          // Aria props spread conditionally: mergeProps is rightmost-wins, so an explicit undefined
          // would beat the context-injected aria-labelledby from Field.Control.
          <BaseSelect.Trigger
            {...(ariaDescribedby !== undefined ? { "aria-describedby": ariaDescribedby } : {})}
            {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
            {...((ariaLabelledby ?? labelId) !== undefined ? { "aria-labelledby": ariaLabelledby ?? labelId } : {})}
            className={cn(slots.trigger(), className)}
            data-slot="select-trigger"
            id={id}
          >
            <BaseSelect.Value placeholder={placeholder}>{renderValue}</BaseSelect.Value>
            <BaseSelect.Icon className={slots.icon()} data-slot="select-icon">
              {CHEVRON_ICON}
            </BaseSelect.Icon>
          </BaseSelect.Trigger>
        }
      />
      <BaseSelect.Portal container={container ?? portalContainer}>
        {backdrop ? <BaseSelect.Backdrop className={slots.backdrop()} data-slot="select-backdrop" /> : null}
        <BaseSelect.Positioner
          align={align}
          // Scroll arrows only function in Base UI's align-item-with-trigger mode.
          alignItemWithTrigger={scrollArrows}
          className={slots.positioner()}
          data-slot="select-positioner"
          side={side}
          sideOffset={sideOffset}
        >
          <BaseSelect.Popup className={slots.popup()} data-slot="select-popup">
            {arrow ? <BaseSelect.Arrow className={slots.arrow()} data-slot="select-arrow" /> : null}
            {scrollArrows ? (
              <BaseSelect.ScrollUpArrow className={cn(slots.scrollArrow(), "top-0")} data-slot="select-scroll-up-arrow">
                {CHEVRON_ICON}
              </BaseSelect.ScrollUpArrow>
            ) : null}
            <BaseSelect.List data-slot="select-list">{renderItems(items)}</BaseSelect.List>
            {scrollArrows ? (
              <BaseSelect.ScrollDownArrow className={cn(slots.scrollArrow(), "bottom-0")} data-slot="select-scroll-down-arrow">
                {CHEVRON_ICON}
              </BaseSelect.ScrollDownArrow>
            ) : null}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
