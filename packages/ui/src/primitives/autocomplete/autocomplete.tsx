import type { AutocompletePositionerProps as BasePositionerProps, AutocompleteRootProps as BaseRootProps } from "@base-ui/react/autocomplete";
import { Autocomplete as BaseAutocomplete } from "@base-ui/react/autocomplete";
import type { ReactElement, ReactNode } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_INPUT, cn, formatResultCount, usePortalContainer } from "#lib";
import { Icon, X } from "#primitives/icons";
import { autocompleteVariants } from "./variants.ts";

// Breathing room between the input and the popup.
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

const slots = autocompleteVariants();

/** Base UI's change eventDetails (reason/cancel/allowPropagation), derived from the Root prop so the
 *  seal can never drift from it. Optional at our seam: the inline-select shortcut synthesizes a change
 *  with no originating Base UI event. */
type AutocompleteChangeDetails = Parameters<NonNullable<BaseRootProps<string>["onValueChange"]>>[1];

/** A category of suggestions rendered under a `GroupLabel` header. Values stay plain strings. */
export interface AutocompleteGroup {
  /** The category header text. */
  label: string;
  /** The suggestions in this category (the display strings themselves). */
  items: readonly string[];
}

// Forwarded straight to Base UI Root: `filter` swaps the match predicate, `autoHighlight`
// auto-selects the first result, `limit` caps the rendered matches, and `open`/`onOpenChange` are the
// CONTROLLED-OPEN arm.
//
// WHY controlled open is exposed: a popup is an OVERLAY anchored under the input, so it lands on whatever
// sits below the field — in a prompt dialog that is the Cancel/Confirm row. Measured (tag picker,
// 2026-08-03): an open popup physically intercepted the pointer on the buttons it was pointing at, and
// (Base UI hides outside content from AT while a combobox popup is open) removed them from the
// accessibility tree entirely. Two escapes, both live: a caller that knows its match count can decline to
// open at all, and a caller with no room for an overlay at all uses `inline` below — for which Base UI
// REQUIRES `open` (the list is only "considered visible" when the root says so).
type AutocompletePassthrough = Pick<BaseRootProps<string>, "filter" | "autoHighlight" | "limit" | "open" | "onOpenChange">;

