// The "Sizing & motion" appearance SECTION (SET-SEAMS stage 1) — chatWidthPct / fontScale / density /
// elevation / reducedMotion. A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by
// features/app-shell, the feature that READS all five (`surfaces/app-shell.tsx`: the shell scope tokens, the
// `--width-shell-content` clamp, `data-elevation`, and `data-reduced-motion` via `useAppearanceRootEffects`
// onto <html>). §6's rule is reader-owns, and
// app-shell is already a definition owner (chrome + the You modal), so this is not a new privilege.
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim, so this section's debounced save can never carry a sibling
// appearance section's key (SET-SEAMS §2). Homed in components/ — a FRAGMENT inside the appearance pane,
// which owns containment + focus.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { FieldLayout } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, SettingRow } from "#components";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { DENSITY_ITEMS } from "#lib";
import { configAnchorId } from "#state";
import { CHAT_WIDTH_MAX, CHAT_WIDTH_MIN, FONT_SCALE_MAX, FONT_SCALE_MIN, FONT_SCALE_STEP } from "../lib/appearance-bounds.ts";
import { APPEARANCE_SIZING_KEYS, APPEARANCE_SIZING_SUBCATEGORY } from "../lib/appearance-sizing-model.ts";
import { ElevationCards } from "./appearance-elevation-cards.tsx";

type SizingForm = Pick<AppearanceSettings, (typeof APPEARANCE_SIZING_KEYS)[number]>;

interface UpdateSizingVars {
  readonly section: "appearance";
  readonly patch: SizingForm;
}
const useUpdateSizing = createEntityMutation<UpdateSizingVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your sizing settings.",
});

const SizingAutosaveForm = createAutosaveEntityForm<SizingForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_SIZING_KEYS),
});

const SIZING_ENTITY_ID = "appearance-sizing";

/** The Sizing & motion section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceSizingSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your sizing settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your sizing settings" onRetry={retry} />}
    >
      <SizingFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function SizingFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateSizing({ trpc, invalidation });

  const save = (values: SizingForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <SizingAutosaveForm entityId={SIZING_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_SIZING_KEYS)} save={save}>
      {(session): ReactElement => <SizingBody sectionId={sectionId} session={session} />}
    </SizingAutosaveForm>
  );
}

/** The density LIVE mini-preview (#866 §7.8): three mock rows inside a box carrying `data-density` off
 *  the DRAFT value — tiers.css's symmetric density map re-scopes the spacing tokens for this subtree
 *  exactly as it does for the shell carrier, so the gaps/padding here ARE the definition, never a copy.
 *  Ornament (`aria-hidden`): the segment above is the control; this is what the pick looks like. */
function DensityPreview({ draft }: { readonly draft: SizingForm["density"] }): ReactElement {
  return (
    <Stack
      aria-hidden={true}
      // `transition-all` was catching inherited non-compositor properties (`scrollbarColor` —
      // the app's `[anim]` flagger convicted this preview OVER BUDGET on every density pick). The
      // preview only ever animates the density-tier spacing tokens (`gap`/`padding`, tiers.css) —
      // naming them keeps the tier-change motion and drops everything `all` swept in by accident.
      className="rounded-control border border-border p-block transition-[gap,padding] duration-(--motion-fast) ease-out-expo"
      data-density={draft}
      data-slot="density-preview"
      gap="row"
    >
      {["The first row", "A second row", "And a third"].map((line) => (
        <Row key={line} align="center" className="rounded-control bg-accent p-field" gap="field">
          <Text as="span" voice="gloss">
            {line}
          </Text>
        </Row>
      ))}
    </Stack>
  );
}

function SizingBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<SizingForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_SIZING_SUBCATEGORY.label}
      id={configAnchorId("appearance", APPEARANCE_SIZING_SUBCATEGORY.id)}
    >
      {/* THE TEACHER LAW (#866 S3, config-revamp-design.md §7.2): a row is label + control — the per-row
          prose re-homed into each leaf's `teach` (the context pane renders it for the focused row). The
          scope is the SAME nav const the contribution registers, so a row can never publish an address its
          section does not own. */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_SIZING_SUBCATEGORY }}>
        <FieldLayout orientation="horizontal">
          <SettingRow settingId="chat-width">
            <form.AppField name="chatWidthPct">
              {(field): ReactElement => <field.SliderField label="Chat width (%)" min={CHAT_WIDTH_MIN} max={CHAT_WIDTH_MAX} />}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="font-scale">
            <form.AppField name="fontScale">
              {(field): ReactElement => <field.SliderField label="Text size" min={FONT_SCALE_MIN} max={FONT_SCALE_MAX} step={FONT_SCALE_STEP} />}
            </form.AppField>
          </SettingRow>
          {/* SEEN, NOT READ (#866 §7.8, owner-acked): density/elevation OUTCOMES are spatial, so the
              Selects became labelled SEGMENTS — every option visible at rest — and density carries the
              LIVE mini-preview reading the DRAFT value. The preview derives everything: its box wears
              `data-density`, and tiers.css's symmetric map re-scopes the four spacing tokens (one
              definition, two consumers — never a mirrored number). */}
          <SettingRow settingId="density">
            <Stack className="min-w-0" gap="field">
              <form.AppField name="density">{(field): ReactElement => <field.SegmentField label="Density" items={DENSITY_ITEMS} />}</form.AppField>
              <form.Subscribe selector={(state): SizingForm["density"] => state.values.density}>
                {(draft): ReactElement => <DensityPreview draft={draft} />}
              </form.Subscribe>
            </Stack>
          </SettingRow>
          {/* Elevation gets ILLUSTRATED CARDS, not a preview (#866 §7.8 owner ruling — the
              preview-vs-illustration distinction): its meaning is the ABSENCE of seams across the shell,
              which no nested box can preview honestly; the diagram depicts the difference between the
              options with every colour/hairline/shadow DERIVED from the shell's own tokens. */}
          <SettingRow settingId="elevation">
            <Stack className="min-w-0" gap="field">
              <Text as="span" voice="label">
                Surface elevation
              </Text>
              <form.AppField name="elevation">
                {(field): ReactElement => <ElevationCards onPick={field.handleChange} value={field.state.value} />}
              </form.AppField>
            </Stack>
          </SettingRow>
          <SettingRow settingId="reduced-motion">
            <form.AppField name="reducedMotion">{(field): ReactElement => <field.SwitchField label="Reduce motion" />}</form.AppField>
          </SettingRow>
        </FieldLayout>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}
