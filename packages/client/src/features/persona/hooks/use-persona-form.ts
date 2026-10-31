// The persona DETAILS form (§13.4 — the D78 session boundary `createAutosaveEntityForm`; the rail-foot
// panel redesign dropped the Save button — "flip it and it saves", mirrors the appearance/injection-row
// autosave forms). The boundary OWNS the persona.id key: each row Collapsible mounts its own instance with
// a fixed identity, so a switch is a boundary-driven remount, no manual `key` to place wrong
// (D78 L4). `save` = the `persona.update` PARTIAL-patch mutation, supplied
// at CALL time (the persona-editor.tsx seam — it closes over the live tRPC client + the row id, neither
// reachable at this module scope). No draft mirror: the server row IS the
// durable store and autosaves within the debounce window (the appearance/injection-row precedent — a local
// crash-mirror would duplicate synced truth for a field set this light).

import { createAutosaveEntityForm } from "#forms/editor";
import { PERSONA_NAME_REQUIRED } from "../lib/persona-copy.ts";
import type { PersonaFormValues } from "../lib/persona-editor-model.ts";
import { DEFAULT_PERSONA_FORM } from "../lib/persona-editor-model.ts";

export const PersonaForm = createAutosaveEntityForm<PersonaFormValues>({
  defaultValues: DEFAULT_PERSONA_FORM,
  // A blank name refuses the write (the driver holds an invalid form) and says why on the field, instead of saving
  // the rest and leaving the field blank over the stored name. `onDynamic` is the slot `revalidateLogic()` drives.
  options: {
    validators: {
      onDynamic: ({ value }: { value: PersonaFormValues }): { fields: Record<string, string> } | undefined =>
        value.name.trim() === "" ? { fields: { name: PERSONA_NAME_REQUIRED } } : undefined,
    },
  },
});
