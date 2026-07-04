import type {
  ComboboxPositionerProps as BasePositionerProps,
  ComboboxRootProps as BaseRootProps,
} from "@base-ui/react/combobox";
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";
import { cn } from "#lib";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the #primitives/icons subpath; tsc + vite resolve X/Icon fine (the autocomplete.tsx precedent).
import { Icon, X } from "#primitives/icons";
import { comboboxVariants } from "./variants";

// Breathing room between the input and the popup (a positioning input, not a styled length).
const POPUP_SIDE_OFFSET = 4;

const slots = comboboxVariants();

// Keys that commit the in-flight draft text as a new chip. Enter commits when no suggestion is
// highlighted (a highlighted suggestion instead falls through to Base UI's own Enter-selects
// handling — see `handleInputKeyDown`); comma has no native meaning here, so it always commits
// (lets a pasted/typed "a, b, c" land as three chips via the same split-on-comma pass `commit`
// applies to a single keypress' worth of text).
const COMMIT_KEYS = new Set(["Enter", ","]);

// The async/fuzzy-search seam — forwarded straight to Base UI Root, mirrors the autocomplete seal.
type ComboboxPassthrough = Pick<BaseRootProps<string, true>, "filter" | "autoHighlight" | "limit">;

export interface ComboboxProps extends ComboboxPassthrough {
  /**
   * Candidate suggestions shown in the popup. Omit entirely for pure free-text chip entry — no
   * popup renders at all (the multi-select still works: Enter/comma commit typed text as chips).
   * Passing `[]` (rather than omitting) keeps the popup capability mounted for a list that may
   * populate later. May be a render-derived array (a fresh reference each render, filtered/mapped
   * from props/state) — no referential stability required, mirroring the autocomplete seal.
   */
  items?: readonly string[];
  /** The committed chip values. Controlled — pair with `onValueChange`. */
  value?: readonly string[];
  /** Uncontrolled initial chip values. */
  defaultValue?: readonly string[];
  onValueChange?: (next: string[]) => void;
  /**
   * Caps the number of chips. Once reached, further suggestion selections AND free-text commits
   * are silently rejected (existing chips stay removable) and the popup reports the cap instead of
   * offering more suggestions.
   */
  maxItems?: number;
  placeholder?: string;
  disabled?: boolean;
  /** Rendered inside the popup when the filter matches nothing. Ignored when `items` is omitted. */
  emptyText?: ReactNode;
  /** Accessible name for the input (there is no visible label — pair with `<Field>` for one). */
  "aria-label"?: string;
  /** Additional id(s) describing the input — merges with `<Field>`'s own wiring when composed. */
  "aria-describedby"?: string;
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
}

/**
 * Announces the live suggestion count to screen readers via Base UI's `Combobox.Status` — the
 * same pattern as the autocomplete seal's status region (reads `useFilteredItems` so the count
 * always matches the rendered list).
 */
function ComboboxResultStatus(): ReactElement {
  const filtered = BaseCombobox.useFilteredItems<string>();
  const count = filtered.length;
  return (
    <BaseCombobox.Status className={slots.status()} data-slot="combobox-status">
      {`${count} ${count === 1 ? "result" : "results"}`}
    </BaseCombobox.Status>
  );
}

