// The model KIND of a row as the PANE needs it (the runtime decides it again at resolve, with the catalog in
// hand): the row's own `declared.kind` wins, else the curated row by model id, else `generation`. Shared by
// the list view and the bindings writer, so the two cannot disagree about which slots a row may take.

import type { ModelKind, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { curatedKind } from "@orb/inference";

export function curatedKindOf(row: UserConnection, provider: ProviderDef): ModelKind | undefined {
  return row.declared?.kind ?? curatedKind({ model: row.model, providerId: provider.id, wire: provider.wire });
}
