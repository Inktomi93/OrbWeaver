// The Persona settings pane: the notify toggle (a peripheral per-user pref) ABOVE the persona roster itself.
//
// IT CONTAINS PERSONAS NOW (side-eye 2026-08-03 P2: "Settings › Personas contains no personas"). The pane
// was a heading and one unrelated switch — a nav item that named a thing and did not hold it. The roster is
// NOT re-implemented here and F3 is not reopened: this mounts `PersonaPanelSurface`'s existing INLINE lens,
// the same one the mobile You sheet renders, so the rail-foot panel, the mobile sheet and this pane are one
// component with one anatomy and one set of verbs (New + Import still on that surface's own band). One
// home, three mounts — the alternative (a pointer sentence) leaves the nav item lying about its contents.

import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useRef } from "react";
import { SettingSwitchRow } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { PERSONA_SUBCATEGORY_IDS, PERSONA_SUBCATEGORY_LABEL } from "../lib/personas-nav.ts";
import { PersonaPanelSurface } from "./persona-panel-surface.tsx";

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
    <Stack gap="section">
      <Section heading={PERSONA_SUBCATEGORY_LABEL} id={settingsAnchorId("personas", PERSONA_SUBCATEGORY_IDS.personas)}>
        <SettingSwitchRow
          id={notifyId}
          label="Notify me when my persona changes in a chat"
          checked={data.config.persona.showNotifications}
          onChange={(next): void => setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })}
        />
      </Section>
      {/* The roster itself — the chrome widget's INLINE lens, not a copy of it. */}
      <PersonaPanelSurface presentation="sheet" />
    </Stack>
  );
}
