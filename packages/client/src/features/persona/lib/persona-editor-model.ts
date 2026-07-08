// Persona editor form MODEL (mirrors settings/lib/theme-editor-model.ts): the flat form value shape the
// editor binds + the ⇄ mappers to the persona wire contract. Pure logic, no JSX. A form is a flat
// scalar/enum record (bound fields are string/number/boolean), so the nested `metadata.inject{depth,role}`
// and the description-placement kind flatten to SIBLING fields here and re-nest into the metadata blob on
// save. The persona READ view is inferred through tRPC — never a cross-package type import (the
// add-member-popover precedent); the alias stays FILE-LOCAL (an exported `type` alias in a feature is a
// no-inline-types leak — the mappers take/return it, consumers infer their own from the same proxy).

import type { PersonaMetadata, UpdatePersonaInput } from "@orb/contracts/persona";
import type { AssetId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { resolvePersonaDescriptionPlacement } from "@orb/kit/persona";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

const DEFAULT_INJECT_DEPTH = 2;
const DEFAULT_INJECT_ROLE: MessageRole = "system";

/** The flat form value shape the persona editor binds (nested `inject{depth,role}` flattened). */
export interface PersonaFormValues {
  readonly name: string;
  /** Display subtitle — never prompt-injected. `""` ⇒ `null` on save (the contract `title` is nullable). */
  readonly title: string;
  readonly description: string;
  readonly starred: boolean;
  readonly avatarAssetId: AssetId | null;
  readonly descriptionPosition: PersonaDescriptionPosition;
  /** Messages-back for the `at_depth` splice (NumberField shape: `null` = empty). */
  readonly injectDepth: number | null;
  readonly injectRole: MessageRole;
}

/** From-scratch defaults (for a create with no server row yet). */
export const DEFAULT_PERSONA_FORM: PersonaFormValues = {
  name: "New persona",
  title: "",
  description: "",
  starred: false,
  avatarAssetId: null,
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
    name: persona.name,
    title: persona.title ?? "",
    description: persona.description,
    starred: persona.starred,
    avatarAssetId: persona.avatarAssetId,
    descriptionPosition: placement.kind,
    injectDepth: placement.kind === "at_depth" ? placement.depth : DEFAULT_INJECT_DEPTH,
    injectRole: placement.kind === "at_depth" ? placement.role : DEFAULT_INJECT_ROLE,
  };
}

/** Re-nest the flat form values into the metadata blob, PRESERVING the persona's provenance tail
 *  (`sourceCharacterId`/`swapMacros` + any loose extras) — only `descriptionPosition`/`inject` are the
 *  editor's to write. `inject` rides ONLY the `at_depth` placement (dropped otherwise, matching the
 *  resolver's default). */
function metadataFromForm(
  values: PersonaFormValues,
  base: PersonaMetadata | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  // Carry the provenance tail forward; the editor OWNS only descriptionPosition/inject (dropped below).
  for (const [key, value] of Object.entries(base ?? {})) {
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

/** Build the `persona.update` input from the form values (title `""` ⇒ `null`; metadata re-nested). */
export function personaInputFromForm(
  values: PersonaFormValues,
  base: PersonaMetadata | null,
): UpdatePersonaInput {
  return {
    name: values.name,
    title: values.title.trim() === "" ? null : values.title,
    description: values.description,
    starred: values.starred,
    avatarAssetId: values.avatarAssetId,
    metadata: metadataFromForm(values, base),
  };
}

/** The write guard mirror (contract `personaMetadataWriteSchema`): assistant-role at depth 0 is a
 *  response prefill — unsupported across providers. The editor disables Save on this combination instead
 *  of submitting a value the server will reject. */
export function isPrefillCombo(values: PersonaFormValues): boolean {
  return (
    values.descriptionPosition === "at_depth" &&
    values.injectRole === "assistant" &&
    (values.injectDepth ?? 0) === 0
  );
}

/** The macro catalog a persona DESCRIPTION completes against (the `{{ }}` trigger). A persona
 *  description self-references with `{{user}}`/`{{persona}}` (both resolve to THIS persona at assemble
 *  time) and may reference `{{char}}`; the list is passed to the macro-aware textarea (ui imports none). */
export const PERSONA_DESCRIPTION_MACROS: readonly MacroSuggestion[] = [
  { name: "user", category: "persona", description: "This persona's name" },
  { name: "persona", category: "persona", description: "This persona's description" },
  { name: "char", category: "character", description: "The character's name" },
];
