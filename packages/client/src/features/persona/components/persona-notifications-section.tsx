// The Personas group's NOTIFICATIONS section — the one peripheral per-user
// persona pref: the "notify me when my persona changes in a chat" switch. A contributed, anchored section
// like every other settings knob (D120); the switcher reads the SAME key to decide whether its persona
// notices show. Owns its own boundary — a slow settings read never blanks the list
// beside it.

import { Section } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup, SettingSwitchRow } from "#components";
import { createEntityMutation, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
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
      {/* A pending control reserves one row; the measured boundary retains its settled height on reopen. */}
      <QueryBoundary
        fallback={<SkeletonRows count={1} shape="line" />}
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
  // Real row chrome (the `i`, the default-vs-current block): the leaf declares `key: "showNotifications"`.
  return (
    <ConfigTeachScope value={{ group: "personas", sub: PERSONA_NOTIFICATIONS_SUBCATEGORY }}>
      <SettingRowGroup>
        <SettingRow settingId="persona-notifications">
          <SettingSwitchRow
            label="Notify me when my persona changes in a chat"
            checked={data.config.persona.showNotifications}
            onChange={(next): void => setPrefs.mutate({ section: "persona", patch: { showNotifications: next } })}
          />
        </SettingRow>
      </SettingRowGroup>
    </ConfigTeachScope>
  );
}
