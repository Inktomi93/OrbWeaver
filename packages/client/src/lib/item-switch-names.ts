// The accessible name of a per-item switch: the setting, then the item it belongs to. The name never changes with the
// state, because `aria-checked` carries the state. A zero-import leaf, so a spec's node side reads it without the graph.

/** The setting name of an item's own on/off switch: a plugin, a user account. */
export const ITEM_ENABLED_SETTING = "Enabled";

/** `<setting>: <item>` — one stable name per item, so a list of the same switch reads as a list of items. */
export function itemSwitchName(setting: string, item: string): string {
  return `${setting}: ${item}`;
}
