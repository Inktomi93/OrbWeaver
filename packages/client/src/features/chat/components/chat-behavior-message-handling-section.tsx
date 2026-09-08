// The "Chat & message handling" chat-behavior SECTION (SET-SEAMS stage 2) — Enter-to-send, the two
// continue knobs (+ the auto-continue round bound), auto-swipe (+ its gated detail fields), the custom
// stopping strings and the temporary-chat TTL. A
// settings-SECTION CONTRIBUTION at the `chat-behavior` anchor owned by features/chat, the feature that READS
// these knobs: the composer's keydown path (`lib/composer-send-keys.ts`, `lib/continue-on-empty.ts`) and the
// server turn engine chat drives (autoContinue / autoSwipe / customStoppingStrings).
//
// SET-SEAMS stage 2: it used to be one `<Section>` inside the pane's ONE welded autosave form, which sent
// the whole `chat` blob on every keystroke; it owns its own read, its own KEY-MINIMAL write and its own form
// session now. S1: `OWNS` is spelled once (chat-behavior-message-handling-model.ts) and drives the
// projection, the seeded defaults, the patch type and the contribution's `owns` claim. Homed in components/ —
// a FRAGMENT inside the chat-behavior pane, which owns containment + focus.

import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import type { ChatMessageHandlingForm } from "../lib/chat-behavior-message-handling-model.ts";
import {
  AUTO_CONTINUE_ROUNDS_MAX,
  AUTO_CONTINUE_ROUNDS_MIN,
  AUTO_SWIPE_MIN_LENGTH_MIN,
  CHAT_MESSAGE_HANDLING_SUBCATEGORY,
  projectMessageHandlingForm,
  TEMP_CHAT_TTL_HOURS_MAX,
  TEMP_CHAT_TTL_HOURS_MIN,
  toMessageHandlingPatch,
} from "../lib/chat-behavior-message-handling-model.ts";

interface UpdateMessageHandlingVars {
  readonly section: "chat";
  readonly patch: ReturnType<typeof toMessageHandlingPatch>;
}
const useUpdateMessageHandling = createEntityMutation<UpdateMessageHandlingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your chat behavior settings.",
});

const MessageHandlingAutosaveForm = createAutosaveEntityForm<ChatMessageHandlingForm>({
  defaultValues: projectMessageHandlingForm(DEFAULT_CHAT_SETTINGS),
});

const MESSAGE_HANDLING_ENTITY_ID = "chat-message-handling";

/** The Chat & message handling section body — mounted at the chat-behavior pane's sections anchor. */
export function ChatMessageHandlingSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your chat behavior settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your chat behavior settings" onRetry={retry} />}
    >
      <MessageHandlingFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MessageHandlingFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateMessageHandling({ trpc, invalidation });

  const save = (values: ChatMessageHandlingForm): Promise<unknown> => update.mutateAsync({ section: "chat", patch: toMessageHandlingPatch(values) });

  return (
    <MessageHandlingAutosaveForm entityId={MESSAGE_HANDLING_ENTITY_ID} serverValues={projectMessageHandlingForm(data.config.chat)} save={save}>
      {(session): ReactElement => <MessageHandlingBody sectionId={sectionId} session={session} />}
    </MessageHandlingAutosaveForm>
  );
}

function MessageHandlingBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<ChatMessageHandlingForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={CHAT_MESSAGE_HANDLING_SUBCATEGORY.label}
      id={configAnchorId("chat-behavior", CHAT_MESSAGE_HANDLING_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose (incl. the B1/B7 inherit-shape
          caveats and the reapTemporaryChats copy) lives on each leaf's `teach`. */}
      <ConfigTeachScope value={{ group: "chat-behavior", sub: CHAT_MESSAGE_HANDLING_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="enter-sends">
            <form.AppField name="enterSends">{(field): ReactElement => <field.SwitchField label="Enter to send" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="continue-on-send">
            <form.AppField name="continueOnSend">{(field): ReactElement => <field.SwitchField label="Send continues the reply" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="empty-enter-generates">
            <form.AppField name="generateOnEmptySend">{(field): ReactElement => <field.SwitchField label="Empty Enter generates a reply" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="auto-continue">
            <form.AppField name="autoContinue">{(field): ReactElement => <field.SwitchField label="Auto-continue" />}</form.AppField>
          </SettingRow>
          {/* The bound the switch modulates: DISABLED rather than hidden when auto-continue is off, so the
              coupling is visible and the stored value stays readable (the auto-swipe details below hide
              instead — they are a whole sub-feature, this is one number the switch above governs). */}
          <form.Subscribe selector={(state): boolean => state.values.autoContinue}>
            {(on): ReactElement => (
              <SettingRow settingId="auto-continue-rounds">
                <form.AppField name="autoContinueRounds">
                  {(field): ReactElement => (
                    <field.NumberField label="Auto-continue rounds" disabled={!on} max={AUTO_CONTINUE_ROUNDS_MAX} min={AUTO_CONTINUE_ROUNDS_MIN} />
                  )}
                </form.AppField>
              </SettingRow>
            )}
          </form.Subscribe>
          {/* ONE ADDRESS, ONE ROW (#932). These three fields all name the leaf `auto-swipe` — its declared
              `key` is the TOP-LEVEL `autoSwipe` object, so all three of the old rows' Resets wrote the
              same patch — yet each mounted its own `SettingRow`, which painted three modified rails, three
              action cells and three `i`s for one setting. The dependents ride `details` now: they are
              inside the same DOM row, below the master's control, and the gloss + teacher door are stated
              exactly once. */}
          <SettingRow
            settingId="auto-swipe"
            details={
              <form.Subscribe selector={(state): boolean => state.values.autoSwipeEnabled}>
                {(enabled): ReactElement | null =>
                  enabled ? (
                    <>
                      <form.AppField name="autoSwipeMinLength">
                        {(field): ReactElement => <field.NumberField label="Minimum reply length" min={AUTO_SWIPE_MIN_LENGTH_MIN} />}
                      </form.AppField>
                      <form.AppField name="autoSwipeBlacklist">
                        {(field): ReactElement => <field.TextareaField label="Blacklisted phrases" placeholder="As an AI language model" rows={3} />}
                      </form.AppField>
                    </>
                  ) : null
                }
              </form.Subscribe>
            }
          >
            <form.AppField name="autoSwipeEnabled">{(field): ReactElement => <field.SwitchField label="Auto-swipe short replies" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="custom-stopping-strings">
            <form.AppField name="customStoppingStrings">
              {(field): ReactElement => <field.TextareaField label="Custom stopping strings" placeholder="###" rows={3} />}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="offer-choices">
            <form.AppField name="offerChoices">{(field): ReactElement => <field.SwitchField label="Offer choices in new chats" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="reactions">
            <form.AppField name="reactionsEnabled">{(field): ReactElement => <field.SwitchField label="Reactions in new chats" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="character-reactions">
            <form.AppField name="charactersCanReact">{(field): ReactElement => <field.SwitchField label="Characters can react in new chats" />}</form.AppField>
          </SettingRow>
          <SettingRow settingId="temp-chat-ttl">
            <form.AppField name="tempChatTtlHours">
              {(field): ReactElement => (
                <field.NumberField label="Delete temp chats after (hours)" max={TEMP_CHAT_TTL_HOURS_MAX} min={TEMP_CHAT_TTL_HOURS_MIN} />
              )}
            </form.AppField>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
