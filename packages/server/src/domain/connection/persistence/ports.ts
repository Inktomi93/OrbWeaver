// Runtime row adapters retain connection ownership; snapshot bytes use the injected settings tenant port.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { ConnectionPorts, ConnectionPortsDeps } from "../contract/service.ts";
import { lookupBinding } from "./bindings.ts";
import { createSnapshotStore } from "./catalog-snapshot.ts";
import { fetchConnectionById } from "./connections.ts";
import {
  claimedProviderWire,
  deleteAdminProviderRow,
  listProviderRows,
  putAdminProviderRow,
  releasePluginProviderClaims,
  replacePluginProviderRows,
} from "./provider-rows.ts";

export function createConnectionPorts(input: DbAssemblyInput<ConnectionPortsDeps>): ConnectionPorts {
  const deps: ConnectionPortsDeps = { ...input, db: databaseForOwner(input.db) };
  const { db, now } = deps;
  return {
    connections: {
      get: (id) => fetchConnectionById(db, id),
    },
    bindings: {
      lookup: ({ task, ...actor }) => lookupBinding(db, actor, task),
    },
    providerStore: {
      list: () => listProviderRows(db),
      putAdmin: (row, admin) => putAdminProviderRow(db, row, admin, now()),
      removeAdmin: (id) => deleteAdminProviderRow(db, id),
      replacePlugin: (rows, pluginId) => replacePluginProviderRows(db, rows, pluginId, now()),
      removePlugin: (pluginId) => releasePluginProviderClaims(db, pluginId),
    },
    snapshotStore: createSnapshotStore(deps.catalogSettings),
    claimedProviderWire: (providerId, ownerId) => claimedProviderWire(db, ownerId, providerId),
  };
}
