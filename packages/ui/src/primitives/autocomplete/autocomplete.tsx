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

// Breathing room between the input and the popup — the input-hug gap (§13.0 C19 rollup, `#lib`).
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

const slots = autocompleteVariants();

/** A category of suggestions rendered under a `GroupLabel` header. Values stay plain strings. */
export interface AutocompleteGroup {
  /** The category header text. */
  label: string;
  /** The suggestions in this category (the display strings themselves). */
  items: readonly string[];
}

// The async/fuzzy-search seam — forwarded straight to Base UI Root. `filter` swaps the match
// predicate (custom fuzzy/async filtering), `autoHighlight` auto-selects the first result, `limit`
// caps the rendered matches. Picked (not re-declared) so their live Base UI types flow through.
type AutocompletePassthrough = Pick<BaseRootProps<string>, "filter" | "autoHighlight" | "limit">;

export interface AutocompleteProps extends AutocompletePassthrough {
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
  /** Portal target — defaults to the themed portal root from {@link usePortalContainer} (D44 §12.1);
   *  pass an explicit node/ref to override; unset keeps Base UI's `body` default. */
  container?: PortalContainer;
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
      {formatResultCount(count)}
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
 * The async/fuzzy seam (`filter`/`autoHighlight`/`limit`) plus any other Root prop forward straight
 * through to Base UI Root (R5 — no hand-picked prop subset that drops the rest).
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
 * `arrow` mounts `Autocomplete.Arrow`; `side`/`align`/`sideOffset` override the Positioner's
 * placement. Inside a `<Field>`, the input auto-registers (label association + `aria-describedby`)
 * because `Autocomplete.Input` is the same field-aware `Combobox.Input` used package-wide;
 * `aria-describedby` is also exposed directly for standalone (non-`<Field>`) composition.
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
