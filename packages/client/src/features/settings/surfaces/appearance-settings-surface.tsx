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
// `data-shadow` → globals.css `--shadow-prose`). The schema stays COMPLETE (all knobs persist,
// round-tripped unchanged on every patch); `showGenerationTimer` gets NO control — FLAG[PD-130]: the
// underlying `gen_started_at`/`gen_finished_at` data is never populated by the turn engine (see
// message-metadata-row.tsx's header note) — a persisted-but-inert toggle would be a shim, so it stays
// schema-only until PD-130 lands real timing data.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_BLUR_SURFACES } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { Grid, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, useInvalidation, useTRPC } from "#data";
import { APPEARANCE_ENTITY_ID, useAppearanceForm } from "../hooks/use-appearance-form";
import {
  AVATAR_ASPECT_ITEMS,
  AVATAR_RING_ITEMS,
  AVATAR_SHAPE_ITEMS,
  AVATAR_SIZE_ITEMS,
  BACKGROUND_FIT_ITEMS,
  BACKGROUND_KIND_ITEMS,
  BLUR_SURFACE_ITEMS,
  CHAT_STYLE_ITEMS,
  DENSITY_ITEMS,
  ELEVATION_ITEMS,
  MESSAGE_ACTIONS_ITEMS,
  SEEDED_BACKGROUND_ITEMS,
} from "../lib/appearance-select-items";

// Sizing bounds (mirror the contracts schema — kept local for the field min/max/step; the schema is the
// hard clamp, these are just the input affordances).
const BACKGROUND_DIM_MIN = 0;
const BACKGROUND_DIM_MAX = 1;
const BACKGROUND_DIM_STEP = 0.05;
const CHAT_WIDTH_MIN = 30;
const CHAT_WIDTH_MAX = 100;
const FONT_SCALE_MIN = 0.8;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.05;

// The section-patch mutation (module scope, §13.1). `invalidates` refetches getUserSettings through the
// central seam — the live-flip mechanism for every other appearance consumer. TVars.patch is the typed
// section; the router input is a generic `Record<string, unknown>`, hence the one boundary cast below.
interface UpdateAppearanceVars {
  readonly section: "appearance";
  readonly patch: Record<string, unknown>;
}
const useUpdateAppearance = createEntityMutation<UpdateAppearanceVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't save your appearance settings.",
});

/** The appearance panel body (rendered inside the settings modal's Dialog). */
export function AppearanceSettingsSurface(): ReactElement {
  return (
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
      <AppearanceForm />
    </QueryBoundary>
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
      {/* Grid: the sections tile into as many columns as fit and reflow — the pane FILLS the wide
          settings modal and new sections just flow in, no fixed layout to maintain. */}
      <Grid cols="wide" gap="gutter">
        <Section heading="Message style">
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

        <Section heading="Avatars">
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

        <Section heading="Sizing">
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

        <Section heading="Motion">
          <form.AppField name="reducedMotion">
            {(field): ReactElement => (
              <field.SwitchField
                label="Reduce motion"
                description="Freeze animations and transitions, beyond your system's own reduced-motion setting."
              />
            )}
          </form.AppField>
        </Section>

        <Section heading="Message details">
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
        </Section>

        <Section heading="Message actions">
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

        <Section heading="Background">
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
                </>
              );
            }}
          </form.Subscribe>
        </Section>

        <Section heading="Effects">
          <form.AppField name="blurSurfaces">
            {(field): ReactElement => (
              <Stack gap="field">
                <field.MultiToggleField
                  label="Frosted glass"
                  description="Backdrop blur + a translucent fill on the chosen surfaces. Off by default; messages carry glass poorly (scrolling prose over blur) so it's never pre-checked."
                  items={BLUR_SURFACE_ITEMS}
                />
                {field.state.value.length === 0 ? (
                  <Button
                    intent="ghost"
                    size="sm"
                    onClick={(): void => field.handleChange([...DEFAULT_BLUR_SURFACES])}
                  >
                    Enable (panels + composer + dialogs)
                  </Button>
                ) : null}
              </Stack>
            )}
          </form.AppField>
          <form.AppField name="shadowEffects">
            {(field): ReactElement => (
              <field.SwitchField
                label="Prose shadow"
                description="A subtle readability halo on message text."
              />
            )}
          </form.AppField>
        </Section>
      </Grid>
      <Text size="micro" tone="muted" transform="caps">
        Changes save automatically and sync across your devices.
      </Text>
    </Stack>
  );
}
