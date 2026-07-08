// The persona EDITOR (FINAL-Persona §A.6b — the completeness bar): a button-gated `createSavedEntityForm`
// over one owned persona surfacing EVERY contract field — name · title · description (macro-aware +
// token-count + live Streamdown preview) · starred · avatar · the depth/insertion options
// (descriptionPosition + inject{depth,role}, depth/role disabled unless `at_depth`, the assistant@0
// prefill guard mirrored) · a read-only Provenance chip for card-minted personas · connected world books.
// Actions here: duplicate · export. Set-as-default + delete live on the PANEL ROW (persona-panel-row.tsx);
// reattribute is a CHAT action (the in-chat picker), not here.
//
// A COMPONENT (the panel row's expand-to-edit body), not a surface. The panel row composes this inline
// when a persona is expanded.

import type { StoredAsset } from "@orb/contracts/assets";
import type { PersonaMetadata } from "@orb/contracts/persona";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { estimateTokens } from "@orb/kit/tokens";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { Copy, Download, Icon } from "@orb/ui/icons";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { uploadAsset, useInvalidation, useTRPC, useTRPCClient } from "#data";
import { downloadJson, notify, slugifyFilename } from "#lib";
import { usePersonaForm } from "../hooks/use-persona-form";
import { useDuplicatePersona, useUpdatePersona } from "../hooks/use-persona-mutations";
import type { PersonaFormValues } from "../lib/persona-editor-model";
import {
  isPrefillCombo,
  PERSONA_DESCRIPTION_MACROS,
  personaFormFromEntity,
  personaInputFromForm,
} from "../lib/persona-editor-model";
import { PersonaWorldBooksSection } from "./persona-world-books-section";

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

const INJECT_ROLE_LABELS: Record<MessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};
const ROLE_ITEMS: SelectItems<string> = MESSAGE_ROLES.map((value) => ({
  value,
  label: INJECT_ROLE_LABELS[value],
}));

export interface PersonaEditorProps {
  readonly persona: PersonaDetail;
}

/** The full inline persona editor for one owned persona (the panel-row's expand-to-edit body). Set-default
 *  and delete live on the ROW; this owns the form + duplicate + export. */
