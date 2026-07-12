// The per-role connections autosave form (W10 Panel 1 — the role slots; UI-Arch §13.4 "settings panels"
// are a form-factory surface, save-on-change "flip it and it saves"). Built on `createAutosaveEntityForm`
// at MODULE scope (stable hook identity, §13.1) — the same shape as use-appearance-form.ts.
//
// The form value is the FLAT `RoutingForm` (one entry per role, `""` = unset) — NOT the sparse stored
// `routing` section, so TanStack Form binds every nested path (`chat.source`, `embed.model`, …) without
// undefined-parent churn. The surface projects the server section → flat form on mount (`projectRoutingForm`)
// and projects back to the sparse section on save (`toRoutingSection` — see connections-model.ts). The
// SAVE seam is supplied at CALL time by the surface (it closes over the live tRPC client, unreachable at
// module scope — the appearance-form precedent).
//
// NO draft mirror (obligation 5 omitted deliberately, the appearance-form precedent): routing is
// server-synced and autosaves within the debounce window, so a device-local Zustand-persist crash mirror
// would duplicate synced truth (§12.1 "localStorage is device-local ONLY").

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { RoutingForm } from "../lib/connections-model";
import { projectRoutingForm } from "../lib/connections-model";

/** The singleton entity id — routing is one row per user, so a fixed key (stable `mountKey`). */
export const CONNECTIONS_ENTITY_ID = "connections-routing";

/** The all-unset default (projected from the contract default `routing` section — never a hand mirror). */
export const DEFAULT_ROUTING_FORM: RoutingForm = projectRoutingForm(DEFAULT_USER_SETTINGS.routing);

export const useConnectionsForm = createAutosaveEntityForm<RoutingForm>({
  defaultValues: DEFAULT_ROUTING_FORM,
});
