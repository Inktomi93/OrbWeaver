// The CONTEXT **Look** tab ({@link CharacterLookTab}) — this card's own APPEARANCE: the theme override (an
// autosave form persisting the whole `themeOverride` blob on change) plus its carried Background. An
// immediate-commit surface riding `character.update`: no save bar, no dirty pill.
//
// IT USED TO CARRY TRUST TOO, AND THAT RULING SURVIVES — ITS INPUT CHANGED (#841/#860, owner 2026-08-30).
// Trust and the theme editor shared a tab called "Options" because the strip was signed at THREE tabs and
// neither cluster could afford one alone. The context-panel program re-rules the strip as a six-slot meta
// rail (Overview · Chats · Links · Look · History · Trust), so the constraint that merged them is gone —
// and the merge's measured cost was not: `clientHeight 693 · scrollHeight 2253`, 31% visible, four
// concerns deep, with version history last. What is PRESERVED is the mechanism the merge established: both
// halves stay immediate-commit, both keep their own headings, and neither was re-implemented — the split is
// a re-home, exactly as the merge was. Trust's half now lives in `character-trust-tab.tsx`.
//
// This module is also where the two THEME DOORS live — both projections of the ONE card-embeddable
// partition (`cardEmbeddableSubset`), run in opposite directions:
//   • `Save as theme…` PROMOTES this card's authored look into the picker library (values COPIED, never
//     referenced — there is no ref to keep, and a deleted theme must never strip N cards).
//   • `Start from a theme…` seeds these fields FROM a picker theme (a one-time copy, no linkage).
// Neither door can move a viewer-sacred key: the card's own controls no longer spell one (the Message
// style + Density selects were struck as dead switches — nothing read what they wrote), and the subset
// projection is what keeps a theme's `density` from riding back in through the inverse door.

import type { Theme, ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import { cardEmbeddableSubset, THEME_FONT_ALLOWLIST, THEME_RADII } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, Icon } from "@orb/ui/icons";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { MessageBubble } from "@orb/ui/message-bubble";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { ThemePreviewPane, ThemeSwatchStrip } from "@orb/ui/theme-swatch";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { BackgroundSourceField, CORNER_RADIUS_NAME, DestructiveAction, FONT_FIELD_NAME, QueryBoundary, SettingRowGroup, SettingTrackRow } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { AutosaveStatus } from "#forms/editor";
import { notify, THEME_RADIUS_LABELS } from "#lib";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { CharacterThemeForm } from "../hooks/use-character-theme-form.ts";
import { usePromoteTheme } from "../hooks/use-promote-theme.ts";
import { CHARACTER_START_FROM_THEME_NAME } from "../lib/character-names.ts";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model.ts";
import {
  characterThemeFormFromOverride,
  EMPTY_CHARACTER_THEME_FORM,
  overrideFromCharacterThemeForm,
  THEME_INHERIT,
} from "../lib/character-theme-form-model.ts";

export interface CharacterAppearanceTabProps {
  readonly characterId: CharacterId;
}

// ONE WORD FOR ONE IDEA (side-eye 2026-08-03 P2). This 384px panel said "Inherit global" (the select item),
// "clear a colour" (the helper) and "Reset to global" (the button) for a single concept, and printed no
// value at all beside the swatches. The word is INHERIT, everywhere: the select item, every colour's own
// readout (`BoundColorField`), the helper sentence, and the cluster-wide verb below.
const INHERIT_ITEM = { value: THEME_INHERIT, label: "Inherit" } as const;
// `labelStyle` — each font option renders in its own typeface, derived from the value (#866 §7.8).
const FONT_ITEMS: SelectItems = [INHERIT_ITEM, ...THEME_FONT_ALLOWLIST.map((value) => ({ value, label: value, labelStyle: { fontFamily: value } }))];
const RADIUS_ITEMS: SelectItems = [INHERIT_ITEM, ...THEME_RADII.map((value) => ({ value, label: THEME_RADIUS_LABELS[value] }))];

const THEME_FIELD_NAMES = Object.keys(EMPTY_CHARACTER_THEME_FORM) as (keyof CharacterThemeFormValues)[];

/**
 * The CONTEXT **Look** tab — this card's own theme override + its carried background.
 *
 * Each colour and select cluster is a `SettingRowGroup`, the settings track every pane shares. Vertical
 * label-over-swatch turned eleven colour rows into a 54px-per-row ladder that exhausted the viewport before
 * Background was reachable; the track keeps label-left/control-right and stacks only below its container step.
 * (It rode `character-options-tab.tsx` until #841 folded that shell away with the merge it existed to hold.)
 */
