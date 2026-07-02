import type { AutocompleteRootProps as BaseRootProps } from "@base-ui/react/autocomplete";
import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine (the spinner.tsx precedent).
import { Icon, X } from "#primitives/icons";
import { autocomplete } from "./variants";

// Breathing room between the input and the popup (a positioning input, not a styled length).
const POPUP_SIDE_OFFSET = 4;

const slots = autocomplete();

/** A category of suggestions rendered under a `GroupLabel` header. Values stay plain strings. */
export interface AutocompleteGroup {
  /** The category header text. */
  label: string;
  /** The suggestions in this category (the display strings themselves). */
  items: readonly string[];
}

export interface AutocompleteProps {
  /**
   * The candidate suggestions — the display strings themselves, filtered against the input value
   * automatically (Base UI `mode="list"`). May be a render-derived array (filtered/mapped from
   * props/state, a fresh reference each render) — verified by the acceptance test; no referential
   * stability is required. Ignored when `groups` is provided.
   */
  items?: readonly string[];
  /**
   * Grouped suggestions — each group renders a `GroupLabel` header over its items (categorised
   * pickers). Values are still plain strings; this is the flat `items` API split into labelled
   * sections, NOT object-items/multi-select (those belong to the Combobox seal — R4). Takes
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
  /** Accessible name for the clear button. @default "Clear" */
  clearLabel?: string;
  /** Applied to the input (the in-flow element). */
  className?: string;
  id?: string;
}

/**
 * Announces the live result count to screen readers via Base UI's `Autocomplete.Status` (a polite
 * `role="status"` region). Reads the library's OWN filtered-item set (`useFilteredItems`), so the
 * count always matches the rendered list; flattens grouped entries to count leaf suggestions.
 * Must render under `<Autocomplete.Root>`; the Status element itself stays mounted (only its text
 * changes) per Base UI's live-region rule.
 */
function AutocompleteResultStatus(): ReactElement {
  const filtered = BaseAutocomplete.useFilteredItems<unknown>();
  const count = filtered.reduce<number>((total, entry) => {
    const nested = (entry as { items?: readonly unknown[] }).items;
    return total + (Array.isArray(nested) ? nested.length : 1);
  }, 0);
  return (
    <BaseAutocomplete.Status className={slots.status()} data-slot="autocomplete-status">
      {`${count} ${count === 1 ? "result" : "results"}`}
    </BaseAutocomplete.Status>
  );
}

/**
 * The autocomplete — Base UI Autocomplete sealed with the full explicit anatomy (InputGroup[Input +
 * Clear] → Portal → Positioner → Popup → List/Group/Item + Status), so features never hand-assemble
 * parts. A text input with a filtered popup list; keyboard-navigable (D42 §2 — Base UI seal).
 * `onValueChange` reports the input string; selecting a suggestion writes it into the input.
 *
 * API choice: item VALUES are `string` — the near-term consumers are string sets (tags, labels,
 * keyword triggers), so the wrapper takes the display strings directly and keeps the surface small.
 * Base UI 1.6 also supports object items with a value/label mapper and multi-select chips; those are
 * the Combobox seal's job (R4 — pick by value type), a deliberate omission here, not a workaround.
 * `groups` splits the same string values into labelled sections. The array may be render-derived —
 * the acceptance test drives a parent re-render passing a freshly filtered/mapped array and the
 * filter stays correct.
 *
 * Base UI deltas (R8): the native `Clear` button unmounts itself when the input is empty (its
 * `visible` state, `keepMounted={false}` default) AND ships `aria-hidden` by default (decorative — the
 * input stays clearable by keyboard), so it's a pointer affordance, not an AT target. `Status` must
 * remain mounted (only its children change) or screen readers miss updates; note Base UI's `Empty`
 * part ALSO renders `role="status"`, so address the count region by its `data-slot`.
 *
 * Usage: `<Autocomplete aria-label="Tag" items={tagNames} onValueChange={setQuery} />`
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
  clearLabel = "Clear",
  className,
  id,
}: AutocompleteProps): ReactElement {
  const listChild =
    groups === undefined
      ? (item: string): ReactNode => (
          <BaseAutocomplete.Item className={slots.item()} key={item} value={item}>
            {item}
          </BaseAutocomplete.Item>
        )
      : (group: AutocompleteGroup): ReactNode => (
          <BaseAutocomplete.Group className={slots.group()} items={group.items} key={group.label}>
            <BaseAutocomplete.GroupLabel className={slots.groupLabel()}>
              {group.label}
            </BaseAutocomplete.GroupLabel>
            <BaseAutocomplete.Collection>
              {(item: string): ReactNode => (
                <BaseAutocomplete.Item className={slots.item()} key={item} value={item}>
                  {item}
                </BaseAutocomplete.Item>
              )}
            </BaseAutocomplete.Collection>
          </BaseAutocomplete.Group>
        );

  const inner = (
    <>
      <BaseAutocomplete.InputGroup className={slots.inputGroup()}>
        <BaseAutocomplete.Input
          aria-label={ariaLabel}
          className={cn(slots.input(), className)}
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
      <BaseAutocomplete.Portal>
        <BaseAutocomplete.Positioner className={slots.positioner()} sideOffset={POPUP_SIDE_OFFSET}>
          <BaseAutocomplete.Popup className={slots.popup()}>
            <BaseAutocomplete.Empty className={slots.empty()}>{emptyText}</BaseAutocomplete.Empty>
            <BaseAutocomplete.List className={slots.list()}>{listChild}</BaseAutocomplete.List>
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
    >
      {inner}
    </BaseAutocomplete.Root>
  );
}
