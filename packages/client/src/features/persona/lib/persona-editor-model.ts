// Persona editor form MODEL (mirrors settings/lib/theme-editor-model.ts): the flat form value shape the
// editor binds + the ⇄ mappers to the persona wire contract. Pure logic, no JSX. A form is a flat
// scalar/enum record (bound fields are string/number/boolean), so the nested `metadata.inject{depth,role}`
// and the description-placement kind flatten to SIBLING fields here and re-nest into the metadata blob on
// save. The persona READ view is inferred through tRPC — never a cross-package type import (the
// add-member-popover precedent); the alias stays FILE-LOCAL (an exported `type` alias in a feature is a
// no-inline-types leak — the mappers take/return it, consumers infer their own from the same proxy).
//
// IDENTITY IS ROW-OWNED (rail-foot redesign): `name`/`avatarAssetId`/`starred` are edited IN THE ROW
// (inline rename / avatar-click-to-upload / the ♥ favorite toggle — persona-panel-row.tsx), each a
// standalone `persona.update` PARTIAL patch fired the instant it changes — NOT part of this form (starred
// moved here from the DETAILS form per live redesign feedback: a single switch didn't earn a field row,
// and it reads more naturally beside Default/Delete). This model covers only the DETAILS the row's expand
// reveals: title/description + the injection placement. `updatePersonaSchema` is a true `.partial()`
// (verb: update — "undefined skips, null clears"), so the row's single-field patches and this form's
// multi-field patch never step on each other or require re-sending identity on every save.

import type { PersonaMetadata, UpdatePersonaInput } from "@orb/contracts/persona";
import { isAssistantPrefill } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

const DEFAULT_INJECT_DEPTH = 2;
const DEFAULT_INJECT_ROLE: MessageRole = "system";

/** The flat form value shape the persona DETAILS bind (nested `inject{depth,role}` flattened; identity
 *  fields excluded — see the header). */
export interface PersonaFormValues {
  /** Display subtitle — never prompt-injected. `""` ⇒ `null` on save (the contract `title` is nullable). */
  readonly title: string;
  readonly description: string;
  readonly descriptionPosition: PersonaDescriptionPosition;
  /** Messages-back for the `at_depth` splice (NumberField shape: `null` = empty). */
  readonly injectDepth: number | null;
  readonly injectRole: MessageRole;
}

/** From-scratch defaults (for a create with no server row yet). */
export const DEFAULT_PERSONA_FORM: PersonaFormValues = {
  title: "",
  description: "",
  descriptionPosition: "in_prompt",
  injectDepth: DEFAULT_INJECT_DEPTH,
  injectRole: DEFAULT_INJECT_ROLE,
};

/** Read a persona detail into the flat form values — the description placement resolves through the SAME
 *  kit resolver the assembler uses (`resolvePersonaDescriptionPlacement`), so the editor shows the exact
 *  depth/role the model would receive. */
export function personaFormFromEntity(persona: PersonaDetail): PersonaFormValues {
  const placement = resolvePersonaDescriptionPlacement(persona.metadata ?? undefined);
  return {
    title: persona.title ?? "",
    description: persona.description,
    descriptionPosition: placement.kind,
    injectDepth: placement.kind === "at_depth" ? placement.depth : DEFAULT_INJECT_DEPTH,
    injectRole: placement.kind === "at_depth" ? placement.role : DEFAULT_INJECT_ROLE,
  };
}

/** Re-nest the flat form values into the metadata blob, PRESERVING the persona's provenance tail
 *  (`sourceCharacterId`/`swapMacros` + any loose extras) — only `descriptionPosition`/`inject` are the
 *  editor's to write. `inject` rides ONLY the `at_depth` placement (dropped otherwise, matching the
 *  resolver's default).
 *
 *  WITHHOLD GUARD (the assistant\@depth-0 prefill the wire rejects — `isPrefillCombo`): this editor
 *  AUTOSAVES on every debounced change, so it cannot button-gate the invalid combo the way the character
 *  editor does. Instead the mapper WITHHOLDS the invalid placement — it re-emits the base's LAST-SAVED
 *  `descriptionPosition`/`inject` untouched (the room-overrides withhold pattern) so the rejected value
 *  never reaches `persona.update`, while the SIBLING edits in the same tick (title/description) still
 *  persist. The inline `isPrefillCombo` warning tells the user to pick a valid depth/role; the placement
 *  commits once they do. */
function metadataFromForm(
  values: PersonaFormValues,
  base: PersonaMetadata | null,
): Record<string, unknown> {
  const baseEntries = Object.entries(base ?? {});
  // Withhold: keep the base blob VERBATIM (including its last-saved placement) so autosave still writes the
  // sibling title/description but the wire-rejected combo is never submitted.
  if (isPrefillCombo(values)) {
    return Object.fromEntries(baseEntries);
  }
  const next: Record<string, unknown> = {};
  // Carry the provenance tail forward; the editor OWNS only descriptionPosition/inject (dropped below).
  for (const [key, value] of baseEntries) {
    if (key !== "inject" && key !== "descriptionPosition") {
      next[key] = value;
    }
  }
  next["descriptionPosition"] = values.descriptionPosition;
  if (values.descriptionPosition === "at_depth") {
    next["inject"] = { depth: values.injectDepth ?? DEFAULT_INJECT_DEPTH, role: values.injectRole };
  }
  return next;
}

/** Build the `persona.update` PARTIAL input from the DETAILS form values (title `""` ⇒ `null`; metadata
 *  re-nested). `name`/`avatarAssetId`/`starred` are never sent from here — they're the row's own patches. */
export function personaInputFromForm(
  values: PersonaFormValues,
  base: PersonaMetadata | null,
): UpdatePersonaInput {
  return {
    title: values.title.trim() === "" ? null : values.title,
    description: values.description,
    metadata: metadataFromForm(values, base),
  };
}

/** The write guard mirror (contract `personaMetadataWriteSchema`, the shared `isAssistantPrefill` —
 *  `@orb/kit/injection`): assistant-role at depth 0 is a response prefill — unsupported across providers.
 *  Because the editor AUTOSAVES (no Save button to disable), the combo is handled two ways off this
 *  predicate: the editor shows an inline warning, and `metadataFromForm` WITHHOLDS the invalid placement
 *  from the write so the server never sees it while sibling edits still autosave. */
export function isPrefillCombo(values: PersonaFormValues): boolean {
  return (
    values.descriptionPosition === "at_depth" &&
    isAssistantPrefill(values.injectRole, values.injectDepth ?? 0)
  );
}
