// The canonical COLLECTION order — `order` ascending, then `id`. A TOTAL order, so the roster, the welcome
// launcher cards and the context routing all read one sequence regardless of the door's array order and
// stay stable when two collections share an `order`. The `orderHomeTiles` algebra one family across.

import type { CollectionContribution, ContributorRegistry } from "#lib";

export function orderCollections(collections: ContributorRegistry<CollectionContribution>): readonly CollectionContribution[] {
  return collections.list().toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}
