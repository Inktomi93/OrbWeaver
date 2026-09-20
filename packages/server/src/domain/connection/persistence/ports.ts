// The runtime's FOUR persistence ports over this domain's tables (inference program §11): the package owns no
// `@orb/db`, so the composition root hands it these — read/lookup/list over `user_connections`,
// `connection_bindings`, `provider_rows` and the catalog-snapshot KV. WRITES to the three tables stay in this
// domain's verbs (`own-tables-only`); the ports are the runtime's READ side plus the registry's row persistence.

import type { Db } from "@orb/db";
import type { ConnectionPorts } from "../contract/service.ts";
import { lookupBinding } from "./bindings.ts";
import { createSnapshotStore } from "./catalog-snapshot.ts";
import { fetchConnectionById, listOwnedConnections } from "./connections.ts";
import { deleteProviderRow, listProviderRows, putProviderRow } from "./provider-rows.ts";

export function createConnectionPorts(deps: { readonly db: Db; readonly now: () => number }): ConnectionPorts {
  const { db, now } = deps;
  return {
    connections: {
      get: (id) => fetchConnectionById(db, id),
      listForOwner: (ownerId) => listOwnedConnections(db, ownerId),
    },
    bindings: {
      lookup: ({ actorKind, actorId, task }) => lookupBinding(db, { actorKind, actorId }, task),
    },
    providerStore: {
      list: () => listProviderRows(db),
      put: (row, origin) => putProviderRow(db, row, origin, now()),
      remove: (id) => deleteProviderRow(db, id),
    },
    snapshotStore: createSnapshotStore(db, now),
  };
}
