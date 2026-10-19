// The persona LIST — the MANAGE surface's body (Settings → Personas → Your personas): the band (New, From
// character, Restore) and the rows, each expanding its own editor in place. A row never switches who you play;
// the switcher is the play surface. Suspends on `persona.list` + `settings.getUserSettings` — the MOUNT owns
// the boundary.

import type { PersonaId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Drama, Icon, Plus, Upload } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify, rowQualifiers, timeLib } from "#lib";
import { selectPersonaEditor, usePersonaEditorId } from "#state";
import { useCreatePersona, useImportPersonaFile, useRemovePersona } from "../hooks/use-persona-mutations.ts";
import { useDefaultPersona } from "../hooks/use-playing-persona.ts";
import { PersonaFromCharacterDialog } from "./persona-from-character-dialog.tsx";
import { PersonaPanelRow } from "./persona-panel-row.tsx";

/** The list: band + rows. A row never switches who you play; that is the switcher's job. */
export function PersonaList(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: personas } = useSuspenseQuery(trpc.persona.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const seeds = settings.config.seeds;
  const crown = useDefaultPersona(settings.config.persona.showNotifications);
  const create = useCreatePersona({ trpc, invalidation });
  const remove = useRemovePersona({ trpc, invalidation });
  const importPersona = useImportPersonaFile({ trpc, invalidation });

  const expandedId = usePersonaEditorId();
  const setExpandedId = selectPersonaEditor;
  const [fromCharacterOpen, setFromCharacterOpen] = useState(false);
  const onCreate = async (): Promise<void> => {
    // @orb-waive caught-failure-ownership(catch): useCreatePersona (hooks/use-persona-mutations.ts) carries errorToast "Couldn't create the persona."; this catch only keeps the callers' own notify from toasting it twice. Ends if useCreatePersona drops its errorToast.
    try {
      const created = await create.mutateAsync({ input: { name: "New persona", description: "" } });
      setExpandedId(created.id);
    } catch {
      // createEntityMutation's errorToast already surfaced the failure — nothing to expand.
    }
  };
  // F3: IMPORT is a band affordance beside the ONE primary (the ruled anatomy) — it used to live in a
  // settings pane, three clicks and a different surface away from the personas it restores.
  const onImportFile = async (file: File): Promise<void> => {
    try {
      const restored = await importPersona.mutateAsync({ fileText: await file.text() });
      notify.success(`Restored “${restored.name}”.`);
      setExpandedId(restored.id);
    } catch (error) {
      // The SERVER's refusal reason, rendered as words — "written by a newer version of orbweaver" is a
      // different problem from "that isn't a persona file", and the user can only act on the difference.
      notify.error(error instanceof Error ? error.message : "Couldn't restore the persona.");
    }
  };
  // THE ROW'S CONTROLS NAME WHICH ROW THEY BELONG TO (#458, the #443 grammar). Two personas can legitimately
  // share a name — the user names two "Traveler", restores a backup beside its original — and the row's two
  // name-embedding controls (the stretched select target and the kebab) then announce IDENTICAL accessible
  // names: the live mobile-sheet census read `["Actions for Traveler","Actions for Traveler"]`. A per-row
  // derivation cannot see that, so the qualifier is resolved HERE, with the whole list in hand.
  //
  // SPENT, NOT SPRAYED — the one deviation from the chats/presets/regex call sites. `rowQualifiers` returns
  // the stamp the row already SHOWS as its baseline, which is honest on those lists and a lie on this one:
  // a persona row displays no timestamp at all, so naming one on a row whose name is already unique would put
  // a datum in the accessible name that is nowhere on screen. Only a COLLIDED name buys the escalation.
  const nameCounts = new Map<string, number>();
  for (const persona of personas) {
    nameCounts.set(persona.name, (nameCounts.get(persona.name) ?? 0) + 1);
  }
  const qualifiers = rowQualifiers(
    personas.map((persona) => ({ name: persona.name, at: persona.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );

  // Deleting the default moves the crown to the last-played persona (else the newest); the server names it,
  // and the reader is told, since every new chat now starts there.
  const onDelete = async (personaId: PersonaId): Promise<void> => {
    const { newDefaultPersonaId } = await remove.mutateAsync({ personaId });
    if (expandedId === personaId) {
      setExpandedId(null);
    }
    const crowned = personas.find((persona) => persona.id === newDefaultPersonaId);
    if (crowned !== undefined) {
      notify.info(`${crowned.name} is now your default.`);
    }
  };

  return (
    <Stack gap="row">
      <PersonaHeader
        onFromCharacter={(): void => setFromCharacterOpen(true)}
        onImport={(file): void => {
          onImportFile(file).catch(() => notify.error("Couldn't restore the persona."));
        }}
        onNew={(): void => {
          onCreate().catch(() => notify.error("Couldn't create the persona."));
        }}
      />
      {/* #866 S4 — the third band door: mint a persona from an owned character card (the picker IS the
          create; the fresh row expands like the New door's). */}
      <PersonaFromCharacterDialog onCreated={setExpandedId} onOpenChange={setFromCharacterOpen} open={fromCharacterOpen} />
      <Separator />
      <Stack gap="field">
        {personas.length === 0 ? (
          <EmptyState
            action={
              <Button
                intent="primary"
                size="sm"
                onClick={(): void => {
                  onCreate().catch(() => notify.error("Couldn't create the persona."));
                }}
              >
                <Icon icon={Plus} size="sm" />
                Create persona
              </Button>
            }
            icon={<Icon icon={Drama} size="md" />}
            title="No personas yet"
            description="Create one to start speaking as a distinct identity."
          />
        ) : (
          personas.map((persona, index) => (
            <PersonaPanelRow
              key={persona.id}
              persona={persona}
              {...((nameCounts.get(persona.name) ?? 0) > 1 ? { qualifier: qualifiers[index] ?? "" } : {})}
              isDefault={persona.id === seeds.defaultPersonaId}
              expanded={persona.id === expandedId}
              onSetDefault={(): void => crown.set(persona)}
              onClearDefault={crown.clear}
              onToggleExpand={(): void => setExpandedId(expandedId === persona.id ? null : persona.id)}
              onDelete={(): Promise<void> => onDelete(persona.id)}
            />
          ))
        )}
      </Stack>
    </Stack>
  );
}

/** The list's BAND — its name and its three verbs. The playing-as identity lives on the row (see above). */
/** Names the FORMAT: this control takes an Orbweaver persona backup only. A SillyTavern persona has no
 *  standalone file — it lives in the profile's settings — so that route is the profile-folder import under
 *  Backup & Restore, which the Personas help points to. */
const IMPORT_LABEL = "Restore a persona from an Orbweaver backup file";
const FROM_CHARACTER_LABEL = "New persona from a character";

function PersonaHeader({
  onNew,
  onImport,
  onFromCharacter,
}: {
  readonly onNew: () => void;
  readonly onImport: (file: File) => void;
  readonly onFromCharacter: () => void;
}): ReactElement {
  return (
    <Row gap="row" align="center" className="justify-between">
      {/* Converted #582 (the #573 near-kicker ruling: "takes semibold and becomes one"): a caps-micro
          band name, byte-identical to `kicker` once the weight axis is corrected regular→semibold. */}
      <Text voice="kicker">Your personas</Text>
      {/* Exactly ONE primary (New); Import and From-character (#866 S4) sit beside it as ghost icons — the
          preset band's grammar. `size="icon"` (not `sm`) so the icon-only triggers keep the token-driven
          44px coarse floor, and the native `title` is the SAME string as the aria-label so tooltip and
          accessible name can't drift. */}
      <Row gap="field" align="center">
        <Button aria-label={FROM_CHARACTER_LABEL} intent="ghost" onClick={onFromCharacter} size="icon" title={FROM_CHARACTER_LABEL}>
          <Icon icon={Drama} size="sm" />
        </Button>
        <FileTrigger
          accept="application/json"
          onFilesSelected={([file]): void => {
            if (file !== undefined) {
              onImport(file);
            }
          }}
        >
          {({ open }): ReactElement => (
            <Button aria-label={IMPORT_LABEL} intent="ghost" onClick={open} size="icon" title={IMPORT_LABEL}>
              <Icon icon={Upload} size="sm" />
            </Button>
          )}
        </FileTrigger>
        <Button intent="primary" size="sm" onClick={onNew}>
          <Icon icon={Plus} size="sm" />
          New persona
        </Button>
      </Row>
    </Row>
  );
}
