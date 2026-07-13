// The per-role connections autosave form, built on createAutosaveEntityForm at module scope. The form
// value is the flat RoutingForm (one entry per role, "" = unset) — not the sparse stored routing section
// — so TanStack Form binds every nested path without undefined-parent churn. The surface projects the
// server section to/from the flat form (see connections-model.ts). No draft mirror: routing is
// server-synced and autosaves within the debounce window.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { RoutingForm } from "../lib/connections-model";
import { projectRoutingForm } from "../lib/connections-model";

/** The singleton entity id — routing is one row per user, so a fixed key. */
export const CONNECTIONS_ENTITY_ID = "connections-routing";

/** The all-unset default, projected from the contract default routing section. */
export const DEFAULT_ROUTING_FORM: RoutingForm = projectRoutingForm(DEFAULT_USER_SETTINGS.routing);

export const useConnectionsForm = createAutosaveEntityForm<RoutingForm>({
  defaultValues: DEFAULT_ROUTING_FORM,
});
