import { useRef } from "react";
// The Chat-behavior settings surface (PD-146). Reads the synced UserSettings.chat blob and autosaves each
// change back through updateUserSettingsSection("chat"), which refetches getUserSettings so the composer
// (enterSends/continueOnSend) and the streaming ghost (smoothStream/Cps) re-render live. The two free
// list fields (auto-swipe blacklist + custom stopping strings) edit as newline-delimited text and project
// back to `string[]` via chat-behavior-model.ts. autoContinue / autoSwipe / customStoppingStrings are
// SERVER-honored (the turn engine reads them) — rendered here; the server lane wires the engine.

import { FieldLayout } from "@orb/ui/field";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { AutosaveStatus } from "#forms";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { CHAT_BEHAVIOR_ENTITY_ID, ChatBehaviorAutosaveForm } from "../hooks/use-chat-behavior-form";
import type { ChatBehaviorForm } from "../lib/chat-behavior-model";
import {
  AUTO_SWIPE_MIN_LENGTH_MIN,
  projectChatForm,
  SMOOTH_STREAM_CPS_MAX,
  SMOOTH_STREAM_CPS_MIN,
  STREAM_SCROLL_MODE_ITEMS,
  toChatSectionPatch,
} from "../lib/chat-behavior-model";
import { CHAT_BEHAVIOR_SUBCATEGORY_IDS } from "../lib/chat-behavior-nav";

interface UpdateChatVars {
  readonly section: "chat";
  readonly patch: Record<string, unknown>;
}
const useUpdateChatBehavior = createEntityMutation<UpdateChatVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your chat behavior settings.",
});

/** The DOM anchor id for one chat-behavior subcategory `<Section>`, derived from the shared registry ids. */
const anchor = (sub: string): string => settingsAnchorId("chat-behavior", sub);

/** The chat-behavior panel body (rendered inside the settings modal's Dialog). */
export function ChatBehaviorSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your chat behavior settings…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your chat behavior settings" onRetry={retry} />}
      >
        <FieldLayout orientation="horizontal">
          <Container>
            <ChatBehaviorForm2 />
          </Container>
        </FieldLayout>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the synced settings read, then binds the autosave form to `chat` through the D78 session
 *  boundary — the boundary owns the (constant) entity key, so no manual `key` to place wrong. */
function ChatBehaviorForm2(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateChatBehavior({ trpc, invalidation });

  const save = (values: ChatBehaviorForm): Promise<unknown> =>
    update.mutateAsync({ section: "chat", patch: toChatSectionPatch(values) as unknown as Record<string, unknown> });

  return (
    <ChatBehaviorAutosaveForm entityId={CHAT_BEHAVIOR_ENTITY_ID} serverValues={projectChatForm(data.config.chat)} save={save}>
      {(session): ReactElement => <ChatBehaviorFormBody session={session} />}
    </ChatBehaviorAutosaveForm>
  );
}

/** The form-bearing chat-behavior body — remounted per epoch by the boundary's keyed Session. */
function ChatBehaviorFormBody({ session }: { readonly session: AutosaveSession<ChatBehaviorForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Stack gap="section">
      <Stack gap="section">
        <Section divider={true} heading="Chat & message handling" id={anchor(CHAT_BEHAVIOR_SUBCATEGORY_IDS.messageHandling)}>
          <form.AppField name="enterSends">
            {(field): ReactElement => (
              <field.SwitchField
                label="Enter to send"
                description="Off → Enter inserts a newline; ⌘/Ctrl+Enter always sends. Shift+Enter is always a newline."
              />
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
          <form.AppField name="autoContinue">
            {(field): ReactElement => (
              <field.SwitchField
                label="Auto-continue"
                description="When a reply stops at the length cap, fire one follow-up continue automatically. Syncs across your devices."
              />
            )}
          </form.AppField>
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
        </Section>

        <Section divider={true} heading="Streaming" id={anchor(CHAT_BEHAVIOR_SUBCATEGORY_IDS.streaming)}>
          <form.AppField name="streamScrollMode">
            {(field): ReactElement => (
              <field.SelectField
                label="While a reply streams"
                description="Follow keeps the newest text in view. Pin scrolls your just-sent message to the top and holds it there while the reply grows below (ChatGPT-style)."
                items={STREAM_SCROLL_MODE_ITEMS}
              />
            )}
          </form.AppField>
          <form.AppField name="smoothStream">
            {(field): ReactElement => (
              <field.SwitchField
                label="Smooth streaming"
                description="Reveal replies at a steady pace instead of raw network chunks. The reveal speeds up automatically when the model gets ahead."
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state): boolean => state.values.smoothStream}>
            {(on): ReactElement | null =>
              on ? (
                <form.AppField name="smoothStreamCps">
                  {(field): ReactElement => (
                    <field.SliderField
                      label="Reveal speed (chars/sec)"
                      description="The minimum reveal rate while the model is keeping pace."
                      min={SMOOTH_STREAM_CPS_MIN}
                      max={SMOOTH_STREAM_CPS_MAX}
                    />
                  )}
                </form.AppField>
              ) : null
            }
          </form.Subscribe>
        </Section>
      </Stack>
      <Row gap="field" align="center">
        <AutosaveStatus state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Stack>
  );
}
