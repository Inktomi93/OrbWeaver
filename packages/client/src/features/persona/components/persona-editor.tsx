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
import { Copy, Download, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import { ASSISTANT_PREFILL_WARNING, downloadJson, MESSAGE_ROLE_ITEMS, notify, slugifyFilename } from "#lib";
import { usePersonaForm } from "../hooks/use-persona-form";
import { useDuplicatePersona, useUpdatePersona } from "../hooks/use-persona-mutations";
import { PERSONA_DESCRIPTION_MACROS } from "../lib/persona-description-macros";
import type { PersonaFormValues } from "../lib/persona-editor-model";
import { isPrefillCombo, personaFormFromEntity, personaInputFromForm } from "../lib/persona-editor-model";
import { PersonaLoreBookField } from "./persona-world-books-section";

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
}

/** The persona DETAILS — autosaving, no repeated avatar/name (the panel-row's expand-to-edit body). */
export function PersonaEditor({ persona }: PersonaEditorProps): ReactElement {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const duplicate = useDuplicatePersona({ trpc, invalidation });
  const baseMetadata: PersonaMetadata | null = persona.metadata;

  const save = (values: PersonaFormValues): Promise<unknown> =>
    update.mutateAsync({
      personaId: persona.id,
      input: personaInputFromForm(values, baseMetadata),
    });

  const { form, mountKey } = usePersonaForm({
    entityId: persona.id,
    serverValues: personaFormFromEntity(persona),
    save,
  });

  const onExport = async (): Promise<void> => {
    try {
      const backup = await client.persona.export.query({ personaId: persona.id });
      downloadJson(`${slugifyFilename(persona.name, "persona")}.json`, backup);
    } catch {
      notify.error("Couldn't export the persona.");
    }
  };

  return (
    <Stack key={mountKey} gap="row">
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
              suggestions={PERSONA_DESCRIPTION_MACROS}
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
              <Text size="micro" tone="warning">
                {ASSISTANT_PREFILL_WARNING}
              </Text>
            ) : null
          }
        </form.Subscribe>
      </Stack>

      <PersonaLoreBookField personaId={persona.id} />

      <ProvenanceChip metadata={baseMetadata} />

      <Row gap="row" align="center" className="justify-end">
        <Button intent="ghost" size="sm" onClick={(): void => duplicate.mutate({ personaId: persona.id })}>
          <Icon icon={Copy} size="sm" />
          Duplicate
        </Button>
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => {
            void onExport();
          }}
        >
          <Icon icon={Download} size="sm" />
          Export
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
        <Text size="micro" tone="muted">
          {"{{char}}"}/{"{{user}}"} were swapped on mint.
        </Text>
      ) : null}
    </Row>
  );
}
