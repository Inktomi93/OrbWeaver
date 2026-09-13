import { Field as BaseField } from "@base-ui/react/field";
import type { SelectPositionerProps, SelectRootProps } from "@base-ui/react/select";
import { Select as BaseSelect } from "@base-ui/react/select";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import type { VariantProps } from "tailwind-variants";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_INPUT, cn, usePortalContainer } from "#lib";
import { Check, ChevronDown, Icon } from "#primitives/icons";
import { selectVariants } from "./variants.ts";

// Breathing room between trigger and popup.
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

// Two independent ceilings govern a Select popup: Base UI's live collision width keeps it inside the
// viewport, while the reading measure keeps explanatory option copy scannable on a wide desktop. CSS
// `min()` is the one honest intersection; two max-width utilities would tailwind-merge into one winner.
const POPUP_STYLE: CSSProperties = { maxWidth: "min(var(--available-width), var(--reading-measure))" };

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
  /**
   * A one-line gloss rendered UNDER the label inside the option row.
   *
   * It sits OUTSIDE `Select.ItemText` on purpose: `Select.Value` mirrors the selected option's
   * `ItemText` onto the closed trigger, so a gloss folded into that node would paint on the trigger too
   * and break the app-wide single-line-trigger convention (`value: min-w-0 truncate`).
   *
   * The slot exists because a legend living in the Field's `description` is OCCLUDED by the popup the
   * moment the select opens — the reader cannot see the explanation while making the choice it explains
   * (side-eye 2026-08-16, the chat-display modes).
   */
  description?: string;
  /**
   * Inline style for the option's LABEL text (`ItemText`) — the "seen, not read" slot (#866 §7.8): a
   * FONT option renders its label in its own typeface (`{ fontFamily: value }`), so the choice is seen
   * at the moment of choosing. Because `Select.Value` mirrors `ItemText`, the closed trigger inherits
   * the picked option's style too — deliberate (the chosen font shows itself). Style, not a className:
   * the value IS the datum (a derived `fontFamily`), never a second vocabulary.
   */
  labelStyle?: CSSProperties;
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

/**
 * A glossed option's description is a DESCRIPTION, not part of the name.
 *
 * `aria-hidden` on the visible gloss keeps the option's accessible name equal to its label (an
 * `option` takes its name from its own subtree, so an un-hidden gloss would silently rename every
 * option to "Label gloss…" and break every `getByRole("option", { name, exact })` in the tree), while
 * `aria-describedby` — whose target is used even when hidden, per accname §5.2 — hands the SAME text
 * to assistive tech as the description it is. The repo's own name-quality probe encodes this split:
 * `tests/support/browser/accessible-names.ts` strips the `aria-describedby` target before checking
 * WCAG 2.5.3, "a description is not a label".
 */
function optionDescriptionId(idPrefix: string, value: unknown): string {
  return `${idPrefix}-desc-${String(value)}`;
}

