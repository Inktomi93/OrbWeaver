import type { SelectRootProps } from "@base-ui/react/select";
import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactElement, ReactNode } from "react";
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
  /** Whether this option is non-selectable. */
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

// A group carries an `items` array; a flat option carries a `value`. Narrows the union at render.
function isGrouped<Value>(items: SelectItems<Value>): items is readonly SelectOptionGroup<Value>[] {
  const first = items[0];
  return typeof first === "object" && first !== null && "items" in first;
}

function renderOption<Value>(option: SelectOption<Value>): ReactElement {
  return (
    <BaseSelect.Item
      className={slots.item()}
      disabled={option.disabled}
      key={String(option.value)}
      value={option.value}
    >
      <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className={slots.itemIndicator()}>
        {CHECK_ICON}
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

function renderItems<Value>(items: SelectItems<Value>): ReactNode {
  if (isGrouped(items)) {
    return items.map((group) => (
      <BaseSelect.Group className={slots.group()} key={group.label}>
        <BaseSelect.GroupLabel className={slots.groupLabel()}>{group.label}</BaseSelect.GroupLabel>
        {group.items.map(renderOption)}
      </BaseSelect.Group>
    ));
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
  /** Render sticky hover-to-scroll arrows in the popup (long lists). @default false */
  scrollArrows?: boolean;
}

/**
 * The select — Base UI Select sealed with the full explicit anatomy (Trigger/Value/Icon → Portal →
 * Positioner → Popup → List/Item), so features never hand-assemble parts (D42 §2 — Base UI seal;
 * explicit Positioner kills the portal weirdness).
 *
 * The generics thread Base UI's `<Value, Multiple>` overload: pass `multiple` and the value becomes
 * an array (`Select.Value` comma-joins the labels). Grouped `items` render `Select.Group` +
 * `Select.GroupLabel`; `scrollArrows` mounts `Select.ScrollUp/DownArrow` (they self-suppress on
 * touch input and when the popup doesn't overflow — Base UI behavior).
 *
 * Usage: `<Select items={models} placeholder="Pick a model" value={id} onValueChange={setId} />`
 * Multiple: `<Select multiple items={tags} value={ids} onValueChange={setIds} />`
 */
export function Select<Value = string, Multiple extends boolean = false>(
  props: SelectProps<Value, Multiple>,
): ReactElement {
  const { items, placeholder, className, scrollArrows = false, id, ...rootProps } = props;
  // The grouped shape ({ label, items }) is a Base UI `Group` structurally; the union widening to
  // Root's `items` type needs a nudge the compiler won't infer through our stricter option union.
  const rootItems = items as SelectRootProps<Value, Multiple>["items"];
  return (
    <BaseSelect.Root items={rootItems} {...rootProps}>
      <BaseSelect.Trigger className={cn(slots.trigger(), className)} id={id}>
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon className={slots.icon()}>{CHEVRON_ICON}</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          // The default plain-dropdown popup; scroll arrows only function in Base UI's
          // align-item-with-trigger mode, so `scrollArrows` opts into it (that mode drives the
          // ScrollUp/DownArrow visibility off the aligned popup's own overflow).
          alignItemWithTrigger={scrollArrows}
          className={slots.positioner()}
          sideOffset={POPUP_SIDE_OFFSET}
        >
          <BaseSelect.Popup className={slots.popup()}>
            {scrollArrows ? (
              <BaseSelect.ScrollUpArrow
                className={cn(slots.scrollArrow(), "top-0")}
                data-slot="select-scroll-up-arrow"
              >
                {CHEVRON_ICON}
              </BaseSelect.ScrollUpArrow>
            ) : null}
            <BaseSelect.List>{renderItems(items)}</BaseSelect.List>
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
