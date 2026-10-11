// The persona editor — the Settings row's expand-to-edit body, the one home for editing a persona. Identity
// row first (avatar upload, name, title), then description, injection placement (depth/role reveal only for
// at_depth; the assistant@0 prefill combo is withheld from the write + warned inline), the lore book and the
// connected characters, then the footer verbs: Duplicate, Export, Delete. Autosaves on every change.

import { blobUrl } from "@orb/contracts/assets";
import type { PersonaMetadata } from "@orb/contracts/persona";
import { initialsFor } from "@orb/kit/initials";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import { PERSONA_DESCRIPTION_POSITIONS } from "@orb/kit/persona";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Copy, Download, Icon, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { FOCUS_RING } from "@orb/ui/lib";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import type { Trpc } from "#data";
import { useInvalidation, usePromptMacroSuggestions, useTRPC, useTRPCClient, useUploadAsset, useUploadCaps } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { ASSISTANT_PREFILL_WARNING, downloadTextFile, MESSAGE_ROLE_ITEMS, notify, oversizeUploadMessage } from "#lib";
import { takePersonaEditorFocus, usePersonaEditorFocusRequest } from "#state";
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

/** The editor inside its named, bordered row panel. Focus lands on it only on a pending request from the
 *  switcher's Edit door (mounting or already mounted); a chevron expand leaves focus where it is. */
export function PersonaEditorRegion({ persona, subject, onRequestDelete }: PersonaEditorProps & { readonly subject: string }): ReactElement {
  const regionRef = useRef<HTMLDivElement>(null);
  const request = usePersonaEditorFocusRequest();
  useEffect(() => {
    if (request?.personaId === persona.id && regionRef.current !== null) {
      regionRef.current.focus();
      takePersonaEditorFocus();
    }
  }, [request, persona.id]);
  return (
    <Stack
      aria-label={`Edit ${subject}`}
      className={`rounded-base border border-border p-block outline-none ${FOCUS_RING}`}
      gap="section"
      ref={regionRef}
      role="group"
      tabIndex={-1}
    >
      <PersonaEditor persona={persona} onRequestDelete={onRequestDelete} />
    </Stack>
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

  // The bytes are the SERVER's — the same file the backup bundle carries.
  const client = useTRPCClient();
  const exportPersona = async (): Promise<void> => {
    const file = await client.persona.export.query({ personaId: persona.id });
    downloadTextFile(file.filename, file.fileText);
  };

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
      <Row gap="row" align="start" data-slot="persona-editor-identity">
        <AvatarTrigger persona={persona} />
        <Stack gap="row" className="min-w-0 flex-1">
          <form.AppField name="name">
            {(field): ReactElement => <field.TextField label="Name" hint="Characters call you this. It can't be empty." />}
          </form.AppField>
          <form.AppField name="title">
            {(field): ReactElement => (
              <field.TextField label="Title" hint="A display subtitle for pickers — never injected into the prompt." placeholder="Optional" />
            )}
          </form.AppField>
        </Stack>
      </Row>

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

      <Row gap="row" align="center" className="justify-end" data-slot="persona-editor-footer">
        <Button disabled={duplicate.isPending} intent="ghost" size="sm" onClick={duplicatePersona}>
          <Icon icon={Copy} size="sm" />
          Duplicate
        </Button>
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => {
            exportPersona().catch(() => notify.error("Couldn't export the persona."));
          }}
        >
          <Icon icon={Download} size="sm" />
          Export
        </Button>
        <Button intent="ghost" size="sm" onClick={onRequestDelete}>
          <Icon icon={Trash2} size="sm" />
          Delete
        </Button>
      </Row>
    </Stack>
  );
}

/** The avatar as its own upload door. The route's size cap is checked before the multipart POST, because
 *  `FileTrigger` carries no ceiling of its own. */
function AvatarTrigger({ persona }: { readonly persona: PersonaDetail }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePersona({ trpc, invalidation });
  const upload = useUploadAsset();
  const uploadCaps = useUploadCaps();
  const avatarSrc = persona.avatarHash === null ? {} : { src: blobUrl(persona.avatarHash) };
  const onAvatarFile = async (file: File): Promise<void> => {
    const oversize = oversizeUploadMessage(file, uploadCaps.assetUpload);
    if (oversize !== undefined) {
      notify.error(oversize);
      return;
    }
    const stored = await upload(file, "avatar");
    update.mutate({ personaId: persona.id, input: { avatarAssetId: stored.assetId } });
  };
  return (
    <FileTrigger
      accept="image/*"
      onFilesSelected={([file]): void => {
        if (file !== undefined) {
          onAvatarFile(file).catch(() => notify.error("Couldn't upload the avatar."));
        }
      }}
    >
      {({ open }): ReactElement => (
        <Button aria-label={`Change avatar for ${persona.name}`} className="shrink-0" intent="ghost" onClick={open} size="inline">
          <Avatar fallbackDelay={0} hueSeed={persona.id} size="md" {...avatarSrc}>
            {initialsFor(persona.name)}
          </Avatar>
        </Button>
      )}
    </FileTrigger>
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
