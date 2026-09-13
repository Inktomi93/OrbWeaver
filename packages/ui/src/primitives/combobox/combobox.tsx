import type { ComboboxPositionerProps as BasePositionerProps, ComboboxRootProps as BaseRootProps } from "@base-ui/react/combobox";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import type { PortalContainer } from "#lib";
import { ANCHOR_GAP_INPUT, cn, formatResultCount, usePortalContainer } from "#lib";
import { Icon, X } from "#primitives/icons";
import { comboboxVariants } from "./variants.ts";

// Breathing room between the input and the popup.
const POPUP_SIDE_OFFSET = ANCHOR_GAP_INPUT;

const slots = comboboxVariants();

// Enter commits when no suggestion is highlighted (a highlighted one falls through to Base UI's
// own Enter-selects handling); comma always commits, letting a pasted "a, b, c" land as three chips.
const COMMIT_KEYS = new Set(["Enter", ","]);

// Forwarded straight to Base UI Root, mirrors the autocomplete seal.
type ComboboxPassthrough = Pick<BaseRootProps<string, true>, "filter" | "autoHighlight" | "limit">;

/** Base UI's change eventDetails (reason/cancel/allowPropagation), derived from the Root prop so the
 *  seal can never drift from it. Optional at our seam: free-text commits synthesize a change with no
 *  originating Base UI event. */
type ComboboxChangeDetails = Parameters<NonNullable<BaseRootProps<string, true>["onValueChange"]>>[1];

/** A category of suggestions rendered under a `GroupLabel` header. Values stay plain strings. */
export interface ComboboxGroup {
  /** The category header text. */
  label: string;
  /** The suggestions in this category (the display strings themselves). */
  items: readonly string[];
}

export interface ComboboxProps extends ComboboxPassthrough {
  /**
   * Candidate suggestions shown in the popup. Omit entirely for pure free-text chip entry — no
   * popup renders at all. Passing `[]` keeps the popup capability mounted for a list that may
   * populate later.
   */
  // @orb-waive baseui-derives-not-respells(items): Base UI's `items` is `readonly any[] | readonly Group<any>[]`; this seal is deliberately string-only (chip values are plain strings) and its `groups` prop owns the grouped arm. Ends if the seal ever accepts object items.
  items?: readonly string[];
  /**
   * Grouped suggestions — each group renders a `GroupLabel` header over its items, the same shape
   * the Autocomplete seal takes. Chip values are still plain strings. Takes precedence over `items`
   * when set; pass `[]` to keep the popup mounted for groups that populate later.
   */
  groups?: readonly ComboboxGroup[];
  /** The committed chip values. Controlled — pair with `onValueChange`. */
  // @orb-waive baseui-derives-not-respells(value): Base UI's `value` admits `null` and non-string members; the chips model is a `readonly string[]` with `[]` as the empty state. Ends if chips stop being strings.
  value?: readonly string[];
  /** Uncontrolled initial chip values. */
  // @orb-waive baseui-derives-not-respells(defaultValue): the uncontrolled half of `value` above — same narrowing, same end condition.
  defaultValue?: readonly string[];
  onValueChange?: (next: string[], details?: ComboboxChangeDetails) => void;
  /**
   * Caps the number of chips. Once reached, further suggestion selections AND free-text commits
   * are silently rejected (existing chips stay removable) and the popup reports the cap instead of
   * offering more suggestions.
   */
  maxItems?: number;
  placeholder?: string;
  disabled?: BaseRootProps<string, true>["disabled"];
  /** Rendered inside the popup when the filter matches nothing. Ignored when `items` is omitted. */
  emptyText?: ReactNode;
  /** Accessible name for the input (there is no visible label — pair with `<Field>` for one). */
  "aria-label"?: string;
  /** Additional id(s) describing the input — merges with `<Field>`'s own wiring when composed. */
  "aria-describedby"?: string;
  /** Applied to the input (the in-flow element). */
  className?: string;
  id?: BaseRootProps<string, true>["id"];
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
 * Announces the live suggestion count to screen readers, same pattern as the autocomplete seal.
 * Grouped entries are flattened so the count is LEAF suggestions, never the number of headers.
 */
function ComboboxResultStatus(): ReactElement {
  const filtered = BaseCombobox.useFilteredItems<unknown>();
  const count = filtered.reduce<number>((total, entry) => {
    const nested = (entry as { items?: readonly unknown[] }).items;
    return total + (Array.isArray(nested) ? nested.length : 1);
  }, 0);
  return (
    <BaseCombobox.Status className={slots.status()} data-slot="combobox-status">
      {formatResultCount(count)}
    </BaseCombobox.Status>
  );
}

/**
 * The multi-select combobox — chips render selected values inline with the draft input; typing
 * filters a suggestion popup, and Enter/comma commit free text alongside it. Item values are
 * `string`; `multiple` is baked in (pick Select for a fixed list, Autocomplete for a single input).
 * Base UI's own Combobox ships chip-removal/navigation; `handleInputKeyDown` only adds committing
 * typed text that isn't in `items`. `maxItems` is enforced once in `handleRootValueChange`, the
 * single funnel both the native selection path and `commitDraft` route through.
 */
export function Combobox({
  items,
  groups,
  value: valueProp,
  defaultValue,
  onValueChange,
  maxItems,
  placeholder,
  disabled = false,
  emptyText = "No results.",
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  className,
  id,
  arrow = false,
  side,
  align,
  sideOffset = POPUP_SIDE_OFFSET,
  container,
  ...rest
}: ComboboxProps): ReactElement {
  const portalContainer = usePortalContainer();
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState<string[]>(() => [...(defaultValue ?? [])]);
  const value = isControlled ? valueProp : internalValue;

  const [inputValue, setInputValue] = useState("");
  // Avoids a re-render on every arrow-key move — only read at the moment Enter is pressed.
  const highlightedRef = useRef<string | undefined>(undefined);

  const suggestionsEnabled = items !== undefined || groups !== undefined;
  const atCap = maxItems !== undefined && value.length >= maxItems;
  // At the cap the suggestion source empties in BOTH shapes — a grouped list must not keep offering
  // headers over a list Base UI would refuse to select from.
  const rootItems = atCap ? [] : (groups ?? items ?? []);
  const emptyContent: ReactNode = atCap ? `Maximum of ${maxItems} reached.` : emptyText;

  function applyValue(next: readonly string[], details?: ComboboxChangeDetails): void {
    const nextArray = [...next];
    if (!isControlled) {
      setInternalValue(nextArray);
    }
    onValueChange?.(nextArray, details);
  }

  /** Trims + dedupes typed text into one or more new chips (splitting on comma), capped. */
  function commitDraft(raw: string): void {
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      return;
    }
    const next = [...value];
    for (const part of parts) {
      if (maxItems !== undefined && next.length >= maxItems) {
        break;
      }
      if (!next.includes(part)) {
        next.push(part);
      }
    }
    if (next.length !== value.length) {
      applyValue(next);
    }
    setInputValue("");
  }

