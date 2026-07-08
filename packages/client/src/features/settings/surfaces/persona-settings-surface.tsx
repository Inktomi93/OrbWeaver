// The PERSONA settings pane (Settings → USER → Personas — rail-foot panel redesign). The panel's old
// "Persona settings" footer (the notify toggle + restore-from-backup) moved HERE — these are peripheral
// per-user prefs, not panel content; the persona EDITOR stays in the rail-foot panel
// (persona-panel-row.tsx / persona-editor.tsx). Deliberately NOT a re-import of persona's mutation hooks
// (`features/settings` importing `features/persona` internals would be the banned feature→feature import,
// client-structure law) — this pane talks to `trpc.persona.import`/`trpc.settings.*` directly, the same
// "cross-feature reads ride trpc.*" seam every other settings pane uses.

import { personaBackupSchema } from "@orb/contracts/persona";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the add-member-popover precedent).
import { Icon, Upload } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, QueryBoundary, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";

interface PersonaPrefsPatchVars {
  readonly section: "persona";
  readonly patch: { readonly showNotifications: boolean };
}
const useSetPersonaPrefs = createEntityMutation<PersonaPrefsPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't save your persona settings.",
});

const useImportPersona = createEntityMutation<inferInput<Trpc["persona"]["import"]>, unknown>({
  options: (trpc) => trpc.persona.import.mutationOptions(),
  invalidates: (trpc) => [trpc.persona.list.queryFilter()],
  errorToast: "Couldn't restore the persona.",
});

/** The persona settings pane body (rendered inside the settings modal's category column). */
export function PersonaSettingsSurface(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading your persona settings…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load your persona settings.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      <PersonaSettingsForm />
    </QueryBoundary>
  );
}

function PersonaSettingsForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const setPrefs = useSetPersonaPrefs({ trpc, invalidation });
  const importPersona = useImportPersona({ trpc, invalidation });
  const fileRef = useRef<HTMLInputElement>(null);

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
    <Section heading="Personas">
      <Row align="center" className="justify-between" gap="row">
        <Text size="label">Notify me when my persona changes in a chat</Text>
        <Switch
          checked={data.config.persona.showNotifications}
          onCheckedChange={(next): void =>
            setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })
          }
        />
      </Row>
      <Row align="center" className="justify-between" gap="row">
        <Stack className="min-w-0">
          <Text size="label">Restore personas from a backup</Text>
          <Text size="micro" tone="muted">
            A JSON export from this app, or a batch of one/many personas.
          </Text>
        </Stack>
        <Button intent="secondary" onClick={(): void => fileRef.current?.click()} size="sm">
          <Icon icon={Upload} size="sm" />
          Restore…
        </Button>
        <input
          accept="application/json"
          hidden={true}
          onChange={(event): void => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              void onRestoreFile(file);
            }
          }}
          ref={fileRef}
          type="file"
        />
      </Row>
    </Section>
  );
}
