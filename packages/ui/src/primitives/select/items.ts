// Select item data is shared with pure models; this door never imports the browser seal.
import type { CSSProperties } from "react";

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