/**
 * The multi-select combobox — chips render selected values inline with the draft input; typing
 * filters a suggestion popup, and Enter/comma commit free text alongside it (R4: value-type is an
 * array of chips, so this seals Base UI's Combobox, never the Autocomplete — see that seal's own
 * doc comment for the same cross-reference). Full anatomy: InputGroup[Chips[Value-render(Chip[
 * ChipRemove] + Input)]] → Portal → Positioner → Popup → List/Item + Status.
 *
 * API choice: item VALUES are `string`, same rationale as the autocomplete seal — the near-term
 * consumers (label pickers, tag chips, keyword triggers) are string sets. `multiple` is baked in
 * (this seal IS the multi-select case); a single-select combobox isn't offered here — pick Select
 * for a fixed list or Autocomplete for free-text-plus-suggestions-into-one-input (R4).
 *
 * Keyboard: Base UI's OWN Combobox already ships Backspace-on-empty-input chip removal and
 * ArrowLeft/Right chip-focus navigation with Backspace/Delete-removes-focused-chip (verified in
 * the shipped `ComboboxInput`/`ComboboxChip` internals — R3, not hand-rolled here). The only gap
 * Base UI leaves is committing typed text that ISN'T in `items` (or when there are no `items` at
 * all): `handleInputKeyDown` intercepts Enter only when nothing is highlighted (tracked via
 * `onItemHighlighted`, since a highlighted suggestion must still go through Base UI's native
 * Enter-selects path — the two converge on the same `string[]` shape either way) and comma always
 * (Base UI has no native comma handling to preserve).
 *
 * `maxItems` is enforced once, in `handleRootValueChange` — the single funnel both the native
 * selection path (click/keyboard-select a suggestion) and the free-text `commitDraft` path route
 * through, so the cap can't be bypassed by either route.
 *
 * Deliberate omissions (R2): `Combobox.Group`/`GroupLabel` (no consumer needs categorised
 * suggestions here — the autocomplete seal has `groups` for that shape), `Combobox.Clear` (each
 * chip already removes itself; no consumer asked for a clear-all), `Combobox.Trigger`/`Icon`/
 * `Label` (this is an input-anchored combobox, not a trigger-opened one — same cut the
 * autocomplete seal makes).
 *
 * `arrow` mounts `Combobox.Arrow`; `side`/`align`/`sideOffset` override the Positioner's placement.
 * Inside a `<Field>`, the input auto-registers (label association + `aria-describedby`) because
 * `Combobox.Input` extends `FieldRootState`; `aria-describedby` is also exposed directly for
 * standalone (non-`<Field>`) composition.
 *
 * Usage:
 * ```tsx
 * <Combobox aria-label="Labels" items={seedLabels} maxItems={8} onValueChange={setLabels}
 *   value={labels} />
 * ```
 * — omit `items` for pure free-text chip entry (world-info keyword triggers).
 */
export function Combobox({
  items,
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
  ...rest
}: ComboboxProps): ReactElement {
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = useState<string[]>(() => [...(defaultValue ?? [])]);
  const value = isControlled ? valueProp : internalValue;

  const [inputValue, setInputValue] = useState("");
  // Tracks the currently-highlighted suggestion (if any) without triggering a re-render on every
  // arrow-key move — `handleInputKeyDown` only needs its value at the moment Enter is pressed.
  const highlightedRef = useRef<string | undefined>(undefined);

  const suggestionsEnabled = items !== undefined;
  const atCap = maxItems !== undefined && value.length >= maxItems;
  const rootItems = atCap ? [] : (items ?? []);
  const emptyContent: ReactNode = atCap ? `Maximum of ${maxItems} reached.` : emptyText;

  function applyValue(next: readonly string[]): void {
    const nextArray = [...next];
    if (!isControlled) {
      setInternalValue(nextArray);
    }
    onValueChange?.(nextArray);
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
  function handleRootValueChange(next: string[]): void {
    if (maxItems !== undefined && next.length > value.length && next.length > maxItems) {
      return;
    }
    applyValue(next);
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
                    <BaseCombobox.ChipRemove
                      aria-label={`Remove ${chip}`}
                      className={slots.chipRemove()}
                      data-slot="combobox-chip-remove"
                    >
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
        <BaseCombobox.Portal>
          <BaseCombobox.Positioner
            align={align}
            className={slots.positioner()}
            data-slot="combobox-positioner"
            side={side}
            sideOffset={sideOffset}
          >
            <BaseCombobox.Popup className={slots.popup()} data-slot="combobox-popup">
              {arrow ? (
                <BaseCombobox.Arrow className={slots.arrow()} data-slot="combobox-arrow" />
              ) : null}
              <BaseCombobox.Empty className={slots.empty()} data-slot="combobox-empty">
                {emptyContent}
              </BaseCombobox.Empty>
              <BaseCombobox.List className={slots.list()} data-slot="combobox-list">
                {(item: string): ReactNode => (
                  <BaseCombobox.Item
                    className={slots.item()}
                    data-slot="combobox-item"
                    key={item}
                    value={item}
                  >
                    {item}
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
              <ComboboxResultStatus />
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      ) : null}
    </BaseCombobox.Root>
  );
}
