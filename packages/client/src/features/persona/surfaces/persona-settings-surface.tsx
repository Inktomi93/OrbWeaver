// The Persona settings pane: the notify toggle + restore-from-backup (peripheral per-user prefs; the
// persona editor stays in the rail-foot panel). Talks to trpc.persona.import/trpc.settings.* directly,
// never importing features/persona internals (the banned feature→feature import).

import { personaBackupSchema } from "@orb/contracts/persona";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, Upload } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { SettingRow } from "@orb/ui/setting-row";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId, useRef } from "react";
import { SettingSwitchRow } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { notify, useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { PERSONA_SUBCATEGORY_IDS } from "../lib/personas-nav";

interface PersonaPrefsPatchVars {
  readonly section: "persona";
  readonly patch: { readonly showNotifications: boolean };
}
const useSetPersonaPrefs = createEntityMutation<PersonaPrefsPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your persona settings.",
});

const useImportPersona = createEntityMutation<inferInput<Trpc["persona"]["import"]>, unknown>({
  options: (trpc) => trpc.persona.import.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restore the persona.",
});

/** The persona settings pane body (rendered inside the settings modal's category column). */
export function PersonaSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your persona settings…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your persona settings" onRetry={retry} />}
      >
        <PersonaSettingsForm />
      </QueryBoundary>
    </Stack>
  );
}

function PersonaSettingsForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const setPrefs = useSetPersonaPrefs({ trpc, invalidation });
  const importPersona = useImportPersona({ trpc, invalidation });
  const notifyId = useId();
  const restoreId = useId();

  const onRestoreFile = async (file: File): Promise<void> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify.error("That file isn't valid JSON.");
      return;
    }
    const rawRows = Array.isArray(parsed) ? parsed : [parsed];
    let ok = 0;
    for (const raw of rawRows) {
      const candidate = personaBackupSchema.safeParse(raw);
      if (candidate.success) {
        importPersona.mutate({ input: candidate.data });
        ok += 1;
      }
    }
    notify.info(ok === 0 ? "No valid personas in that file." : `Restoring ${ok} persona(s)…`);
  };

  return (
    <Section heading="Personas" id={settingsAnchorId("personas", PERSONA_SUBCATEGORY_IDS.personas)}>
      <SettingSwitchRow
        id={notifyId}
        label="Notify me when my persona changes in a chat"
        checked={data.config.persona.showNotifications}
        onChange={(next): void => setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })}
      />
      <SettingRow id={restoreId} label="Restore personas from a backup" description="A JSON export from this app, or a batch of one/many personas.">
        <FileTrigger
          accept="application/json"
          onFilesSelected={([file]): void => {
            if (file !== undefined) {
              void onRestoreFile(file);
            }
          }}
        >
          {({ open }): ReactElement => (
            <Button id={restoreId} intent="secondary" onClick={open} size="sm">
              <Icon icon={Upload} size="sm" />
              Restore…
            </Button>
          )}
        </FileTrigger>
      </SettingRow>
    </Section>
  );
}
