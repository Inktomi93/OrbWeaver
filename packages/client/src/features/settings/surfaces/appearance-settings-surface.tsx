import { useRef } from "react";
// The Appearance settings surface. Reads the synced UserSettings.appearance blob and autosaves each
// change back through updateUserSettingsSection("appearance"), which refetches getUserSettings so other
// consumers re-render live. A field is rendered only when its knob is wired end-to-end to a live
// consumer — including PD-130's showGenerationTimer, now that the turn engine writes the gen-window
// bounds and the read seam surfaces them on MessageView.

import type { AppearanceSettings } from "@orb/contracts/settings";
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
import { AppearanceEffectsSection } from "../components/appearance-effects-section";
import { AppearanceReadingSection } from "../components/appearance-reading-section";
import { BackgroundUploadField } from "../components/background-upload-field";
import { APPEARANCE_ENTITY_ID, AppearanceForm } from "../hooks/use-appearance-form";
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_BLUR_MIN,
  BACKGROUND_DIM_MAX,
  BACKGROUND_DIM_MIN,
  BACKGROUND_DIM_STEP,
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
} from "../lib/appearance-bounds";
import { APPEARANCE_SUBCATEGORY_IDS } from "../lib/appearance-nav";
import {
  AVATAR_ASPECT_ITEMS,
  AVATAR_RING_ITEMS,
  AVATAR_SHAPE_ITEMS,
  AVATAR_SIZE_ITEMS,
  BACKGROUND_FIT_ITEMS,
  BACKGROUND_KIND_ITEMS,
  CHAT_STYLE_ITEMS,
  DENSITY_ITEMS,
  ELEVATION_ITEMS,
  MESSAGE_ACTIONS_ITEMS,
  SEEDED_BACKGROUND_ITEMS,
} from "../lib/appearance-select-items";

interface UpdateAppearanceVars {
  readonly section: "appearance";
  readonly patch: Record<string, unknown>;
}
const useUpdateAppearance = createEntityMutation<UpdateAppearanceVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your appearance settings.",
});

/** The DOM anchor id for one appearance subcategory `<Section>`, derived from the shared registry ids. */
const anchor = (sub: string): string => settingsAnchorId("appearance", sub);

/** The appearance panel body (rendered inside the settings modal's Dialog). */
export function AppearanceSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your appearance settings…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your appearance settings" onRetry={retry} />}
      >
        <FieldLayout orientation="horizontal">
          <Container>
            <AppearanceSettingsForm />
          </Container>
        </FieldLayout>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the synced settings read, then binds the autosave form to `appearance` through the D78
 *  session boundary — the boundary owns the (constant) entity key, so no manual `key` to place wrong. */
function AppearanceSettingsForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateAppearance({ trpc, invalidation });

  const save = (values: AppearanceSettings): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values as Record<string, unknown> });

  return (
    <AppearanceForm entityId={APPEARANCE_ENTITY_ID} serverValues={data.config.appearance} save={save}>
      {(session): ReactElement => <AppearanceFormBody session={session} />}
    </AppearanceForm>
  );
}