export function CharacterLookTab({ characterId }: CharacterAppearanceTabProps): ReactElement {
  return (
    // RESERVED (#1098) — the Look tab settles into eleven colour rows plus the background field; a single
    // quiet line in their place resized the whole CONTEXT panel every time the card read landed.
    <QueryBoundary
      resetKeys={[characterId]}
      fallback={<SkeletonRows count={5} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="appearance" onRetry={retry} />}
      reserveKey="character.context.look"
    >
      <LookTabBody characterId={characterId} />
    </QueryBoundary>
  );
}

function LookTabBody({ characterId }: CharacterAppearanceTabProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  return (
    <Stack gap="section">
      <ThemeControls characterId={characterId} characterName={data.name} serverValue={data.themeOverride} />
      <BackgroundControl characterId={characterId} serverValue={data.backgroundOverride} />
    </Stack>
  );
}

interface BackgroundControlProps {
  readonly characterId: CharacterId;
  readonly serverValue: ThemeBackground | null;
}

/** The card's own carried BACKGROUND source (BG-C, the `ThemeControls` twin) — a discrete immediate-write
 *  control riding the SAME `character.update` verb, own field (never folded into `ThemeControls`' autosave
 *  session; the D78 boundary stays with that form alone). */
function BackgroundControl({ characterId, serverValue }: BackgroundControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });

  return (
    <Section heading="Background">
      <BackgroundSourceField
        onChange={(next): void => {
          update.mutate({ characterId, input: { backgroundOverride: next } });
        }}
        reserveKey="character.appearance.background"
        value={serverValue}
      />
      <Text voice="gloss">Applies instantly: no save needed. Takes over the app background in a true-solo chat, below any chat-set background.</Text>
    </Section>
  );
}

interface ThemeControlsProps {
  readonly characterId: CharacterId;
  /** The promote door's DEFAULT theme name — the server de-collides it at the mint. */
  readonly characterName: string;
  readonly serverValue: Parameters<typeof characterThemeFormFromOverride>[0];
}

/** The §8.1 control cluster — an autosave form whose every debounced change persists `themeOverride`.
 *  Mounted through the D78 session boundary (`CharacterThemeForm`), which OWNS the characterId key — a
 *  character switch remounts the form seeded from the new override, no manual `key` to place wrong. */
function ThemeControls({ characterId, characterName, serverValue }: ThemeControlsProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });

  const save = (values: CharacterThemeFormValues): Promise<unknown> =>
    update.mutateAsync({
      characterId,
      input: { themeOverride: overrideFromCharacterThemeForm(values) },
    });

  return (
    <CharacterThemeForm entityId={characterId} serverValues={characterThemeFormFromOverride(serverValue)} save={save}>
      {(session): ReactElement => <ThemeControlsBody characterName={characterName} session={session} />}
    </CharacterThemeForm>
  );
}

interface ThemeControlsBodyProps {
  readonly characterName: string;
  readonly session: AutosaveSession<CharacterThemeFormValues>;
}

