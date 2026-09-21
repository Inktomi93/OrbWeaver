// The CONFIG GROUP vocabulary — the closed tuple the config-group registry is total over, and the shell's
// `openConfigTo` navigation type (config-revamp-design.md §3.1/§6.2, #866).
//
// It was `config-group-ids.ts` (`CONFIG_GROUP_IDS`) until the config revamp folded the settings
// MODAL into the Configuration SECTION: the nine settings categories, the four member collections (the
// old open `config-collections` contributor set — owner fork F-1 closed the tuple) and the persona
// surface are ONE vocabulary now, sorted into four SHELVES the LIST paints as named groups. A collection
// keeps the id its owner already exports (`worldInfo`, `rosterPreset`): each is the ONE home of that kind, rides
// the `data-collection` attributes the CTs address, and keys the per-device disclosure store.
//
// This module imports NOTHING (the two-reader vocabulary rule that split it out of `shell-store.ts`).

/** The config-group vocabulary — the `ConfigGroupDefinition` registry is total over this tuple (assembled
 *  at the door). Tuple order is the `agent-nav` capability order and the within-shelf tiebreak when two
 *  groups share an `order`; the LIST paints `(shelf, order, id)`.
 *
 *  `plugins` is the ONE `extensions`-shelf group: a plugin's own settings ride its row inside it
 *  (plugin-ui-plane.md §4.5) — the door never grows per install. `admin` stays `when`-gated on the def. */
export const CONFIG_GROUP_IDS = [
  // ── user ──
  "personas",
  "appearance",
  "chat-behavior",
  "workloads",
  "backup",
  // ── app ──
  "connections",
  "automation",
  "admin",
  // ── collections (F-1: the closed tuple; ids are the owners' own) ──
  "tags",
  "regex",
  "worldInfo",
  "rosterPreset",
  // ── extensions ──
  "plugins",
] as const;
export type ConfigGroupId = (typeof CONFIG_GROUP_IDS)[number];

export function isConfigGroupId(v: unknown): v is ConfigGroupId {
  return typeof v === "string" && (CONFIG_GROUP_IDS as readonly string[]).includes(v);
}

/** The LIST's four named shelves, in paint order — the settings nav's `SETTINGS_GROUPS` (User/App) with the
 *  two shelves the unification added. `user`, NOT "you" (owner correction 2026-08-30): the mobile "You"
 *  sheet is a different thing that only exists on a phone, and a desktop shelf wearing its name would be
 *  two surfaces called one word. A shelf with zero visible groups paints nothing. */
export const CONFIG_SHELVES = ["user", "app", "collections", "extensions"] as const;
export type ConfigShelf = (typeof CONFIG_SHELVES)[number];
