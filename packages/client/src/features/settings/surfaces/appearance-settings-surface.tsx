import { useRef } from "react";
// The APPEARANCE settings surface (D44 §12.1 — the NON-color display surface; UI-Arch §13.4 form-
// factory panel). Renders inside the shell's settings modal (mounted by the ROUTE into
// `AppShellProps.modals`, never imported by app-shell — the domain-agnostic shell renders a ReactNode
// slot). Reads the synced `UserSettings.appearance` blob via `getUserSettings` (QueryBoundary +
// useSuspenseQuery — the message-list-surface canonical), and autosaves each change back through
// `updateUserSettingsSection("appearance")`. That mutation's `invalidates` refetches `getUserSettings`,
// so the OTHER consumers (chat's `useChatStyle`/`useMessageAppearance`, the shell's density stamp)
// re-render live — flipping chatStyle here flips the message rendering with no reload (the §12.1 payoff).
//
// SCOPE (NO DEAD TOGGLES — the surface's standing law + done-not-equal-rendered): a field is rendered
// ONLY when its knob is wired end-to-end to a LIVE consumer. Rendered here: chatStyle · density ·
// elevation (shell.css ramp) · autoFixMarkdown ·
// showInChatAvatars/avatarSize/avatarShape/avatarAspect/avatarRing (§B.3, `MessageRow` → `<Avatar>`
// prop chain) · chatWidthPct (the §11.1 --width-shell-content root var) · fontScale (the globals :root
// font-size floor) ·
// reducedMotion (the globals [data-reduced-motion] freeze) · (WS3) showTimestamps/showMessageId/
// showModelIcon/showTokenCount (`MessageMetadataRow`, message-metadata-row.tsx) · messageActions
// (`messageActionsRevealClass`, message-actions-row.tsx / greeting-actions-row.tsx) · blurSurfaces
// (root `data-blur-*`, useAppearanceRootEffects → globals.css/shell.css) · shadowEffects (root
// `data-shadow` → globals.css `--shadow-prose`) · Phase 4b: backgroundBlur (`ThemeBackgroundLayer`'s
// photo `filter:blur`) · readingLineHeight/readingLetterSpacing/readingParagraphSpacing/
// readingNameScale/readingBodyScale/justifyBodyText (root vars/attr → globals.css
// `[data-slot="message-bubble"]`/`[data-slot="message-attribution"]`) · enableThemeColorization (root
// `data-theme-colorization` → globals.css border retint) · blurStrength (root `--blur-strength`) ·
// showLLMReasoningIcon (`ReasoningBlock`, threaded via the ghost row). The schema stays COMPLETE (all
// knobs persist, round-tripped unchanged on every patch); `showGenerationTimer` gets NO control —
// FLAG[PD-130]: the underlying `gen_started_at`/`gen_finished_at` data is never populated by the turn
// engine (see message-metadata-row.tsx's header note) — a persisted-but-inert toggle would be a shim,
// so it stays schema-only until PD-130 lands real timing data.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { FieldLayout } from "@orb/ui/field";
import { Container, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { AppearanceEffectsSection } from "../components/appearance-effects-section";
import { AppearanceReadingSection } from "../components/appearance-reading-section";
import { APPEARANCE_ENTITY_ID, useAppearanceForm } from "../hooks/use-appearance-form";
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
import { APPEARANCE_SUBCATEGORY_IDS, settingsAnchorId } from "../lib/settings-nav";

// The section-patch mutation (module scope, §13.1). PD user-bus lane: `updateUserSettingsSection` emits
// `settingsChanged`, and `USER_BUS_FILTERS.settingsChanged` refetches `getUserSettings` — the live-flip
// mechanism for every appearance consumer, now driven by the always-on user bus (home-page.tsx) rather than
// a self-invalidate, so it is `busDriven` (an echo reconciles this device AND device B; a self-`invalidates`
// would double-refetch the same key). TVars.patch is the typed section; the router input is a generic
// `Record<string, unknown>`, hence the one boundary cast below.
interface UpdateAppearanceVars {
  readonly section: "appearance";
  readonly patch: Record<string, unknown>;
}
const useUpdateAppearance = createEntityMutation<UpdateAppearanceVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits `settingsChanged` → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your appearance settings.",
});

/** The DOM anchor id for one appearance subcategory `<Section>` (Task #15 search-to-anchor) — derived
 *  from the shared registry ids so a rename is a `tsc` error, never a stale anchor. */
const anchor = (sub: string): string => settingsAnchorId("appearance", sub);

/** The appearance panel body (rendered inside the settings modal's Dialog). */
export function AppearanceSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your appearance settings…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your appearance settings.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <FieldLayout orientation="horizontal">
          {/* The pane is its OWN container so the horizontal fields stack on a narrow pane (§4b axis 1)
              regardless of the modal chrome — the fixed control column can't starve the label. */}
          <Container>
            <AppearanceForm />
          </Container>
        </FieldLayout>
      </QueryBoundary>
    </Stack>
  );
}

