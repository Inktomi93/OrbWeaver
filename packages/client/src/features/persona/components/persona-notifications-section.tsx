// The Personas group's NOTIFICATIONS section (config-revamp-design.md §6.8.2) — the one peripheral per-user
// persona pref: the "notify me when my persona changes in a chat" switch. A contributed, anchored section
// like every other settings knob (D120); the this-chat section reads the SAME key to decide whether its
// switch/restamp confirmations toast. Owns its own boundary — a slow settings read never blanks the list
// beside it.

import { Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, SettingSwitchRow } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { PERSONA_NOTIFICATIONS_SUBCATEGORY } from "../lib/personas-nav.ts";

interface PersonaPrefsPatchVars {
  readonly section: "persona";
  readonly patch: { readonly showNotifications: boolean };
}
const useSetPersonaPrefs = createEntityMutation<PersonaPrefsPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your persona settings.",
});

export function PersonaNotificationsSection(): ReactElement {
  return (
    <Section heading={PERSONA_NOTIFICATIONS_SUBCATEGORY.label} id={configAnchorId("personas", PERSONA_NOTIFICATIONS_SUBCATEGORY.id)}>
      {/* RESERVED (#1098), fallback UNCHANGED. This settles into exactly ONE switch row, so a SkeletonRows
          fill would claim a list that never arrives — the sentence is the honest wait. The key is still
          worth it: a control row is roughly twice a text line, and every Personas section below this one
          pays that delta on the config scroll. */}
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your persona settings…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your persona settings" onRetry={retry} />}
        reserveKey="config.personas.notifications"
      >
        <NotificationsSwitch />
      </QueryBoundary>
    </Section>
  );
}

function NotificationsSwitch(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const setPrefs = useSetPersonaPrefs({ trpc, invalidation });
  return (
    <SettingSwitchRow
      label="Notify me when my persona changes in a chat"
      checked={data.config.persona.showNotifications}
      onChange={(next): void => setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })}
    />
  );
}
