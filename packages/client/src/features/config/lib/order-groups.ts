// The canonical GROUP order — `(shelf, order, id)`: the LIST's shelf paint order first, then `order`
// ascending, then `id`. A TOTAL order, so the LIST, the welcome's launcher cards, the mobile teaching frame
// and the search index all read one sequence regardless of the door's Record order and stay stable when two
// groups share an `order`. The `orderHomeTiles` algebra one family across (the C-5 amendment: membership is
// the tuple, placement is the def's `(shelf, order)`).

import type { CollectionGroupDefinition, ConfigGroupDefinition, ConfigGroupRegistry } from "#state";
import { CONFIG_SHELVES, isCollectionGroup } from "#state";

export function orderConfigGroups(groups: ConfigGroupRegistry): readonly ConfigGroupDefinition[] {
  return groups
    .list()
    .toSorted((a, b) => CONFIG_SHELVES.indexOf(a.shelf) - CONFIG_SHELVES.indexOf(b.shelf) || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}

/** The collection groups only, in canonical order — the welcome, the phone's teaching frame and the context
 *  routing read libraries and nothing else. */
export function collectionGroups(groups: ConfigGroupRegistry): readonly CollectionGroupDefinition[] {
  return orderConfigGroups(groups).filter(isCollectionGroup);
}
