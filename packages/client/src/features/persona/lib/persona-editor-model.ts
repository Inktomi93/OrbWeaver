// Persona editor form model: the flat form value shape the editor binds + the ⇄ mappers to the persona
// wire contract. Pure logic, no JSX. The nested metadata.inject{depth,role} and description-placement
// kind flatten to sibling fields here and re-nest into the metadata blob on save.
//
// Identity is row-owned: name/avatarAssetId/starred are edited in the row (persona-panel-row.tsx),
// each a standalone partial patch fired instantly — not part of this form. This model covers only the
// details the row's expand reveals: title/description + the injection placement.

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

/** The flat form value shape the persona details bind (nested inject\{depth,role\} flattened; identity
 *  fields excluded). */
export interface PersonaFormValues {
  /** Display subtitle — never prompt-injected. `""` ⇒ `null` on save. */
  readonly title: string;
  readonly description: string;
  readonly descriptionPosition: PersonaDescriptionPosition;
  /** Messages-back for the `at_depth` splice (NumberField shape: `null` = empty). */
  readonly injectDepth: number | null;
  readonly injectRole: MessageRole;
}

/** From-scratch defaults for a create with no server row yet. */
export const DEFAULT_PERSONA_FORM: PersonaFormValues = {
  title: "",
  description: "",
  descriptionPosition: "in_prompt",
  injectDepth: DEFAULT_INJECT_DEPTH,
  injectRole: DEFAULT_INJECT_ROLE,
};

/** Read a persona detail into the flat form values — the description placement resolves through the
 *  same kit resolver the assembler uses, so the editor shows the exact depth/role the model receives. */
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

/** Re-nest the flat form values into the metadata blob, preserving the persona's provenance tail —
 *  only descriptionPosition/inject are the editor's to write. Because this editor autosaves (no Save
 *  button to gate an invalid combo), an assistant\@depth-0 prefill combo is withheld: the mapper
 *  re-emits the base's last-saved placement untouched so the rejected value never reaches the wire,
 *  while sibling edits (title/description) still persist. */
function metadataFromForm(values: PersonaFormValues, base: PersonaMetadata | null): Record<string, unknown> {
  const baseEntries = Object.entries(base ?? {});
  if (isPrefillCombo(values)) {
    return Object.fromEntries(baseEntries);
  }
  const next: Record<string, unknown> = {};
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

/** Build the persona.update partial input from the details form values. name/avatarAssetId/starred
 *  are never sent from here — they're the row's own patches. */
export function personaInputFromForm(values: PersonaFormValues, base: PersonaMetadata | null): UpdatePersonaInput {
  return {
    title: values.title.trim() === "" ? null : values.title,
    description: values.description,
    metadata: metadataFromForm(values, base),
  };
}

/** Assistant-role at depth 0 is a response prefill, unsupported across providers. The editor shows an
 *  inline warning off this predicate, and `metadataFromForm` withholds the invalid placement. */
export function isPrefillCombo(values: PersonaFormValues): boolean {
  return values.descriptionPosition === "at_depth" && isAssistantPrefill(values.injectRole, values.injectDepth ?? 0);
}