/** The form-bearing appearance body — remounted per epoch by the boundary's keyed Session. */
function AppearanceFormBody({ session }: { readonly session: AutosaveSession<AppearanceSettings> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Stack gap="section">
      <Stack gap="section">
        <Section divider={true} heading="Message style" id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageStyle)}>
          <form.AppField name="chatStyle">
            {(field): ReactElement => (
              <field.SelectField
                label="Chat display"
                description="Bubble tints each message; flat is full-width; document is a centered manuscript column. Echo, Whisper, Hush, Ripple and Tide are immersive modes — bled portraits, VN sticky art, accent stripes and message trains."
                items={CHAT_STYLE_ITEMS}
              />
            )}
          </form.AppField>
          <form.AppField name="density">
            {(field): ReactElement => <field.SelectField label="Density" description="Compact tightens spacing throughout the app." items={DENSITY_ITEMS} />}
          </form.AppField>
          <form.AppField name="elevation">
            {(field): ReactElement => (
              <field.SelectField
                label="Surface elevation"
                description="Layered lifts the panels and content into a brightness ladder and drops the region borders; flat keeps one tone."
                items={ELEVATION_ITEMS}
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
        </Section>

        <Section divider={true} heading="Avatars" id={anchor(APPEARANCE_SUBCATEGORY_IDS.avatars)}>
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
        </Section>

        <Section divider={true} heading="Sizing" id={anchor(APPEARANCE_SUBCATEGORY_IDS.sizing)}>
          <form.AppField name="chatWidthPct">
            {(field): ReactElement => (
              <field.SliderField
                label="Chat width (%)"
                description="How wide the reading column may grow on large screens."
                min={CHAT_WIDTH_MIN}
                max={CHAT_WIDTH_MAX}
              />
            )}
          </form.AppField>
          <form.AppField name="fontScale">
            {(field): ReactElement => (
              <field.SliderField
                label="Text size"
                description="A global multiplier for all text (1 = default)."
                min={FONT_SCALE_MIN}
                max={FONT_SCALE_MAX}
                step={FONT_SCALE_STEP}
              />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Motion" id={anchor(APPEARANCE_SUBCATEGORY_IDS.motion)}>
          <form.AppField name="reducedMotion">
            {(field): ReactElement => (
              <field.SwitchField label="Reduce motion" description="Freeze animations and transitions, beyond your system's own reduced-motion setting." />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Message details" id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageDetails)}>
          <form.AppField name="showTimestamps">
            {(field): ReactElement => <field.SwitchField label="Show timestamps" description="A time chip on every message." />}
          </form.AppField>
          <form.AppField name="showMessageId">
            {(field): ReactElement => <field.SwitchField label="Show message ID" description="The message's stable id, for scripting/reference." />}
          </form.AppField>
          <form.AppField name="showModelIcon">
            {(field): ReactElement => <field.SwitchField label="Show model" description="Which model generated the message, when known." />}
          </form.AppField>
          <form.AppField name="showTokenCount">
            {(field): ReactElement => <field.SwitchField label="Show token count" description="The message's token usage, when known." />}
          </form.AppField>
          <form.AppField name="showGenerationTimer">
            {(field): ReactElement => (
              <field.SwitchField label="Show generation time" description="How long the model took to generate the message, when known." />
            )}
          </form.AppField>
          <form.AppField name="showGenerationCost">
            {(field): ReactElement => (
              <field.SwitchField label="Show generation cost" description="A click-to-reveal per-message cost, settled on demand against OpenRouter." />
            )}
          </form.AppField>
          <form.AppField name="showLLMReasoningIcon">
            {(field): ReactElement => (
              <field.SwitchField label="Show reasoning icon" description="A small glyph on the reasoning disclosure, alongside its Thinking/Thought label." />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Message actions" id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageActions)}>
          <form.AppField name="messageActions">
            {(field): ReactElement => (
              <field.SelectField
                label="Action cluster"
                description="Edit/hide/fork/delete/copy, shown on hover (default) or always."
                items={MESSAGE_ACTIONS_ITEMS}
              />
            )}
          </form.AppField>
        </Section>

        <Section divider={true} heading="Background" id={anchor(APPEARANCE_SUBCATEGORY_IDS.background)}>
          <form.AppField name="backgroundImageKind">
            {(field): ReactElement => (
              <field.SelectField
                label="Image"
                description="A decorative photo behind the app, with a scrim so text stays readable. Pairs with Frosted glass below."
                items={BACKGROUND_KIND_ITEMS}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state): string => state.values.backgroundImageKind}>
            {(kind): ReactElement | null => {
              if (kind === "none") {
                return null;
              }
              return (
                <>
                  {kind === "seeded" && (
                    <form.AppField name="backgroundSeededId">
                      {(field): ReactElement => <field.SelectField label="Seeded image" placeholder="Choose a background" items={SEEDED_BACKGROUND_ITEMS} />}
                    </form.AppField>
                  )}
                  {kind === "external" && (
                    <form.AppField name="backgroundExternalUrl">
                      {(field): ReactElement => (
                        <field.TextField
                          label="Image URL"
                          description="Loaded directly from the given host — your own client only (never shared to other viewers)."
                        />
                      )}
                    </form.AppField>
                  )}
                  {kind === "asset" && (
                    <form.Subscribe selector={(state): string => state.values.backgroundAssetHash}>
                      {(hash): ReactElement => (
                        <BackgroundUploadField
                          currentHash={hash}
                          onUploaded={(stored): void => {
                            form.setFieldValue("backgroundAssetId", stored.assetId);
                            form.setFieldValue("backgroundAssetHash", stored.hash);
                          }}
                        />
                      )}
                    </form.Subscribe>
                  )}
                  <form.AppField name="backgroundFit">{(field): ReactElement => <field.SelectField label="Fit" items={BACKGROUND_FIT_ITEMS} />}</form.AppField>
                  <form.AppField name="backgroundDim">
                    {(field): ReactElement => (
                      <field.SliderField
                        label="Scrim opacity"
                        description="Darkens the image so text stays legible — never fully off."
                        min={BACKGROUND_DIM_MIN}
                        max={BACKGROUND_DIM_MAX}
                        step={BACKGROUND_DIM_STEP}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="backgroundBlur">
                    {(field): ReactElement => (
                      <field.SliderField
                        label="Image blur"
                        description="Softens the photo itself (the darkening scrim above stays sharp)."
                        min={BACKGROUND_BLUR_MIN}
                        max={BACKGROUND_BLUR_MAX}
                      />
                    )}
                  </form.AppField>
                </>
              );
            }}
          </form.Subscribe>
        </Section>

        <AppearanceReadingSection form={form} />

        <AppearanceEffectsSection form={form} />
      </Stack>
      <Row gap="field" align="center">
        <AutosaveStatus state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Row>
    </Stack>
  );
}
