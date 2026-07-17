// The persona DETAILS form (§13.4 — the D78 session boundary `createAutosaveEntityForm`; the rail-foot
// panel redesign dropped the Save button — "flip it and it saves", mirrors the appearance/injection-row
// autosave forms). The boundary OWNS the persona.id key: each row Collapsible mounts its own instance with
// a fixed identity, so a switch is a boundary-driven remount, no manual `key` to place wrong
// (autosave-form-doctrine.md §1/§8, D78 L4). `save` = the `persona.update` PARTIAL-patch mutation, supplied
// at CALL time (the persona-editor.tsx seam — it closes over the live tRPC client + the row id, neither
// reachable at this module scope; mirrors use-appearance-form.ts). No draft mirror: the server row IS the
// durable store and autosaves within the debounce window (the appearance/injection-row precedent — a local
// crash-mirror would duplicate synced truth for a field set this light).

import { createAutosaveEntityForm } from "#forms";
import type { PersonaFormValues } from "../lib/persona-editor-model";
import { DEFAULT_PERSONA_FORM } from "../lib/persona-editor-model";

export const PersonaForm = createAutosaveEntityForm<PersonaFormValues>({
  defaultValues: DEFAULT_PERSONA_FORM,
});
