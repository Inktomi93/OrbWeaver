// The Message-style appearance SECTION (SET-SEAMS stage 1) — chatStyle / colorQuotedSpeech /
// autoFixMarkdown. A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by features/chat: chat
// is the feature that READS these knobs (`hooks/use-chat-style.ts`, `hooks/use-message-appearance.ts`), and
// under SET-SEAMS §6 the owner of a section is its reader — so the editor lives beside the code it governs
// instead of inside the settings god-pane's one welded `AppearanceForm`.
//
// S1 — PATCH MINIMALITY. The form value IS `Pick<AppearanceSettings, …OWNS>` and the patch IS the form
// value: `OWNS` is spelled ONCE and drives the projection (`pickKeys`), the seeded defaults, the form type,
// AND the contribution's `owns` claim, so a sibling appearance section's key can never ride along in this
// section's debounced save. The mutation's `patch` is typed to that Pick, so even a hand-built patch would
// fail tsc. (Server-side the write is `deepMergePlain` inside `serializeUserWrite`, so disjoint sibling
// patches commute — SET-SEAMS §2.2.)
//
// Homed in components/ (NOT surfaces/): a FRAGMENT mounted inside the appearance pane, which owns
// containment + focus (the world-info/library section precedent; client-structure + surface-a11y-focus do
// not apply).

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
import { CHAT_STYLE_ITEMS } from "#lib";
import { settingsAnchorId } from "#state";
import { APPEARANCE_MESSAGE_STYLE_KEYS, APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "../lib/appearance-message-style-model";

type MessageStyleForm = Pick<AppearanceSettings, (typeof APPEARANCE_MESSAGE_STYLE_KEYS)[number]>;

interface UpdateMessageStyleVars {
  readonly section: "appearance";
  readonly patch: MessageStyleForm;
}
const useUpdateMessageStyle = createEntityMutation<UpdateMessageStyleVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your message-style settings.",
});

const MessageStyleAutosaveForm = createAutosaveEntityForm<MessageStyleForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_MESSAGE_STYLE_KEYS),
});

/** Appearance is one row per user, so the D78 session boundary's entity key is a fixed constant. */
const MESSAGE_STYLE_ENTITY_ID = "appearance-message-style";

/** The Message-style section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceMessageStyleSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your message-style settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your message-style settings" onRetry={retry} />}
    >
      <MessageStyleFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MessageStyleFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Cache-first: the settings host already loaded this read, so a section owning its own read costs nothing.
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateMessageStyle({ trpc, invalidation });

  const save = (values: MessageStyleForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <MessageStyleAutosaveForm entityId={MESSAGE_STYLE_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_MESSAGE_STYLE_KEYS)} save={save}>
      {(session): ReactElement => <MessageStyleBody sectionId={sectionId} session={session} />}
    </MessageStyleAutosaveForm>
  );
}

function MessageStyleBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<MessageStyleForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_MESSAGE_STYLE_SUBCATEGORY.label}
      id={settingsAnchorId("appearance", APPEARANCE_MESSAGE_STYLE_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="chatStyle">
          {(field): ReactElement => (
            <field.SelectField
              label="Chat display"
              description="Bubble tints each message; flat is full-width; document is a centered manuscript column. Echo, Whisper, Hush, Ripple and Tide are immersive modes — bled portraits, VN sticky art, accent stripes and message trains."
              items={CHAT_STYLE_ITEMS}
            />
          )}
        </form.AppField>
        <form.AppField name="colorQuotedSpeech">
          {(field): ReactElement => (
            <field.SwitchField
              label="Color quoted speech"
              description="Tint “quoted speech” with the theme’s dialogue color (SillyTavern-style) — a character’s own theme wins. Off renders quotes in the body color."
            />
          )}
        </form.AppField>
        <form.AppField name="autoFixMarkdown">
          {(field): ReactElement => (
            <field.SwitchField
              label="Auto-fix unfinished formatting"
              description="Close a dangling *italic*/**bold** on settled messages (SillyTavern-style). Off keeps a lone asterisk — e.g. a censored word — literal."
            />
          )}
        </form.AppField>
      </FieldLayout>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Section>
  );
}