export function PersonaEditor({ persona }: PersonaEditorProps): ReactElement {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const duplicate = useDuplicatePersona({ trpc, invalidation });
  const baseMetadata: PersonaMetadata | null = persona.metadata;

  const save = async (values: PersonaFormValues): Promise<PersonaFormValues> => {
    const saved = await update.mutateAsync({
      personaId: persona.id,
      input: personaInputFromForm(values, baseMetadata),
    });
    return personaFormFromEntity(saved);
  };

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
    <form
      key={mountKey}
      onSubmit={(event): void => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack gap="section">
        <EditorActions
          onDuplicate={(): void => duplicate.mutate({ personaId: persona.id })}
          onExport={(): void => {
            void onExport();
          }}
        />

        <form.AppField name="avatarAssetId">
          {(field): ReactElement => (
            <field.AvatarUploadField
              label="Avatar"
              upload={(file): Promise<StoredAsset> => uploadAsset(file, "avatar")}
              initialHash={persona.avatarHash}
            />
          )}
        </form.AppField>

        <Grid cols="wide" gap="gutter">
          <form.AppField name="name">
            {(field): ReactElement => <field.TextField label="Name" placeholder="Persona name" />}
          </form.AppField>
          <form.AppField name="title">
            {(field): ReactElement => (
              <field.TextField
                label="Title"
                description="A display subtitle for pickers — never injected into the prompt."
              />
            )}
          </form.AppField>
        </Grid>

        <form.AppField name="starred">
          {(field): ReactElement => (
            <field.SwitchField label="Favorite" description="Starred personas sort first." />
          )}
        </form.AppField>

        <Section heading="Description">
          <form.AppField name="description">
            {(field): ReactElement => (
              <field.MacroField
                label="Description"
                description="How this persona is described to the model. Use {{user}}/{{persona}} to self-reference."
                suggestions={PERSONA_DESCRIPTION_MACROS}
                rows={8}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state): string => state.values.description}>
            {(description): ReactElement => <DescriptionMeta value={description} />}
          </form.Subscribe>
        </Section>

        <Section heading="Prompt injection">
          <Grid cols="wide" gap="gutter">
            <form.AppField name="descriptionPosition">
              {(field): ReactElement => (
                <field.SelectField
                  label="Placement"
                  description="Where the description injects: in the prompt, spliced at a depth, or not at all."
                  items={POSITION_ITEMS}
                />
              )}
            </form.AppField>
            <form.Subscribe
              selector={(state): PersonaDescriptionPosition => state.values.descriptionPosition}
            >
              {(position): ReactElement => (
                <>
                  <form.AppField name="injectDepth">
                    {(field): ReactElement => (
                      <field.NumberField
                        label="Depth"
                        description="Messages back from the end of history."
                        min={0}
                        disabled={position !== "at_depth"}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="injectRole">
                    {(field): ReactElement => (
                      <field.SelectField
                        label="Role"
                        items={ROLE_ITEMS}
                        disabled={position !== "at_depth"}
                      />
                    )}
                  </form.AppField>
                </>
              )}
            </form.Subscribe>
          </Grid>
        </Section>

        <ProvenanceChip metadata={baseMetadata} />

        <Section heading="Connected world books">
          <PersonaWorldBooksSection personaId={persona.id} />
        </Section>

        <form.AppForm>
          <form.Subscribe selector={(state): boolean => isPrefillCombo(state.values)}>
            {(prefill): ReactElement => (
              <Stack gap="row">
                {prefill ? (
                  <Text size="micro" tone="warning">
                    Assistant role at depth 0 is a response prefill — pick depth ≥ 1, or role
                    system/user.
                  </Text>
                ) : null}
                <Row gap="row" align="center" className="justify-end">
                  <form.DirtyPill />
                  {prefill ? (
                    <Button disabled={true}>Save persona</Button>
                  ) : (
                    <form.SubmitButton>Save persona</form.SubmitButton>
                  )}
                </Row>
              </Stack>
            )}
          </form.Subscribe>
        </form.AppForm>
      </Stack>
    </form>
  );
}

/** The token-count line + a live untrusted-markdown preview of the description. */
function DescriptionMeta({ value }: { readonly value: string }): ReactElement {
  return (
    <Stack gap="field">
      <Row gap="row" align="center" className="justify-between">
        <Text size="micro" tone="muted" transform="caps">
          Preview
        </Text>
        <Text size="micro" tone="muted" className="font-mono">
          ~{estimateTokens(value)} tokens
        </Text>
      </Row>
      {value.trim() === "" ? (
        <Text tone="muted">Nothing to preview yet.</Text>
      ) : (
        <Markdown trust="untrusted" mode="static">
          {value}
        </Markdown>
      )}
    </Stack>
  );
}

/** Read-only provenance for a persona minted from a character card (`createFromCharacter`). */
function ProvenanceChip({
  metadata,
}: {
  readonly metadata: PersonaMetadata | null;
}): ReactElement | null {
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

interface EditorActionsProps {
  readonly onDuplicate: () => void;
  readonly onExport: () => void;
}

/** The editor's action toolbar — duplicate · export. (Set-default + delete live on the panel row.) */
function EditorActions({ onDuplicate, onExport }: EditorActionsProps): ReactElement {
  return (
    <Row gap="row" align="center" className="justify-end">
      <Button intent="ghost" size="sm" onClick={onDuplicate}>
        <Icon icon={Copy} size="sm" />
        Duplicate
      </Button>
      <Button intent="ghost" size="sm" onClick={onExport}>
        <Icon icon={Download} size="sm" />
        Export
      </Button>
    </Row>
  );
}
