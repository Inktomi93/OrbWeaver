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
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { APPEARANCE_AVATARS_KEYS, APPEARANCE_AVATARS_SUBCATEGORY } from "../lib/appearance-avatars-model.ts";
import { AVATAR_ASPECT_ITEMS, AVATAR_RING_ITEMS, AVATAR_SHAPE_ITEMS, AVATAR_SIZE_ITEMS } from "../lib/appearance-select-items.ts";

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
      id={configAnchorId("appearance", APPEARANCE_AVATARS_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose lives on each leaf's `teach`. */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_AVATARS_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="show-avatars">
            <form.AppField name="showInChatAvatars">{(field): ReactElement => <field.SwitchField label="Show avatars in chat" />}</form.AppField>
          </SettingRow>
          {/* THE FOUR DEPENDENTS FOLLOW THE MASTER. Size/shape/aspect/ring only describe an avatar that
              renders, so with `showInChatAvatars` off they were four live controls that changed nothing —
              a reader set Avatar size to Medium and the transcript did not move (side-eye 2026-08-16).
              DISABLED rather than hidden: the group keeps its shape, so turning the master back on does not
              make four rows appear out of nowhere, and the master sits directly above as the explanation.
              `disabled` reaches `<Field>`'s Base UI `Field.Root`, which is what makes the trigger genuinely
              non-interactive (`disabled` on the button + `data-disabled`) — never a CSS dim. */}
          <form.Subscribe selector={(state): boolean => state.values.showInChatAvatars}>
            {(showAvatars): ReactElement => (
              <>
                <SettingRow settingId="avatar-size">
                  <form.AppField name="avatarSize">
                    {(field): ReactElement => <field.SelectField label="Avatar size" items={AVATAR_SIZE_ITEMS} disabled={!showAvatars} />}
                  </form.AppField>
                </SettingRow>
                <SettingRow settingId="avatar-shape">
                  <form.AppField name="avatarShape">
                    {(field): ReactElement => <field.SelectField label="Avatar shape" items={AVATAR_SHAPE_ITEMS} disabled={!showAvatars} />}
                  </form.AppField>
                </SettingRow>
                <SettingRow settingId="avatar-aspect">
                  <form.AppField name="avatarAspect">
                    {(field): ReactElement => <field.SelectField label="Avatar aspect" items={AVATAR_ASPECT_ITEMS} disabled={!showAvatars} />}
                  </form.AppField>
                </SettingRow>
                <SettingRow settingId="avatar-ring">
                  <form.AppField name="avatarRing">
                    {(field): ReactElement => <field.SelectField label="Avatar ring" items={AVATAR_RING_ITEMS} disabled={!showAvatars} />}
                  </form.AppField>
                </SettingRow>
              </>
            )}
          </form.Subscribe>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
