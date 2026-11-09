// The accessible name of a per-item switch: the setting, then the item it belongs to. The name never changes with the
// state, because `aria-checked` carries the state. A zero-import leaf, so a spec's node side reads it without the graph.

/** The setting name of an item's own on/off switch: a plugin, a user account. */
export const ITEM_ENABLED_SETTING = "Enabled";

/** The setting name of a switch that attaches an item (a persona, a character, a regex script) to the book or scope in view. */
export const ITEM_ATTACH_SETTING = "Attach";

/** The four prefix-caching switches' setting names; each is also its visible line label, and the switch name is `<setting>: <connection>`. */
export const PROMPT_CACHE_REQUEST_SETTING = "Request prefix caching";
export const PROMPT_CACHE_AUTOMATIC_SETTING = "Automatic prefix placement";
export const PROMPT_CACHE_SYSTEM_SETTING = "Cache the system prompt";
export const PROMPT_CACHE_DISABLE_IMPLICIT_SETTING = "Disable implicit breakpoints";

/** `<setting>: <item>` — one stable name per item, so a list of the same switch reads as a list of items. */
export function itemSwitchName(setting: string, item: string): string {
  return `${setting}: ${item}`;
}