  /** The funnel for Base UI's own selection/removal path (suggestion click, keyboard-select, chip
   * remove button) — enforces `maxItems` on growth; removals always pass through. */
  function handleRootValueChange(next: string[], details?: ComboboxChangeDetails): void {
    if (maxItems !== undefined && next.length > value.length && next.length > maxItems) {
      return;
    }
    applyValue(next, details);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (!COMMIT_KEYS.has(event.key)) {
      return;
    }
    if (event.key === "Enter" && highlightedRef.current !== undefined) {
      // A suggestion is highlighted — defer to Base UI's native Enter-selects handling.
      return;
    }
    event.preventDefault();
    commitDraft(inputValue);
  }

  const renderItem = (item: string): ReactElement => (
    <BaseCombobox.Item className={slots.item()} data-slot="combobox-item" key={item} value={item}>
      {item}
    </BaseCombobox.Item>
  );
  // Base UI's List child is a RENDER FUNCTION over whatever `items` shape the Root was given, so the
  // grouped arm nests Group → GroupLabel → Collection (Collection re-enters the group's own leaves).
  const listChild =
    groups === undefined
      ? renderItem
      : (group: ComboboxGroup): ReactNode => (
          <BaseCombobox.Group className={slots.group()} data-slot="combobox-group" items={group.items} key={group.label}>
            <BaseCombobox.GroupLabel className={slots.groupLabel()} data-slot="combobox-group-label">
              {group.label}
            </BaseCombobox.GroupLabel>
            <BaseCombobox.Collection>{renderItem}</BaseCombobox.Collection>
          </BaseCombobox.Group>
        );

  return (
    <BaseCombobox.Root
      disabled={disabled}
      inputValue={inputValue}
      items={rootItems}
      multiple={true}
      onInputValueChange={setInputValue}
      onItemHighlighted={(highlighted: string | undefined): void => {
        highlightedRef.current = highlighted;
      }}
      onValueChange={handleRootValueChange}
      openOnInputClick={suggestionsEnabled}
      value={[...value]}
      {...rest}
    >
      <BaseCombobox.InputGroup className={slots.inputGroup()} data-slot="combobox-input-group">
        <BaseCombobox.Chips className={slots.chips()} data-slot="combobox-chips">
          <BaseCombobox.Value>
            {(selected: string[]): ReactNode => (
              <>
                {selected.map((chip) => (
                  <BaseCombobox.Chip className={slots.chip()} data-slot="combobox-chip" key={chip}>
                    {chip}
                    <BaseCombobox.ChipRemove aria-label={`Remove ${chip}`} className={slots.chipRemove()} data-slot="combobox-chip-remove">
                      <Icon icon={X} size="xs" />
                    </BaseCombobox.ChipRemove>
                  </BaseCombobox.Chip>
                ))}
                <BaseCombobox.Input
                  aria-describedby={ariaDescribedby}
                  aria-label={ariaLabel}
                  className={cn(slots.input(), className)}
                  data-slot="combobox-input"
                  id={id}
                  onKeyDown={handleInputKeyDown}
                  placeholder={selected.length === 0 ? placeholder : ""}
                />
              </>
            )}
          </BaseCombobox.Value>
        </BaseCombobox.Chips>
      </BaseCombobox.InputGroup>
      {suggestionsEnabled ? (
        <BaseCombobox.Portal container={container ?? portalContainer}>
          <BaseCombobox.Positioner align={align} className={slots.positioner()} data-slot="combobox-positioner" side={side} sideOffset={sideOffset}>
            <BaseCombobox.Popup className={slots.popup()} data-slot="combobox-popup">
              {arrow ? <BaseCombobox.Arrow className={slots.arrow()} data-slot="combobox-arrow" /> : null}
              <BaseCombobox.Empty className={slots.empty()} data-slot="combobox-empty">
                {emptyContent}
              </BaseCombobox.Empty>
              <BaseCombobox.List className={slots.list()} data-slot="combobox-list">
                {listChild}
              </BaseCombobox.List>
              <ComboboxResultStatus />
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      ) : null}
    </BaseCombobox.Root>
  );
}
