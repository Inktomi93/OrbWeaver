// The persona details body — the panel row's expand-to-edit content. Identity (avatar/name) is
// row-owned and never repeated here. What's left, autosaving on every change: title, description,
// starred, injection placement (depth/role reveal only for at_depth; the assistant@0 prefill combo is
// withheld from the write + warned inline), the single-select lore book (a separate live-mutation
// control), duplicate/export actions. A component, not a surface.

import type { PersonaMetadata } from "@orb/contracts/persona";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Copy, Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { Trpc } from "#data";
import { useInvalidation, usePromptMacroSuggestions, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { ASSISTANT_PREFILL_WARNING, MESSAGE_ROLE_ITEMS } from "#lib";
import { PersonaForm } from "../hooks/use-persona-form.ts";
import { useDuplicatePersona, useUpdatePersona } from "../hooks/use-persona-mutations.ts";
import type { PersonaFormValues } from "../lib/persona-editor-model.ts";
import { isPrefillCombo, personaFormFromEntity, personaInputFromForm } from "../lib/persona-editor-model.ts";
import { PersonaConnectedCharacters } from "./persona-connected-characters.tsx";
import { PersonaLoreBookField } from "./persona-world-books-section.tsx";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

/** The 3 description placements → a labelled Select (inline to avoid a snake_case-keyed Record). */
function positionLabel(position: PersonaDescriptionPosition): string {
  if (position === "none") {
    return "Don't inject";
  }
  return position === "at_depth" ? "At a depth in history" : "In the prompt (default)";
}
const POSITION_ITEMS: SelectItems<string> = PERSONA_DESCRIPTION_POSITIONS.map((value) => ({
  value,
  label: positionLabel(value),
}));

export interface PersonaEditorProps {
  readonly persona: PersonaDetail;
  /** Opens the row's delete confirm (the tier-2 ConfirmDialog the row already owns). An always-visible
   *  way out of the create-on-click flow: "New persona" instantly persists a row, so the freshly-opened
   *  autosave editor must offer an explicit discard — the row's own delete is hover-revealed only. */
  readonly onRequestDelete: () => void;
}

/** The persona DETAILS — autosaving, no repeated avatar/name (the panel-row's expand-to-edit body).
 *  Mounted through the D78 session boundary (`PersonaForm`), which owns the persona.id key. */
export function PersonaEditor({ persona, onRequestDelete }: PersonaEditorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const baseMetadata: PersonaMetadata | null = persona.metadata;

  const save = (values: PersonaFormValues): Promise<unknown> =>
    update.mutateAsync({
      personaId: persona.id,
      input: personaInputFromForm(values, baseMetadata),
    });

  return (
    <PersonaForm entityId={persona.id} serverValues={personaFormFromEntity(persona)} save={save}>
      {(session): ReactElement => <PersonaEditorBody session={session} persona={persona} onRequestDelete={onRequestDelete} />}
    </PersonaForm>
  );
}

interface PersonaEditorBodyProps {
  readonly session: AutosaveSession<PersonaFormValues>;
  readonly persona: PersonaDetail;
  readonly onRequestDelete: () => void;
}

/** The form-bearing persona details body — remounted per persona by the boundary's keyed Session. */
function PersonaEditorBody({ session, persona, onRequestDelete }: PersonaEditorBodyProps): ReactElement {
  const { form } = session;
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const duplicate = useDuplicatePersona({ trpc, invalidation });
  const duplicateInFlight = useRef(false);
  // MACU-2 — the builtin catalog UNION the active preset's user macros. A persona description is rendered
  // through the PER-TURN macro registry at assembly (`renderMacros`, the registry `buildTurnUserMacros`
  // composes), so a user macro genuinely resolves here; offering only three builtins was a taste list
  // standing in for the vocabulary.
  const macroSuggestions = usePromptMacroSuggestions();
  const baseMetadata: PersonaMetadata | null = persona.metadata;

  const duplicatePersona = (): void => {
    if (duplicateInFlight.current) {
      return;
    }
    duplicateInFlight.current = true;
    duplicate.mutate(
      { personaId: persona.id },
      {
        onSettled: (): void => {
          duplicateInFlight.current = false;
        },
      },
    );
  };

  return (
    <Stack gap="row">
      <form.AppField name="title">
        {(field): ReactElement => (
          <field.TextField label="Title" hint="A display subtitle for pickers — never injected into the prompt." placeholder="Optional" />
        )}
      </form.AppField>

      <Stack gap="field">
        <form.AppField name="description">
          {(field): ReactElement => (
            <field.MacroField
              label="Description"
              hint="How this persona is described to the model. Use {{user}}/{{persona}} to self-reference."
              suggestions={macroSuggestions}
              rows={6}
              showTokenCount={true}
            />
          )}
        </form.AppField>
      </Stack>

      <Stack gap="field">
        <form.AppField name="descriptionPosition">
          {(field): ReactElement => (
            <field.SelectField
              label="Placement"
              hint="Where the description injects: in the prompt, spliced at a depth, or not at all."
              items={POSITION_ITEMS}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state): PersonaDescriptionPosition => state.values.descriptionPosition}>
          {(position): ReactElement | null => {
            if (position !== "at_depth") {
              return null;
            }
            return (
              <Row gap="field">
                <form.AppField name="injectDepth">{(field): ReactElement => <field.NumberField label="Depth" min={0} />}</form.AppField>
                <form.AppField name="injectRole">{(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} />}</form.AppField>
              </Row>
            );
          }}
        </form.Subscribe>
        <form.Subscribe selector={(state): boolean => isPrefillCombo(state.values)}>
          {(prefill): ReactElement | null =>
            prefill ? (
              // RATIFIED raw axes (#582, the #573 precedent): the SEMANTIC warning tone is the message —
              // no voice carries a semantic color.
              <Text size="micro" tone="warning">
                {ASSISTANT_PREFILL_WARNING}
              </Text>
            ) : null
          }
        </form.Subscribe>
      </Stack>

      <PersonaLoreBookField personaId={persona.id} />

      {/* #866 S4 — the junction from the persona side (persona.listConnectedCharacters + connect/disconnect). */}
      <PersonaConnectedCharacters personaId={persona.id} />

      <ProvenanceChip metadata={baseMetadata} />

      <Row gap="row" align="center" className="justify-end">
        <Button intent="ghost" size="sm" onClick={onRequestDelete}>
          <Icon icon={Trash2} size="sm" />
          Delete
        </Button>
        <Button disabled={duplicate.isPending} intent="ghost" size="sm" onClick={duplicatePersona}>
          <Icon icon={Copy} size="sm" />
          Duplicate
        </Button>
      </Row>
    </Stack>
  );
}

/** Read-only provenance for a persona minted from a character card (`createFromCharacter`). */
function ProvenanceChip({ metadata }: { readonly metadata: PersonaMetadata | null }): ReactElement | null {
  if (metadata?.sourceCharacterId === undefined) {
    return null;
  }
  return (
    <Row gap="field" align="center">
      <Badge intent="info">From a character card</Badge>
      {metadata.swapMacros === true ? (
        <Text voice="gloss">
          {"{{char}}"}/{"{{user}}"} were swapped on mint.
        </Text>
      ) : null}
    </Row>
  );
}