/** The form-bearing theme controls — remounted per character by the boundary's keyed Session. */
function ThemeControlsBody({ characterName, session }: ThemeControlsBodyProps): ReactElement {
  const { form } = session;
  // Reset to global = clear each field to its empty (Inherit) value. The store-subscription driver
  // persists each setFieldValue (D78) — no call-site flush, no reseed (this is
  // a live field edit, not a re-baseline to a server row).
  const resetToGlobal = (): void => {
    for (const name of THEME_FIELD_NAMES) {
      form.setFieldValue(name, EMPTY_CHARACTER_THEME_FORM[name]);
    }
  };

  // The inverse door: a one-time COPY of the theme's card-embeddable values into these fields. Every field
  // the theme doesn't carry clears to its Inherit sentinel — "start FROM this theme" is a replacement, not
  // a merge — and the store-subscription driver persists each write like any other edit. No linkage is
  // kept: editing the theme later never touches this card, and editing this card never touches the theme.
  const startFromTheme = (theme: Theme): void => {
    const seeded = characterThemeFormFromOverride(cardEmbeddableSubset(theme.override));
    for (const name of THEME_FIELD_NAMES) {
      form.setFieldValue(name, seeded[name]);
    }
  };

  return (
    <Stack gap="block">
      {/* WRAPPING is load-bearing, not decoration: this cluster's real mount is the ~463px context panel
          (character-options-tab), where the label + the three actions overflow one line and the last one
          clips. Wrapping drops the action group to its own line there and keeps it inline in the wide
          editor. */}
      <Row gap="field" align="center" wrap={true} justify="between">
        <Row gap="field" align="center" wrap={true}>
          <Text voice="label">Theme</Text>
          <AutosaveStatus state={session.status} onRetry={session.retrySave} />
        </Row>
        <Row gap="field" align="center" wrap={true}>
          <StartFromThemeField onPick={startFromTheme} />
          {/* One subscription for both live-override readers: the promote payload IS the unsaved-latest
              blob (this cluster autosaves, so it is also what the card carries), and "nothing to promote"
              is the same emptiness "nothing to reset" already reads. */}
          <form.Subscribe selector={(state): ThemeOverride | null => overrideFromCharacterThemeForm(state.values)}>
            {(override): ReactElement => (
              <Row gap="field" align="center">
                <SaveAsThemeButton characterName={characterName} override={override} />
                <DestructiveAction
                  confirm={{
                    confirmLabel: "Reset all",
                    description: "Every colour and style this character sets goes back to Inherit, so it follows your global theme.",
                    title: "Reset this character's look to Inherit?",
                  }}
                  onConfirm={resetToGlobal}
                  trigger={
                    <Button variant="ghost" disabled={override === null}>
                      Reset all to Inherit
                    </Button>
                  }
                />
              </Row>
            )}
          </form.Subscribe>
        </Row>
      </Row>
      <Text voice="gloss">
        {/* The copy follows the READOUT (#841): a field's value text is `Inherit`, its hex, or `Custom` —
            never the raw `oklch(…)` triple it used to print. The promise this line makes is unchanged
            (you can tell set from inherited at a glance); what changed is that it is now legible. */}
        Colours and styles apply to this character's messages instantly. No save needed. A field reading Inherit follows your global theme; every other field
        names its own value, so you can always tell which ones this card sets.
      </Text>

      <Grid cols="wide" gap="gutter">
        <Section heading="Surface">
          <SettingRowGroup>
            <SettingTrackRow>
              <form.AppField name="background">{(field): ReactElement => <field.ColorField label="Background" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="accent">{(field): ReactElement => <field.ColorField label="Accent" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="borderColor">{(field): ReactElement => <field.ColorField label="Border" />}</form.AppField>
            </SettingTrackRow>
          </SettingRowGroup>
        </Section>

        <Section heading="Message text">
          <SettingRowGroup>
            <SettingTrackRow>
              <form.AppField name="speaker">{(field): ReactElement => <field.ColorField label="Speaker name" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="dialogueColor">{(field): ReactElement => <field.ColorField label="Dialogue" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="narrationColor">{(field): ReactElement => <field.ColorField label="Narration" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="bodyColor">{(field): ReactElement => <field.ColorField label="Body" />}</form.AppField>
            </SettingTrackRow>
          </SettingRowGroup>
        </Section>

        <Section heading="Bubbles">
          <SettingRowGroup>
            <SettingTrackRow>
              <form.AppField name="userBubbleBg">{(field): ReactElement => <field.ColorField label="Your bubble" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="userBubbleFg">{(field): ReactElement => <field.ColorField label="Your text" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="aiBubbleBg">{(field): ReactElement => <field.ColorField label="Character bubble" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="aiBubbleFg">{(field): ReactElement => <field.ColorField label="Character text" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="systemBubbleBg">{(field): ReactElement => <field.ColorField label="System bubble" />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="systemBubbleFg">{(field): ReactElement => <field.ColorField label="System text" />}</form.AppField>
            </SettingTrackRow>
          </SettingRowGroup>
        </Section>

        <Section heading="Type & shape">
          <SettingRowGroup>
            <SettingTrackRow>
              <form.AppField name="font">{(field): ReactElement => <field.SelectField label={FONT_FIELD_NAME} items={FONT_ITEMS} />}</form.AppField>
            </SettingTrackRow>
            <SettingTrackRow>
              <form.AppField name="radius">{(field): ReactElement => <field.SelectField label={CORNER_RADIUS_NAME} items={RADIUS_ITEMS} />}</form.AppField>
            </SettingTrackRow>
          </SettingRowGroup>
        </Section>
      </Grid>

      <Section heading="Preview">
        <form.Subscribe selector={(state): CharacterThemeFormValues => state.values}>
          {(values): ReactElement => <ThemePreview override={overrideFromCharacterThemeForm(values)} />}
        </form.Subscribe>
      </Section>
    </Stack>
  );
}

/** Door 1 — PROMOTE: mint a picker theme from this card's live look. Values are COPIED: the card's
 *  override IS values, and the roster wire threads those values to members who cannot read the host's
 *  `themes` rows at all. The name defaults to the character's and the server de-collides it numerically,
 *  so this door never has to interrupt with a naming dialog; the toast names the row that actually landed.
 *  Selecting the new theme is deliberately NOT done here — selecting is the picker's one applying act. */
function SaveAsThemeButton({ characterName, override }: { readonly characterName: string; readonly override: ThemeOverride | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const promote = usePromoteTheme({ trpc, invalidation });

  return (
    <Button
      variant="ghost"
      disabled={override === null || promote.isPending}
      onClick={(): void => {
        if (override === null) {
          return;
        }
        promote.mutate(
          { name: characterName, override },
          {
            onSuccess: (theme): void => {
              notify.success(`Saved “${theme.name}” to your themes.`);
            },
          },
        );
      }}
    >
      Save as theme…
    </Button>
  );
}

/** Door 2 — the INVERSE: seed this card from a picker theme. A plain read (never suspending — the theme
 *  cluster must render even while the theme library read is slow or failing) whose value never sticks: the
 *  control is an ACTION, so each pick re-seeds the form and the trigger keeps its label. REBUILT on the
 *  Looks grammar (#866 S4, owner addendum #3 — a theme is SEEN, so a name-only Select was the
 *  seen-not-read shoehorn): each row is the shared swatch STRIPE + the name, the SAME derivation the
 *  Looks cards paint with. Selecting SEEDS the override form — never applies a theme (line ~262's
 *  "selecting is the picker's one applying act" contract holds exactly: this door applies nothing).
 *
 *  THE STRIPE STAYS; `ThemeMiniSurface` IS NOT REUSED HERE, AND THAT IS RULED (#1152, 2026-09-05 —
 *  #920 asked for the reuse, this is the answer, do not re-open it). The reason is payload honesty, not
 *  the sideways-import fence that merely made it awkward. `startFromTheme` below delivers
 *  `cardEmbeddableSubset(theme.override)`, and `ThemeSwatchStrip` paints `theme.override` through the same
 *  `<ThemeScope>` clamp — the picture IS the payload, `density` aside, which the stripe does not show. The
 *  Looks thumbnail answers a different question ("what would selecting this theme paint the app"), and for
 *  the three SEED rows that answer is deliberately NOT the override: `#lib`'s `resolveThemeScopeTokens`
 *  hands a seed NOTHING and lets its generated `[data-theme]` block paint, because replaying a seed's
 *  duplicate-to-customize override through the clamp re-derives the palette and shadows the hand-tuned
 *  block. So the thumbnail on THIS door would disagree with what the pick delivers on exactly
 *  Hearth/Mocha/Light. */
function StartFromThemeField({ onPick }: { readonly onPick: (theme: Theme) => void }): ReactElement {
  const trpc = useTRPC();
  const { data: themes } = useQuery(trpc.settings.listThemes.queryOptions());
  const rows = themes ?? [];

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button disabled={rows.length === 0} variant="outline" size="sm">
            {CHARACTER_START_FROM_THEME_NAME}
            <Icon icon={ChevronDown} size="xs" />
          </Button>
        }
      />
      <MenuPopup>
        {rows.map((theme) => (
          <MenuItem key={theme.id} onClick={(): void => onPick(theme)}>
            <Row align="center" gap="field" className="min-inline-0">
              <ThemeSwatchStrip tokens={theme.override} />
              <Text ink="inherit" as="span" truncate={true}>
                {theme.name}
              </Text>
            </Row>
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/** Nesting under the parent global `<ThemeScope>` resolves character over global over default. */
function ThemePreview({ override }: { readonly override: ReturnType<typeof overrideFromCharacterThemeForm> }): ReactElement {
  return (
    <ThemeScope tokens={override ?? {}}>
      <ThemePreviewPane fill="background">
        <Stack gap="row">
          <Text voice="label" ink="speaker">
            Aria
          </Text>
          <MessageBubble messageRole="assistant">
            <Stack gap="field">
              <Text as="span" ink="dialogue">
                “Welcome to the archive,” she said.
              </Text>{" "}
              <Text as="span" ink="narration">
                The lamplight flickered against the shelves.
              </Text>
            </Stack>
          </MessageBubble>
        </Stack>
      </ThemePreviewPane>
    </ThemeScope>
  );
}
