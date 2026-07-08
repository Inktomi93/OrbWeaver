import type { SelectPositionerProps, SelectRootProps } from "@base-ui/react/select";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve Check/ChevronDown/Icon fine.
import { Check, ChevronDown, Icon } from "#primitives/icons";
import { selectVariants } from "./variants";

// Breathing room between trigger and popup (a positioning input, not a styled length).
const POPUP_SIDE_OFFSET = 4;

const slots = selectVariants();

// The chevron on the trigger and the check on a selected item are seal glyphs (Base UI ships the
// Icon/ItemIndicator containers, not the marks) — the lucide seal, not hand-SVG.
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
export type SelectItems<Value = string> =
  | readonly SelectOption<Value>[]
  | readonly SelectOptionGroup<Value>[];

function isGrouped<Value>(items: SelectItems<Value>): items is readonly SelectOptionGroup<Value>[] {
  const first = items[0];
  return typeof first === "object" && first !== null && "items" in first;
}

function renderOption<Value>(option: SelectOption<Value>): ReactElement {
  return (
    <BaseSelect.Item
      className={slots.item()}
      data-slot="select-item"
      disabled={option.disabled}
      key={String(option.value)}
      value={option.value}
    >
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
    // A Separator BETWEEN adjacent groups (not before the first) — Base UI Select.Separator, a
    // sibling of the groups it divides.
    return items.flatMap((group, index) =>
      index > 0
        ? [
            <BaseSelect.Separator
              className={slots.separator()}
              data-slot="select-separator"
              key={`separator-${group.label}`}
            />,
            renderGroup(group),
          ]
        : [renderGroup(group)],
    );
  }
  return items.map(renderOption);
}

