import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import { autocomplete } from "./variants";

// Breathing room between the input and the popup (a positioning input, not a styled length).
const POPUP_SIDE_OFFSET = 4;

export interface AutocompleteProps {
  /**
   * The candidate suggestions — the display strings themselves, filtered against the input value
   * automatically (Base UI `mode="list"`). May be a render-derived array (filtered/mapped from
   * props/state, a fresh reference each render) — verified by the acceptance test; no referential
   * stability is required.
   */
  items: readonly string[];
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
  /** Applied to the input (the in-flow element). */
  className?: string;
  id?: string;
}

/**
 * The autocomplete — Base UI Autocomplete sealed with the full explicit anatomy (Input → Portal →
 * Positioner → Popup → List/Item), so features never hand-assemble parts. A text input with a
 * filtered popup list; keyboard-navigable (D42 §2 — Base UI seal). `onValueChange` reports the input
 * string; selecting a suggestion writes it into the input.
 *
 * API choice: `items` is `readonly string[]` — the near-term consumers are string sets (tags,
 * labels, keyword triggers), so the wrapper takes the display strings directly and keeps the surface
 * small. Base UI 1.6 also supports object items with a value/label mapper; expose that here only when
 * a consumer actually needs richer items (it is a deliberate omission, not a workaround). The array
 * may be render-derived — the acceptance test drives a parent re-render passing a freshly filtered/
 * mapped array and the filter stays correct.
 *
 * Usage: `<Autocomplete aria-label="Tag" items={tagNames} onValueChange={setQuery} />`
 */
export function Autocomplete({
  items,
  placeholder,
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  emptyText = "No results.",
  "aria-label": ariaLabel,
  className,
  id,
}: AutocompleteProps): ReactElement {
  const slots = autocomplete();
  return (
    <BaseAutocomplete.Root
      defaultValue={defaultValue}
      disabled={disabled}
      items={items}
      onValueChange={(next: string): void => onValueChange?.(next)}
      value={value}
    >
      <BaseAutocomplete.Input
        aria-label={ariaLabel}
        className={cn(slots.input(), className)}
        id={id}
        placeholder={placeholder}
      />
      <BaseAutocomplete.Portal>
        <BaseAutocomplete.Positioner className={slots.positioner()} sideOffset={POPUP_SIDE_OFFSET}>
          <BaseAutocomplete.Popup className={slots.popup()}>
            <BaseAutocomplete.Empty className={slots.empty()}>{emptyText}</BaseAutocomplete.Empty>
            <BaseAutocomplete.List className={slots.list()}>
              {(item: string): ReactNode => (
                <BaseAutocomplete.Item className={slots.item()} key={item} value={item}>
                  {item}
                </BaseAutocomplete.Item>
              )}
            </BaseAutocomplete.List>
          </BaseAutocomplete.Popup>
        </BaseAutocomplete.Positioner>
      </BaseAutocomplete.Portal>
    </BaseAutocomplete.Root>
  );
}