/** Suspends on the synced settings read, then binds the autosave form to `appearance`. */
function AppearanceForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateAppearance({ trpc, invalidation });

  const save = (values: AppearanceSettings): Promise<unknown> =>
    // The patch is the full appearance section (unshown knobs round-trip unchanged). AppearanceSettings
    // has no index signature, so the widening to the router's `Record<string, unknown>` input is an
    // explicit boundary cast (the values are all JSON scalars/enums — safe by construction).
    update.mutateAsync({ section: "appearance", patch: values as Record<string, unknown> });

  const { form, mountKey } = useAppearanceForm({
    entityId: APPEARANCE_ENTITY_ID,
    serverValues: data.config.appearance,
    save,
  });

  return (
    <Stack key={mountKey} gap="section">
      {/* SINGLE COLUMN of SECTIONS (owner ruling — Discord grammar): sections stack top-to-bottom in
          EXACTLY the registry order, so nav order == pane order == reading order and an anchor-jump lands
          at the top of a section. Fields WITHIN a section may pair up (intra-section @container). The
          first section stays at the pane TOP so its heading shares a baseline with the nav's group label
          (owner item 3). */}
      <Stack gap="section">
        <Section
          divider={true}
          heading="Message style"
          id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageStyle)}
        >
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
            {(field): ReactElement => (
              <field.SelectField
                label="Density"
                description="Compact tightens spacing throughout the app."
                items={DENSITY_ITEMS}
              />
            )}
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
            {(field): ReactElement => (
              <field.SwitchField
                label="Show avatars in chat"
                description="Hide to show only the speaker's name on each message."
              />
            )}
          </form.AppField>
          <form.AppField name="avatarSize">
            {(field): ReactElement => (
              <field.SelectField label="Avatar size" items={AVATAR_SIZE_ITEMS} />
            )}
          </form.AppField>
          <form.AppField name="avatarShape">
            {(field): ReactElement => (
              <field.SelectField label="Avatar shape" items={AVATAR_SHAPE_ITEMS} />
            )}
          </form.AppField>
          <form.AppField name="avatarAspect">
            {(field): ReactElement => (
              <field.SelectField
                label="Avatar aspect"
                description="Portrait reserves a taller box — the immersive VN-style modes use it."
                items={AVATAR_ASPECT_ITEMS}
              />
            )}
          </form.AppField>
          <form.AppField name="avatarRing">
            {(field): ReactElement => (
              <field.SelectField label="Avatar ring" items={AVATAR_RING_ITEMS} />
            )}
          </form.AppField>
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
              <field.SwitchField
                label="Reduce motion"
                description="Freeze animations and transitions, beyond your system's own reduced-motion setting."
              />
            )}
          </form.AppField>
        </Section>

        <Section
          divider={true}
          heading="Message details"
          id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageDetails)}
        >
          <form.AppField name="showTimestamps">
            {(field): ReactElement => (
              <field.SwitchField
                label="Show timestamps"
                description="A time chip on every message."
              />
            )}
          </form.AppField>
          <form.AppField name="showMessageId">
            {(field): ReactElement => (
              <field.SwitchField
                label="Show message ID"
                description="The message's stable id, for scripting/reference."
              />
            )}
          </form.AppField>
          <form.AppField name="showModelIcon">
            {(field): ReactElement => (
              <field.SwitchField
                label="Show model"
                description="Which model generated the message, when known."
              />
            )}
          </form.AppField>
          <form.AppField name="showTokenCount">
            {(field): ReactElement => (
              <field.SwitchField
                label="Show token count"
                description="The message's token usage, when known."
              />
            )}
          </form.AppField>
          <form.AppField name="showLLMReasoningIcon">
            {(field): ReactElement => (
              <field.SwitchField
                label="Show reasoning icon"
                description="A small glyph on the reasoning disclosure, alongside its Thinking/Thought label."
              />
            )}
          </form.AppField>
        </Section>

        <Section
          divider={true}
          heading="Message actions"
          id={anchor(APPEARANCE_SUBCATEGORY_IDS.messageActions)}
        >
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

        <Section
          divider={true}
          heading="Background"
          id={anchor(APPEARANCE_SUBCATEGORY_IDS.background)}
        >
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
                  {kind === "seeded" ? (
                    <form.AppField name="backgroundSeededId">
                      {(field): ReactElement => (
                        <field.SelectField
                          label="Seeded image"
                          placeholder="Choose a background"
                          items={SEEDED_BACKGROUND_ITEMS}
                        />
                      )}
                    </form.AppField>
                  ) : (
                    <form.AppField name="backgroundExternalUrl">
                      {(field): ReactElement => (
                        <field.TextField
                          label="Image URL"
                          description="Loaded directly from the given host — your own client only (never shared to other viewers)."
                        />
                      )}
                    </form.AppField>
                  )}
                  <form.AppField name="backgroundFit">
                    {(field): ReactElement => (
                      <field.SelectField label="Fit" items={BACKGROUND_FIT_ITEMS} />
                    )}
                  </form.AppField>
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
                  {/* Phase 4b §B.5.1 — blurs the PHOTO only (the scrim above stays crisp). Meaningless
                      without an image, so it lives inside this same kind-gated block. */}
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
      {/* The autosave note as a muted footnote (UIP-404 — subtle, not a prominent element). */}
      <Text size="micro" tone="muted">
        Changes save automatically and sync across your devices.
      </Text>
    </Stack>
  );
}