export interface AutocompleteProps extends AutocompletePassthrough {
  /**
   * The candidate suggestions — display strings filtered against the input value automatically.
   * May be a render-derived array (fresh reference each render). Ignored when `groups` is provided.
   */
  // @orb-gate-ignore baseui-derives-not-respells(items): Base UI's `items` is `readonly any[] | readonly Group<any>[]`; this seal is deliberately string-only (object-items and multi-select are the Combobox seal's job) and its `groups` prop owns the grouped arm. Ends if the seal ever accepts object items.
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
  // @orb-gate-ignore baseui-derives-not-respells(value): Base UI's `value` admits `null` (the cleared arm of its own value model); this seal's value IS the input's text, where the cleared state is `""`. Ends if the seal stops backing a text input.
  value?: string;
  // @orb-gate-ignore baseui-derives-not-respells(defaultValue): the uncontrolled half of `value` above — same narrowing, same end condition.
  defaultValue?: string;
  onValueChange?: (value: string, details?: AutocompleteChangeDetails) => void;
  disabled?: BaseRootProps<string>["disabled"];
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
  id?: BaseRootProps<string>["id"];
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
  /**
   * Render the suggestions IN FLOW under the field instead of in an anchored popup (Base UI Root's
   * `inline`), inside a bounded scroller that collapses to nothing when there are no matches.
   *
   * For a host with no room for an overlay — a PROMPT dialog is the founding one: a popup there is taller
   * than the card, so it covers the confirm row it points at and `aria-hidden`s the title/description/
   * footer out of the accessibility tree. In flow, nothing is covered and nothing is hidden.
   *
   * Pass `open` UNCONDITIONALLY `true` alongside it — Base UI's documented requirement, and its root
   * forces the internal open state to `true` under `inline` anyway, so a conditional `open` here would read
   * as a gate that does nothing. The VISIBILITY gate is the item list itself: with nothing to show the
   * popup carries `data-empty` and collapses. The `arrow`/`side`/`align`/`sideOffset`/`container`/
   * `emptyText` positioning props have no meaning in this arm and are ignored. @defaultValue false
   */
  inline?: BaseRootProps<string>["inline"];
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
 * default (a pointer affordance, not an AT target). `inline` swaps the Portal→Positioner→Popup half for
 * an in-flow bounded list — same keyboard model, no overlay.
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
  inline = false,
  ...rest
}: AutocompleteProps): ReactElement {
  const portalContainer = usePortalContainer();
  // THE INLINE ARM FILLS THE INPUT ITSELF. Base UI writes a picked item back into the field only when its
  // `popupRef` is set (`AriaCombobox` shouldFillInput) — i.e. only when a `Popup` part is mounted, which
  // the inline anatomy has no way to render. Without this, an inline list stays fully navigable (arrows,
  // `aria-activedescendant`, `Enter` → the item's own click) while selecting silently does NOTHING; that
  // regression was measured in this lane against the working popup arm before it was caught.
  // Both paths land here: Base UI's Enter handler CLICKS the highlighted item.
  const fillOnInlineSelect = (item: string): Partial<{ onClick: () => void }> => (inline ? { onClick: (): void => onValueChange?.(item) } : {});
  const listChild =
    groups === undefined
      ? (item: string): ReactNode => (
          <BaseAutocomplete.Item className={slots.item()} data-slot="autocomplete-item" key={item} value={item} {...fillOnInlineSelect(item)}>
            {item}
          </BaseAutocomplete.Item>
        )
      : (group: AutocompleteGroup): ReactNode => (
          <BaseAutocomplete.Group className={slots.group()} data-slot="autocomplete-group" items={group.items} key={group.label}>
            <BaseAutocomplete.GroupLabel className={slots.groupLabel()} data-slot="autocomplete-group-label">
              {group.label}
            </BaseAutocomplete.GroupLabel>
            <BaseAutocomplete.Collection>
              {(item: string): ReactNode => (
                <BaseAutocomplete.Item className={slots.item()} data-slot="autocomplete-item" key={item} value={item} {...fillOnInlineSelect(item)}>
                  {item}
                </BaseAutocomplete.Item>
              )}
            </BaseAutocomplete.Collection>
          </BaseAutocomplete.Group>
        );

  const inner = (
    <>
      <BaseAutocomplete.InputGroup className={slots.inputGroup()} data-slot="autocomplete-input-group">
        <BaseAutocomplete.Input
          aria-describedby={ariaDescribedby}
          aria-label={ariaLabel}
          className={cn(slots.input(), className)}
          data-slot="autocomplete-input"
          id={id}
          placeholder={placeholder}
        />
        <BaseAutocomplete.Clear aria-label={clearLabel} className={slots.clear()} data-slot="autocomplete-clear">
          <Icon icon={X} size="sm" />
        </BaseAutocomplete.Clear>
      </BaseAutocomplete.InputGroup>
      {inline ? (
        // NO Portal/Positioner/Popup/Empty in this arm — that IS the arm (and Base UI's `Popup` part throws
        // outside a `Positioner`, so it is not optional here). The List is the bounded box; `Empty` is
        // dropped because an inline list collapses to nothing when there is nothing to say, and the
        // caller's own copy owns that state.
        <>
          <BaseAutocomplete.List className={slots.inlineList()} data-slot="autocomplete-inline-list">
            {listChild}
          </BaseAutocomplete.List>
          <AutocompleteResultStatus />
        </>
      ) : (
        <BaseAutocomplete.Portal container={container ?? portalContainer}>
          <BaseAutocomplete.Positioner align={align} className={slots.positioner()} data-slot="autocomplete-positioner" side={side} sideOffset={sideOffset}>
            <BaseAutocomplete.Popup className={slots.popup()} data-slot="autocomplete-popup">
              {arrow ? <BaseAutocomplete.Arrow className={slots.arrow()} data-slot="autocomplete-arrow" /> : null}
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
      )}
    </>
  );

  const onValueChangeProp = (next: string, details: AutocompleteChangeDetails): void => onValueChange?.(next, details);

  return groups === undefined ? (
    <BaseAutocomplete.Root
      defaultValue={defaultValue}
      disabled={disabled}
      inline={inline}
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
      inline={inline}
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