function renderOption<Value>(option: SelectOption<Value>, idPrefix: string): ReactElement {
  const describedBy = option.description === undefined ? undefined : optionDescriptionId(idPrefix, option.value);
  return (
    <BaseSelect.Item
      {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
      className={slots.item()}
      data-slot="select-item"
      disabled={option.disabled}
      key={String(option.value)}
      value={option.value}
    >
      <span className={slots.itemBody()} data-slot="select-item-body">
        <BaseSelect.ItemText {...(option.labelStyle === undefined ? {} : { style: option.labelStyle })}>{option.label}</BaseSelect.ItemText>
        {option.description === undefined ? null : (
          <span aria-hidden="true" className={slots.itemDescription()} data-slot="select-item-description" id={describedBy}>
            {option.description}
          </span>
        )}
      </span>
      <BaseSelect.ItemIndicator className={slots.itemIndicator()} data-slot="select-item-indicator">
        {CHECK_ICON}
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

function renderGroup<Value>(group: SelectOptionGroup<Value>, idPrefix: string): ReactElement {
  return (
    <BaseSelect.Group className={slots.group()} data-slot="select-group" key={group.label}>
      <BaseSelect.GroupLabel className={slots.groupLabel()} data-slot="select-group-label">
        {group.label}
      </BaseSelect.GroupLabel>
      {group.items.map((option) => renderOption(option, idPrefix))}
    </BaseSelect.Group>
  );
}

function renderItems<Value>(items: SelectItems<Value>, idPrefix: string): ReactNode {
  if (isGrouped(items)) {
    // A Separator between adjacent groups, not before the first.
    return items.flatMap((group, index) =>
      index > 0
        ? [<BaseSelect.Separator className={slots.separator()} data-slot="select-separator" key={`separator-${group.label}`} />, renderGroup(group, idPrefix)]
        : [renderGroup(group, idPrefix)],
    );
  }
  return items.map((option) => renderOption(option, idPrefix));
}

export interface SelectProps<Value = string, Multiple extends boolean = false> extends Omit<SelectRootProps<Value, Multiple>, "items"> {
  /**
   * The options — flat (`{ label, value }[]`) or grouped (`{ label, items }[]`). `Select.Value`
   * renders the selected option's label(s) automatically (comma-joined when `multiple`).
   */
  // @orb-waive baseui-derives-not-respells(items): the Root prop is Omit'd above precisely so this can be NARROWER — Base UI accepts `Record<string, ReactNode>` / loose object arrays / its own Group shape, and the seal renders one closed union (`SelectOption[] | SelectOptionGroup[]`) so `renderItems` can be total. Ends if the seal stops rendering the items itself.
  items: SelectItems<Value>;
  placeholder?: ReactNode;
  /** Applied to the trigger (the in-flow element). */
  className?: string;
  /**
   * The trigger's SCALE: `field` (default) is the form control; `inline` is the identity-line trigger —
   * text-height, content-width, chrome-free (the name IS the affordance). @defaultValue "field"
   */
  layout?: VariantProps<typeof selectVariants>["layout"];
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
  /** Render a dimming `bg-backdrop` backdrop behind the (modal-by-default) popup. @defaultValue false */
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
  /**
   * Accessible name for the trigger. `Select.Root` renders no element, so these ride the Trigger.
   *
   * INSIDE A `<Field>`, `aria-label` IS STILL WORTH PASSING even though the trigger ignores it. Base UI's
   * `Field.Control` injects an `aria-labelledby` built from the field's visible label, and `aria-labelledby`
   * outranks `aria-label` (accname 1.2, 2B before 2C) — measured per primitive family in
   * `tests/client/a11y/field-control-name.suite.ct.tsx`. But the seal also stamps a name on the HIDDEN
   * submission input Base UI renders (the effect below), and that input is out of reach of the Field's
   * association: it takes `aria-label` (else `aria-labelledby`, else the literal "Hidden select value").
   * So the attribute that is dead on the trigger is the hidden input's ONLY real name, on an element axe
   * scans — which is why the ~18 in-Field call sites keep it rather than being swept as inert.
   */
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
    layout,
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
  // Per-INSTANCE prefix for glossed options' description ids: two selects on one page can legitimately
  // share an option value ("flat"), so a value-only id would collide and point both at one description.
  const optionIdPrefix = useId();

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
            className={cn(slots.trigger({ layout }), className)}
            data-slot="select-trigger"
            id={id}
          >
            <BaseSelect.Value className={slots.value()} data-slot="select-value" placeholder={placeholder}>
              {renderValue}
            </BaseSelect.Value>
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
          <BaseSelect.Popup className={slots.popup()} data-slot="select-popup" style={POPUP_STYLE}>
            {arrow ? <BaseSelect.Arrow className={slots.arrow()} data-slot="select-arrow" /> : null}
            {scrollArrows ? (
              <BaseSelect.ScrollUpArrow className={cn(slots.scrollArrow(), "top-0")} data-slot="select-scroll-up-arrow">
                {CHEVRON_ICON}
              </BaseSelect.ScrollUpArrow>
            ) : null}
            <BaseSelect.List data-slot="select-list">{renderItems(items, optionIdPrefix)}</BaseSelect.List>
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
