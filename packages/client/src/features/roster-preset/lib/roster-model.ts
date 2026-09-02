// The roster library's leaf vocabulary — the collection KIND, and nothing else.
//
// ITS OWN MODULE FOR THE REASON THE OTHER THREE COLLECTIONS HAVE ONE (`tags-model` · `regex-model` ·
// `world-info-model`): the kind is read by the contribution, by the config GROUP that carries the library's
// identity, and by the hooks that write a member SELECTION — and the hooks are imported BY the contribution,
// so homing the id there is an import cycle (caught by depcruise `no-circular`, 2026-09-02). A leaf module
// has no imports of its own and therefore cannot be in one.

/** The collection KIND — the `rosterPreset` config group id (registry key + the selection store's kind axis). */
export const ROSTER_COLLECTION_ID = "rosterPreset";
