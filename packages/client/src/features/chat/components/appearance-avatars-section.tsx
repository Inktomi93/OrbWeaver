// The Avatars appearance SECTION (SET-SEAMS stage 1) — showInChatAvatars + avatarSize/Shape/Aspect/Ring.
// A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by features/chat, the feature that READS
// these knobs (`hooks/use-message-appearance.ts`); §6's ownership rule is "the owner is the reader".
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim, so this section's debounced save can never carry a sibling
// section's key (SET-SEAMS §2). Homed in components/ — a FRAGMENT inside the appearance pane, which owns
// containment + focus.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { APPEARANCE_AVATARS_KEYS, APPEARANCE_AVATARS_SUBCATEGORY } from "../lib/appearance-avatars-model";
import { AVATAR_ASPECT_ITEMS, AVATAR_RING_ITEMS, AVATAR_SHAPE_ITEMS, AVATAR_SIZE_ITEMS } from "../lib/appearance-select-items";

type AvatarsForm = Pick<AppearanceSettings, (typeof APPEARANCE_AVATARS_KEYS)[number]>;

interface UpdateAvatarsVars {
  readonly section: "appearance";
  readonly patch: AvatarsForm;
}
const useUpdateAvatars = createEntityMutation<UpdateAvatarsVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your avatar settings.",
});

const AvatarsAutosaveForm = createAutosaveEntityForm<AvatarsForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_AVATARS_KEYS),
});

const AVATARS_ENTITY_ID = "appearance-avatars";

/** The Avatars section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceAvatarsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your avatar settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your avatar settings" onRetry={retry} />}
    >
      <AvatarsFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function AvatarsFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateAvatars({ trpc, invalidation });

  const save = (values: AvatarsForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <AvatarsAutosaveForm entityId={AVATARS_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_AVATARS_KEYS)} save={save}>
      {(session): ReactElement => <AvatarsBody sectionId={sectionId} session={session} />}
    </AvatarsAutosaveForm>
  );
}

function AvatarsBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<AvatarsForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_AVATARS_SUBCATEGORY.label}
      id={settingsAnchorId("appearance", APPEARANCE_AVATARS_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="showInChatAvatars">
          {(field): ReactElement => <field.SwitchField label="Show avatars in chat" description="Hide to show only the speaker's name on each message." />}
        </form.AppField>
        <form.AppField name="avatarSize">{(field): ReactElement => <field.SelectField label="Avatar size" items={AVATAR_SIZE_ITEMS} />}</form.AppField>
        <form.AppField name="avatarShape">{(field): ReactElement => <field.SelectField label="Avatar shape" items={AVATAR_SHAPE_ITEMS} />}</form.AppField>
        <form.AppField name="avatarAspect">
          {(field): ReactElement => (
            <field.SelectField
              label="Avatar aspect"
              description="Portrait reserves a taller box — the immersive VN-style modes use it."
              items={AVATAR_ASPECT_ITEMS}
            />
          )}
        </form.AppField>
        <form.AppField name="avatarRing">{(field): ReactElement => <field.SelectField label="Avatar ring" items={AVATAR_RING_ITEMS} />}</form.AppField>
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
