// The "Streaming" chat-behavior SECTION (SET-SEAMS stage 2) — the stream scroll mode plus the smooth-reveal
// pacer and its gated speed slider. A settings-SECTION CONTRIBUTION at the `chat-behavior` anchor owned by
// features/chat, the feature that READS these knobs: the message list's `scrollMode` and the streaming
// ghost's `useSmoothText` pacer.
//
// SET-SEAMS stage 2: it used to be one `<Section>` inside the pane's ONE welded autosave form, which sent the
// whole `chat` blob on every keystroke; it owns its own read, its own KEY-MINIMAL write and its own form
// session now. S1: `OWNS` is spelled once (chat-behavior-streaming-model.ts) and drives the `pickKeys`
// projection, the seeded defaults, the `Pick`-derived form type and the contribution's `owns` claim.

import type { ChatSettings } from "@orb/contracts/settings";
import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
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
import {
  CHAT_STREAMING_KEYS,
  CHAT_STREAMING_SUBCATEGORY,
  SMOOTH_STREAM_CPS_MAX,
  SMOOTH_STREAM_CPS_MIN,
  STREAM_SCROLL_MODE_ITEMS,
} from "../lib/chat-behavior-streaming-model.ts";

type StreamingForm = Pick<ChatSettings, (typeof CHAT_STREAMING_KEYS)[number]>;

interface UpdateStreamingVars {
  readonly section: "chat";
  readonly patch: StreamingForm;
}
const useUpdateStreaming = createEntityMutation<UpdateStreamingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your streaming settings.",
});

const StreamingAutosaveForm = createAutosaveEntityForm<StreamingForm>({
  defaultValues: pickKeys(DEFAULT_CHAT_SETTINGS, CHAT_STREAMING_KEYS),
});

const STREAMING_ENTITY_ID = "chat-streaming";

/** The Streaming section body — mounted at the chat-behavior pane's sections anchor. */
export function ChatStreamingSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your streaming settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your streaming settings" onRetry={retry} />}
    >
      <StreamingFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function StreamingFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateStreaming({ trpc, invalidation });

  const save = (values: StreamingForm): Promise<unknown> => update.mutateAsync({ section: "chat", patch: values });

  return (
    <StreamingAutosaveForm entityId={STREAMING_ENTITY_ID} serverValues={pickKeys(data.config.chat, CHAT_STREAMING_KEYS)} save={save}>
      {(session): ReactElement => <StreamingBody sectionId={sectionId} session={session} />}
    </StreamingAutosaveForm>
  );
}

function StreamingBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<StreamingForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={CHAT_STREAMING_SUBCATEGORY.label}
      id={configAnchorId("chat-behavior", CHAT_STREAMING_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3): rows are label + control — the prose lives on each leaf's `teach`. */}
      <ConfigTeachScope value={{ group: "chat-behavior", sub: CHAT_STREAMING_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="stream-follow">
            <form.AppField name="streamScrollMode">
              {(field): ReactElement => <field.SelectField label="While a reply streams" items={STREAM_SCROLL_MODE_ITEMS} />}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="smooth-stream">
            <form.AppField name="smoothStream">{(field): ReactElement => <field.SwitchField label="Smooth streaming" />}</form.AppField>
          </SettingRow>
          <form.Subscribe selector={(state): boolean => state.values.smoothStream}>
            {(on): ReactElement | null =>
              on ? (
                <SettingRow settingId="smooth-stream-cps">
                  <form.AppField name="smoothStreamCps">
                    {(field): ReactElement => <field.SliderField label="Reveal speed (chars/sec)" min={SMOOTH_STREAM_CPS_MIN} max={SMOOTH_STREAM_CPS_MAX} />}
                  </form.AppField>
                </SettingRow>
              ) : null
            }
          </form.Subscribe>
          <SettingRow settingId="reasoning-auto-collapse">
            <form.AppField name="reasoningAutoCollapse">{(field): ReactElement => <field.SwitchField label="Auto-collapse reasoning" />}</form.AppField>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