export interface SelectProps<Value = string, Multiple extends boolean = false>
  extends Omit<SelectRootProps<Value, Multiple>, "items"> {
  /**
   * The options — flat (`{ label, value }[]`) or grouped (`{ label, items }[]`). `Select.Value`
   * renders the selected option's label(s) automatically (comma-joined when `multiple`).
   */
  items: SelectItems<Value>;
  placeholder?: ReactNode;
  /** Applied to the trigger (the in-flow element). */
  className?: string;
  /**
   * A visible accessible label rendered above the trigger — Base UI `Select.Label`. Omit when the
   * Select composes inside a `<Field>` (which wires its own label through `FieldRootContext`) or
   * when `aria-label` suffices.
   *
   * Base UI delta (R8, verified 2026-07-02): `Select.Label`'s own doc claims it "automatically
   * associates" with the trigger, but in 1.6.0 that wiring runs through `store.labelId` and never
   * reaches the Trigger's `aria-labelledby` standalone (outside `<Field>`, which supplies the
   * separate `LabelableProvider` context path) — verified with a failing CT before this fix (R6).
   * We wire it ourselves: the label text renders inside a locally-`useId()`'d `<span>` and the
   * Trigger's `aria-labelledby` points at it (unless the caller passes an explicit
   * `aria-labelledby`, which wins).
   */
  label?: ReactNode;
  /**
   * Custom formatting for the trigger's selected-value text (e.g. icon + label) — forwarded straight
   * to Base UI `Select.Value`'s children-render-fn. Receives the raw selected value (or array, when
   * `multiple`). Omit for the default label-lookup rendering.
   */
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
  /**
   * Accessible name for the trigger (the combobox). `Select.Root` renders no element, so these ride
   * the Trigger — a labelless Select gets its name here (or via `aria-labelledby`/`Field`).
   */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * The select — Base UI Select sealed with the full explicit anatomy (Trigger/Value/Icon → Portal →
 * Positioner → Popup → List/Item), so features never hand-assemble parts (D42 §2 — Base UI seal;
 * explicit Positioner kills the portal weirdness).
 *
 * The generics thread Base UI's `<Value, Multiple>` overload: pass `multiple` and the value becomes
 * an array (`Select.Value` comma-joins the labels). Grouped `items` render `Select.Group` +
 * `Select.GroupLabel`; `scrollArrows` mounts `Select.ScrollUp/DownArrow` (they self-suppress on
 * touch input and when the popup doesn't overflow — Base UI behavior). `label` mounts `Select.Label`
 * (standalone accessible name, auto-associated with the trigger); `renderValue` forwards a
 * children-render-fn to `Select.Value` for custom trigger formatting (e.g. icon + label);  `arrow`
 * mounts `Select.Arrow`; `side`/`align`/`sideOffset` override the Positioner's placement.
 *
 * Usage: `<Select items={models} placeholder="Pick a model" value={id} onValueChange={setId} />`
 * Multiple: `<Select multiple items={tags} value={ids} onValueChange={setIds} />`
 */
export function Select<Value = string, Multiple extends boolean = false>(
  props: SelectProps<Value, Multiple>,
): ReactElement {
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
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-describedby": ariaDescribedby,
    ...rootProps
  } = props;
  // The grouped shape ({ label, items }) is a Base UI `Group` structurally; the union widening to
  // Root's `items` type needs a nudge the compiler won't infer through our stricter option union.
  const rootItems = items as SelectRootProps<Value, Multiple>["items"];
  const hasLabel = label !== undefined && label !== null;
  // Base UI's `Select.Label` strips any `id` we pass (it derives its own from the root, ignoring
  // "runtime id overrides from untyped consumers") — so the association id lives on an inner span
  // instead (see the `label` prop's doc comment for the verified Base UI delta this works around).
  const generatedLabelId = useId();
  const labelId = hasLabel ? generatedLabelId : undefined;
  
  // The visually hidden input generated by Base UI for form submission gets flagged by axe-core 
  // because it is an interactive element without an accessible name. We use inputRef to fix this.
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (hiddenInputRef.current) {
      // Provide a fallback name so screen readers (and axe-core) don't flag it as an unlabeled input.
      hiddenInputRef.current.setAttribute("aria-label", ariaLabel || ariaLabelledby || "Hidden select value");
    }
  }, [ariaLabel, ariaLabelledby]);

  return (
    <BaseSelect.Root items={rootItems} inputRef={hiddenInputRef} {...rootProps}>
      {hasLabel ? (
        <BaseSelect.Label className={slots.label()} data-slot="select-label">
          <span id={labelId}>{label}</span>
        </BaseSelect.Label>
      ) : null}
      <BaseField.Control render={
        <BaseSelect.Trigger
          aria-describedby={ariaDescribedby}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby ?? labelId}
          className={cn(slots.trigger(), className)}
          data-slot="select-trigger"
          id={id}
        >
          <BaseSelect.Value placeholder={placeholder}>{renderValue}</BaseSelect.Value>
          <BaseSelect.Icon className={slots.icon()} data-slot="select-icon">
            {CHEVRON_ICON}
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      } />
      <BaseSelect.Portal>
        {backdrop ? (
          <BaseSelect.Backdrop className={slots.backdrop()} data-slot="select-backdrop" />
        ) : null}
        <BaseSelect.Positioner
          align={align}
          // The default plain-dropdown popup; scroll arrows only function in Base UI's
          // align-item-with-trigger mode, so `scrollArrows` opts into it (that mode drives the
          // ScrollUp/DownArrow visibility off the aligned popup's own overflow).
          alignItemWithTrigger={scrollArrows}
          className={slots.positioner()}
          data-slot="select-positioner"
          side={side}
          sideOffset={sideOffset}
        >
          <BaseSelect.Popup className={slots.popup()} data-slot="select-popup">
            {arrow ? <BaseSelect.Arrow className={slots.arrow()} data-slot="select-arrow" /> : null}
            {scrollArrows ? (
              <BaseSelect.ScrollUpArrow
                className={cn(slots.scrollArrow(), "top-0")}
                data-slot="select-scroll-up-arrow"
              >
                {CHEVRON_ICON}
              </BaseSelect.ScrollUpArrow>
            ) : null}
            <BaseSelect.List data-slot="select-list">{renderItems(items)}</BaseSelect.List>
            {scrollArrows ? (
              <BaseSelect.ScrollDownArrow
                className={cn(slots.scrollArrow(), "bottom-0")}
                data-slot="select-scroll-down-arrow"
              >
                {CHEVRON_ICON}
              </BaseSelect.ScrollDownArrow>
            ) : null}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
