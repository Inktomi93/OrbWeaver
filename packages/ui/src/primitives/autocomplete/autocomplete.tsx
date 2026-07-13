import type {
  AutocompletePositionerProps as BasePositionerProps,
  AutocompleteRootProps as BaseRootProps,
} from "@base-ui/react/autocomplete";
import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import type { ReactElement, ReactNode } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_INPUT, cn, formatResultCount, usePortalContainer } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine (the spinner.tsx precedent).
import { Icon, X } from "#primitives/icons";
import { autocompleteVariants } from "./variants";

// Breathing room between the input and the popup.
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

const slots = autocompleteVariants();

/** A category of suggestions rendered under a `GroupLabel` header. Values stay plain strings. */
export interface AutocompleteGroup {
  /** The category header text. */
  label: string;
  /** The suggestions in this category (the display strings themselves). */
  items: readonly string[];
}

// Forwarded straight to Base UI Root: `filter` swaps the match predicate, `autoHighlight`
// auto-selects the first result, `limit` caps the rendered matches.
type AutocompletePassthrough = Pick<BaseRootProps<string>, "filter" | "autoHighlight" | "limit">;

export interface AutocompleteProps extends AutocompletePassthrough {
  /**
   * The candidate suggestions — display strings filtered against the input value automatically.
   * May be a render-derived array (fresh reference each render). Ignored when `groups` is provided.
   */
  items?: readonly string[];
  /**
   * Grouped suggestions — each group renders a `GroupLabel` header over its items. Values are
   * still plain strings, not object-items/multi-select (that's the Combobox seal's job). Takes
   * precedence over `items` when set.
   */
  groups?: readonly AutocompleteGroup[];
  /**
   * List/inline behaviour, forwarded to Base UI Root: `list` (default, filters items) · `both`
   * (filter + inline autocompletion) · `inline` (static + inline) · `none` (static, no filter).
   */
  mode?: BaseRootProps<string>["mode"];
  placeholder?: string;
  /** Controlled input value — pair with `onValueChange`. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  /** Rendered inside the popup when the filter matches nothing. */
  emptyText?: ReactNode;
  /** Accessible name for the input (there is no visible label — pair with `<Field>` for one). */
  "aria-label"?: string;
  /** Additional id(s) describing the input — merges with `<Field>`'s own wiring when composed. */
  "aria-describedby"?: string;
  /** Accessible name for the clear button. @defaultValue "Clear" */
  clearLabel?: string;
  /** Applied to the input (the in-flow element). */
  className?: string;
  id?: string;
  /** Render an arrow pointing at the input inside the popup. @defaultValue false */
  arrow?: boolean;
  /** Placement side, forwarded to the explicit Positioner. @defaultValue "bottom" (Base UI default) */
  side?: BasePositionerProps["side"];
  /** Alignment on the side. @defaultValue "start" */
  align?: BasePositionerProps["align"];
  /** Anchor gap in px. @defaultValue 4 */
  sideOffset?: BasePositionerProps["sideOffset"];
  /** Portal target — defaults to the themed portal root; pass a node/ref to override. */
  container?: PortalContainer;
}

/**
 * Announces the live result count to screen readers via `Autocomplete.Status`. Reads the
 * library's own filtered-item set, flattening grouped entries to count leaf suggestions.
 */
function AutocompleteResultStatus(): ReactElement {
  const filtered = BaseAutocomplete.useFilteredItems<unknown>();
  const count = filtered.reduce<number>((total, entry) => {
    const nested = (entry as { items?: readonly unknown[] }).items;
    return total + (Array.isArray(nested) ? nested.length : 1);
  }, 0);
  return (
    <BaseAutocomplete.Status className={slots.status()} data-slot="autocomplete-status">
      {formatResultCount(count)}
    </BaseAutocomplete.Status>
  );
}

