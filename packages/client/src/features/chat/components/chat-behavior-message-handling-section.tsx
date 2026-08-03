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
import { FieldLayout } from "@orb/ui/field";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
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
      id={settingsAnchorId("chat-behavior", CHAT_MESSAGE_HANDLING_SUBCATEGORY.id)}
    >
      <FieldLayout orientation="horizontal">
        <form.AppField name="enterSends">
          {(field): ReactElement => (
            <field.SwitchField label="Enter to send" description="Off → Enter inserts a newline; ⌘/Ctrl+Enter always sends. Shift+Enter is always a newline." />
          )}
        </form.AppField>
        <form.AppField name="continueOnSend">
          {(field): ReactElement => (
            <field.SwitchField
              label="Send continues the reply"
              description="With an empty composer and an assistant message last, Send extends that reply instead of doing nothing."
            />
          )}
        </form.AppField>
        <form.AppField name="generateOnEmptySend">
          {(field): ReactElement => (
            <field.SwitchField
              label="Empty Enter generates a reply"
              description="With an empty composer and no assistant message last (a fresh chat, or your own message last), Enter prompts a reply instead of doing nothing. The ▷ generate button does the same, always."
            />
          )}
        </form.AppField>
        <form.AppField name="autoContinue">
          {(field): ReactElement => (
            <field.SwitchField
              label="Auto-continue"
              description="When a reply stops at the length cap, fire follow-up continues automatically — as many as the round limit below. Syncs across your devices."
            />
          )}
        </form.AppField>
        {/* The bound the switch modulates: DISABLED rather than hidden when auto-continue is off, so the
            coupling is visible and the stored value stays readable (the auto-swipe details below hide
            instead — they are a whole sub-feature, this is one number the switch above governs). */}
        <form.Subscribe selector={(state): boolean => state.values.autoContinue}>
          {(on): ReactElement => (
            <form.AppField name="autoContinueRounds">
              {(field): ReactElement => (
                <field.NumberField
                  label="Auto-continue rounds"
                  description="The most follow-up continues one send may fire while the reply keeps stopping at the length cap. A model that always hits the cap wants a bigger reply limit, not more rounds."
                  disabled={!on}
                  max={AUTO_CONTINUE_ROUNDS_MAX}
                  min={AUTO_CONTINUE_ROUNDS_MIN}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="autoSwipeEnabled">
          {(field): ReactElement => (
            <field.SwitchField
              label="Auto-swipe short replies"
              description="When a reply is too short or hits a blacklisted phrase, regenerate it once automatically."
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state): boolean => state.values.autoSwipeEnabled}>
          {(enabled): ReactElement | null =>
            enabled ? (
              <>
                <form.AppField name="autoSwipeMinLength">
                  {(field): ReactElement => (
                    <field.NumberField
                      label="Minimum reply length"
                      description="Replies shorter than this many characters are auto-swiped. 0 disables the length check."
                      min={AUTO_SWIPE_MIN_LENGTH_MIN}
                    />
                  )}
                </form.AppField>
                <form.AppField name="autoSwipeBlacklist">
                  {(field): ReactElement => (
                    <field.TextareaField
                      label="Blacklisted phrases"
                      description="One phrase per line. A reply containing any of these is auto-swiped."
                      placeholder="As an AI language model"
                      rows={3}
                    />
                  )}
                </form.AppField>
              </>
            ) : null
          }
        </form.Subscribe>
        <form.AppField name="customStoppingStrings">
          {(field): ReactElement => (
            <field.TextareaField
              label="Custom stopping strings"
              description="One per line. Generation stops as soon as the model emits any of these strings."
              placeholder="###"
              rows={3}
            />
          )}
        </form.AppField>
        {/* Copy states what the server actually does (`reapTemporaryChats`): a HARD delete, messages and
            all (FK cascade), on a cutoff measured from the chat's CREATION — not last activity — and only
            for chats you host. The sweep is the fire-and-forget call the Home temp-chat tile makes on
            mount, so an expired room can outlive its TTL until you next open Home. */}
        <form.AppField name="tempChatTtlHours">
          {(field): ReactElement => (
            <field.NumberField
              label="Delete temp chats after (hours)"
              description="A temporary chat is deleted this many hours after it was created — messages and all, whether or not you were still using it. Expired rooms are swept when you open Home."
              max={TEMP_CHAT_TTL_HOURS_MAX}
              min={TEMP_CHAT_TTL_HOURS_MIN}
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
