// The Persona settings pane: the notify toggle (a peripheral per-user pref). The persona editor stays in
// the rail-foot panel — and so does RESTORE, as of F3: the ruled lifecycle anatomy puts Import on the
// personas BAND beside New, not three clicks away in a settings pane that shows no personas.

import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useRef } from "react";
import { SettingSwitchRow } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
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

/** The persona settings pane body (rendered inside the settings modal's category column). */
export function PersonaSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your persona settings…</Text>}
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
  const notifyId = useId();

  return (
    <Section heading="Personas" id={settingsAnchorId("personas", PERSONA_SUBCATEGORY_IDS.personas)}>
      <SettingSwitchRow
        id={notifyId}
        label="Notify me when my persona changes in a chat"
        checked={data.config.persona.showNotifications}
        onChange={(next): void => setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })}
      />
    </Section>
  );
}
