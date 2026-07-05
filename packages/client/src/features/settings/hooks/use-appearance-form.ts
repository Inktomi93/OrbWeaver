// The appearance-settings autosave form (D44 §12.1; UI-Arch §13.4 — "settings panels" are a form-
// factory surface: many grouped controls, save-on-change "flip it and it saves"). Built on
// `createAutosaveEntityForm` at MODULE scope (stable hook identity, §13.1) — the FIRST product
// consumer of that factory.
//
// SAVE SEAM: no `config.save` here. The persist fn closes over the live tRPC client, a React-context
// value unreachable at module scope, so the SURFACE supplies it at call time via the args `save`
// (the factory's call-time seam, added for exactly this first-consumer case — it mirrors how
// `createEntityMutation` receives its client per-call, never baked into module config). `defaultValues`
// is the ONE contract default (`DEFAULT_APPEARANCE_SETTINGS`, derived from the schema — never a mirror).
//
// NO draft mirror (obligation 5 omitted deliberately): appearance is server-synced and autosaves within
// the debounce window; the server row IS the durable store, so a Zustand-persist crash-mirror would be
// redundant device-local state duplicating synced truth (§12.1 "localStorage is device-local ONLY").
// The full `AppearanceSettings` (all 15 knobs) is the form's value type so unshown knobs round-trip
// their server values unchanged on every patch — the v1 UI edits a subset, but never drops a field.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";

/** The singleton entity id — appearance is one row per user, so a fixed key (stable `mountKey`). */
export const APPEARANCE_ENTITY_ID = "appearance";

export const useAppearanceForm = createAutosaveEntityForm<AppearanceSettings>({
  defaultValues: DEFAULT_APPEARANCE_SETTINGS,
});
