// The per-role connections autosave form, mounted through the D78 session boundary (`ConnectionsForm`) at
// module scope — the boundary owns the (constant) entity key (autosave-form-doctrine.md §1/§8, D78 L4).
// The form value is the flat RoutingForm (one entry per role, "" = unset) — not the sparse stored routing
// section — so TanStack Form binds every nested path without undefined-parent churn. The surface projects
// the server section to/from the flat form (see connections-model.ts). No draft mirror: routing is
// server-synced and autosaves within the debounce window.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms/editor";
import type { RoutingForm } from "../lib/connections-model.ts";
import { projectRoutingForm } from "../lib/connections-model.ts";

/** The singleton entity id — routing is one row per user, so a fixed key. */
export const CONNECTIONS_ENTITY_ID = "connections-routing";

/** The all-unset default, projected from the contract default routing section. */
const DEFAULT_ROUTING_FORM: RoutingForm = projectRoutingForm(DEFAULT_USER_SETTINGS.routing);

export const ConnectionsForm = createAutosaveEntityForm<RoutingForm>({
  defaultValues: DEFAULT_ROUTING_FORM,
});