/**
 * The autocomplete — Base UI Autocomplete sealed with the full explicit anatomy (InputGroup[Input +
 * Clear] → Portal → Positioner → Popup → List/Group/Item + Status). A text input with a filtered
 * popup list; `onValueChange` reports the input string, selecting a suggestion writes it into the
 * input. Item values are `string` — object items/multi-select belong to the Combobox seal instead.
 * The native `Clear` button unmounts itself when the input is empty and ships `aria-hidden` by
 * default (a pointer affordance, not an AT target).
 */
export function Autocomplete({
  items,
  groups,
  mode,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  emptyText = "No results.",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  clearLabel = "Clear",
  className,
  id,
  arrow = false,
  side,
  align,
  sideOffset = POPUP_SIDE_OFFSET,
  container,
  ...rest
}: AutocompleteProps): ReactElement {
  const portalContainer = usePortalContainer();
  const listChild =
    groups === undefined
      ? (item: string): ReactNode => (
          <BaseAutocomplete.Item
            className={slots.item()}
            data-slot="autocomplete-item"
            key={item}
            value={item}
          >
            {item}
          </BaseAutocomplete.Item>
        )
      : (group: AutocompleteGroup): ReactNode => (
          <BaseAutocomplete.Group
            className={slots.group()}
            data-slot="autocomplete-group"
            items={group.items}
            key={group.label}
          >
            <BaseAutocomplete.GroupLabel
              className={slots.groupLabel()}
              data-slot="autocomplete-group-label"
            >
              {group.label}
            </BaseAutocomplete.GroupLabel>
            <BaseAutocomplete.Collection>
              {(item: string): ReactNode => (
                <BaseAutocomplete.Item
                  className={slots.item()}
                  data-slot="autocomplete-item"
                  key={item}
                  value={item}
                >
                  {item}
                </BaseAutocomplete.Item>
              )}
            </BaseAutocomplete.Collection>
          </BaseAutocomplete.Group>
        );

  const inner = (
    <>
      <BaseAutocomplete.InputGroup
        className={slots.inputGroup()}
        data-slot="autocomplete-input-group"
      >
        <BaseAutocomplete.Input
          aria-describedby={ariaDescribedby}
          aria-label={ariaLabel}
          className={cn(slots.input(), className)}
          data-slot="autocomplete-input"
          id={id}
          placeholder={placeholder}
        />
        <BaseAutocomplete.Clear
          aria-label={clearLabel}
          className={slots.clear()}
          data-slot="autocomplete-clear"
        >
          <Icon icon={X} size="sm" />
        </BaseAutocomplete.Clear>
      </BaseAutocomplete.InputGroup>
      <BaseAutocomplete.Portal container={container ?? portalContainer}>
        <BaseAutocomplete.Positioner
          align={align}
          className={slots.positioner()}
          data-slot="autocomplete-positioner"
          side={side}
          sideOffset={sideOffset}
        >
          <BaseAutocomplete.Popup className={slots.popup()} data-slot="autocomplete-popup">
            {arrow ? (
              <BaseAutocomplete.Arrow className={slots.arrow()} data-slot="autocomplete-arrow" />
            ) : null}
            <BaseAutocomplete.Empty className={slots.empty()} data-slot="autocomplete-empty">
              {emptyText}
            </BaseAutocomplete.Empty>
            <BaseAutocomplete.List className={slots.list()} data-slot="autocomplete-list">
              {listChild}
            </BaseAutocomplete.List>
            <AutocompleteResultStatus />
          </BaseAutocomplete.Popup>
        </BaseAutocomplete.Positioner>
      </BaseAutocomplete.Portal>
    </>
  );

  const onValueChangeProp = (next: string): void => onValueChange?.(next);

  return groups === undefined ? (
    <BaseAutocomplete.Root
      defaultValue={defaultValue}
      disabled={disabled}
      items={items ?? []}
      mode={mode}
      onValueChange={onValueChangeProp}
      value={value}
      {...rest}
    >
      {inner}
    </BaseAutocomplete.Root>
  ) : (
    <BaseAutocomplete.Root
      defaultValue={defaultValue}
      disabled={disabled}
      items={groups}
      mode={mode}
      onValueChange={onValueChangeProp}
      value={value}
      {...rest}
    >
      {inner}
    </BaseAutocomplete.Root>
  );
}
