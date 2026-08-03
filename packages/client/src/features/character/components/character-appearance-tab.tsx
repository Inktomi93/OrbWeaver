// The Appearance tab — two immediate-commit clusters riding `character.update` (no save bar, no dirty
// pill): the per-character theme override (an autosave form persisting the whole `themeOverride` blob on
// change) and Trust (`forbidExternalMedia`/`trustHtml`, tri-state). `trustHtml` resolves `override ??
// global`; `forbidExternalMedia` is TIGHTEN-ONLY over the deployment ceiling, so while the deployment
// blocks external media the control renders locked (see the Trust section below).
//
// The Theme cluster is also where the two THEME DOORS live — both projections of the ONE card-embeddable
// partition (`cardEmbeddableSubset`), run in opposite directions:
//   • `Save as theme…` PROMOTES this card's authored look into the picker library (values COPIED, never
//     referenced — there is no ref to keep, and a deleted theme must never strip N cards).
//   • `Start from a theme…` seeds these fields FROM a picker theme (a one-time copy, no linkage).
// Neither door can move a viewer-sacred key: the card's own controls no longer spell one (the Message
// style + Density selects were struck as dead switches — nothing read what they wrote), and the subset
// projection is what keeps a theme's `density` from riding back in through the inverse door.

import type { Theme, ThemeBackground, ThemeOverride, ThemeRadius } from "@orb/contracts/theme";
import { cardEmbeddableSubset, THEME_FONT_ALLOWLIST, THEME_RADII } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { BackgroundSourceField } from "#components";
import { QueryBoundary, QueryErrorState, useExternalMediaBlocked, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { notify } from "#lib";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { CharacterThemeForm } from "../hooks/use-character-theme-form";
import { usePromoteTheme } from "../hooks/use-promote-theme";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model";
import { characterThemeFormFromOverride, EMPTY_CHARACTER_THEME_FORM, overrideFromCharacterThemeForm, THEME_INHERIT } from "../lib/character-theme-form-model";

export interface CharacterAppearanceTabProps {
  readonly characterId: CharacterId;
}

const INHERIT_ITEM = { value: THEME_INHERIT, label: "Inherit global" } as const;
const RADIUS_LABELS: Record<ThemeRadius, string> = {
  base: "Base",
  control: "Tight",
  card: "Card",
  full: "Round",
};
const FONT_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_FONT_ALLOWLIST.map((value) => ({ value, label: value }))];
const RADIUS_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_RADII.map((value) => ({ value, label: RADIUS_LABELS[value] }))];

const THEME_FIELD_NAMES = Object.keys(EMPTY_CHARACTER_THEME_FORM) as (keyof CharacterThemeFormValues)[];

/** inherit / on / off ⇄ null / true / false (the tri-state wire encoding, shared by both Trust controls). */
function tristateValue(flag: boolean | null): string {
  if (flag === null) {
    return "inherit";
  }
  return flag ? "on" : "off";
}

function tristateFlag(value: string): boolean | null {
  if (value === "inherit") {
    return null;
  }
  return value === "on";
}

export function CharacterAppearanceTab({ characterId }: CharacterAppearanceTabProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading appearance…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="appearance" onRetry={retry} />}
    >
      <AppearanceTabBody characterId={characterId} />
    </QueryBoundary>
  );
}

function AppearanceTabBody({ characterId }: CharacterAppearanceTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));
  const update = useUpdateCharacter({ trpc, invalidation });
  // The deployment ceiling (`/api/auth/config.forbidExternalMedia`) — the value the document CSP was built
  // from. While it is on, EVERY value of this control resolves to blocked, so the control is inert: render
  // it disabled + explained rather than as a dead switch (D107).
  const externalMediaBlocked = useExternalMediaBlocked();
  const externalMediaLockId = useId();

  const commit = (input: { forbidExternalMedia?: boolean | null; trustHtml?: boolean | null }): void => {
    update.mutate({ characterId, input });
  };

  return (
    <Stack gap="section">
      <ThemeControls characterId={characterId} characterName={data.name} serverValue={data.themeOverride} />

      <BackgroundControl characterId={characterId} serverValue={data.backgroundOverride} />

      {/* The external-media row can only TIGHTEN: the deployment-wide setting is the ABSOLUTE ceiling —
          enforced twice, by the tighten-only render-policy resolver (@orb/contracts/chat) and by the page's
          Content-Security-Policy — and no per-character value can widen it. While the deployment blocks,
          the control is LOCKED rather than offering an "Allow" that nothing honours. */}
      <Section
        heading="Trust"
        hint="External media is capped by the deployment-wide “Block external media” setting — “Allow” here cannot load external media while that is on. Changes reach an open tab on reload."
      >
        <Row gap="field" className="flex-wrap">
          {/* No control-has-associated-label suppression here (unlike its sibling): the conditional
              aria-describedby SPREAD makes the rule bail on this element, so a directive would be an
              unused-disable error. The `label` prop still renders the visible, associated label. */}
          <Select
            label="External media"
            items={[
              { value: "inherit", label: "Inherit default" },
              { value: "off", label: "Allow" },
              { value: "on", label: "Forbid" },
            ]}
            value={tristateValue(data.forbidExternalMedia)}
            onValueChange={(value): void => commit({ forbidExternalMedia: tristateFlag(String(value)) })}
            disabled={externalMediaBlocked}
            {...(externalMediaBlocked ? { "aria-describedby": externalMediaLockId } : {})}
          />
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the Select's `label` prop renders the visible, associated label (the rule can't see a custom prop); the bound SelectField carries the same suppression. */}
          <Select
            label="HTML rendering"
            items={[
              { value: "inherit", label: "Inherit default" },
              { value: "on", label: "Trusted" },
              { value: "off", label: "Untrusted" },
            ]}
            value={tristateValue(data.trustHtml)}
            onValueChange={(value): void => commit({ trustHtml: tristateFlag(String(value)) })}
          />
        </Row>
        {externalMediaBlocked ? (
          <Text id={externalMediaLockId} size="micro" tone="muted">
            External media is blocked deployment-wide, so this character's setting is locked — every value here resolves to blocked. An admin can lift it in
            System settings → “Block external media”.
          </Text>
        ) : null}
        <Text size="micro" tone="muted">
          Trust settings apply the instant you change them — no save needed.
        </Text>
      </Section>
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
        value={serverValue}
      />
      <Text size="micro" tone="muted">
        Applies instantly — no save needed. Takes over the app background in a true-solo chat, below any chat-set background.
      </Text>
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
      {(session): ReactElement => <ThemeControlsBody characterName={characterName} form={session.form} />}
    </CharacterThemeForm>
  );
}

interface ThemeControlsBodyProps {
  readonly characterName: string;
  readonly form: AutosaveSession<CharacterThemeFormValues>["form"];
}

/** The form-bearing theme controls — remounted per character by the boundary's keyed Session. */
function ThemeControlsBody({ characterName, form }: ThemeControlsBodyProps): ReactElement {
  // Reset to global = clear each field to its empty (Inherit) value. The store-subscription driver
  // persists each setFieldValue (autosave-form-doctrine.md §3) — no call-site flush, no reseed (this is
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
      <Row gap="field" align="center" className="flex-wrap justify-between">
        <Text size="label" weight="medium">
          Theme
        </Text>
        <Row gap="field" align="center" className="flex-wrap">
          <StartFromThemeField onPick={startFromTheme} />
          {/* One subscription for both live-override readers: the promote payload IS the unsaved-latest
              blob (this cluster autosaves, so it is also what the card carries), and "nothing to promote"
              is the same emptiness "nothing to reset" already reads. */}
          <form.Subscribe selector={(state): ThemeOverride | null => overrideFromCharacterThemeForm(state.values)}>
            {(override): ReactElement => (
              <Row gap="field" align="center">
                <SaveAsThemeButton characterName={characterName} override={override} />
                <Button intent="ghost" disabled={override === null} onClick={resetToGlobal}>
                  Reset to global
                </Button>
              </Row>
            )}
          </form.Subscribe>
        </Row>
      </Row>
      <Text size="micro" tone="muted">
        Colours and styles apply to this character's messages instantly — no save needed. Leave a field on Inherit (or clear a colour) to fall back to your
        global theme.
      </Text>

      <Grid cols="wide" gap="gutter">
        <Section heading="Surface">
          <form.AppField name="background">{(field): ReactElement => <field.ColorField label="Background" />}</form.AppField>
          <form.AppField name="accent">{(field): ReactElement => <field.ColorField label="Accent" />}</form.AppField>
          <form.AppField name="borderColor">{(field): ReactElement => <field.ColorField label="Border" />}</form.AppField>
        </Section>

        <Section heading="Message text">
          <form.AppField name="speaker">{(field): ReactElement => <field.ColorField label="Speaker name" />}</form.AppField>
          <form.AppField name="dialogueColor">{(field): ReactElement => <field.ColorField label="Dialogue" />}</form.AppField>
          <form.AppField name="narrationColor">{(field): ReactElement => <field.ColorField label="Narration" />}</form.AppField>
          <form.AppField name="bodyColor">{(field): ReactElement => <field.ColorField label="Body" />}</form.AppField>
        </Section>

        <Section heading="Bubbles">
          <form.AppField name="userBubbleBg">{(field): ReactElement => <field.ColorField label="Your bubble" />}</form.AppField>
          <form.AppField name="userBubbleFg">{(field): ReactElement => <field.ColorField label="Your text" />}</form.AppField>
          <form.AppField name="aiBubbleBg">{(field): ReactElement => <field.ColorField label="Character bubble" />}</form.AppField>
          <form.AppField name="aiBubbleFg">{(field): ReactElement => <field.ColorField label="Character text" />}</form.AppField>
          <form.AppField name="systemBubbleBg">{(field): ReactElement => <field.ColorField label="System bubble" />}</form.AppField>
          <form.AppField name="systemBubbleFg">{(field): ReactElement => <field.ColorField label="System text" />}</form.AppField>
        </Section>

        <Section heading="Type & shape">
          <form.AppField name="font">{(field): ReactElement => <field.SelectField label="Font" items={FONT_ITEMS} />}</form.AppField>
          <form.AppField name="radius">{(field): ReactElement => <field.SelectField label="Corner radius" items={RADIUS_ITEMS} />}</form.AppField>
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
      intent="ghost"
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
 *  control is an ACTION, so it keeps showing its placeholder and each pick re-seeds the form. */
function StartFromThemeField({ onPick }: { readonly onPick: (theme: Theme) => void }): ReactElement {
  const trpc = useTRPC();
  const { data: themes } = useQuery(trpc.settings.listThemes.queryOptions());
  const items: SelectItems<string> = (themes ?? []).map((theme) => ({ value: theme.id, label: theme.name }));

  return (
    <Select
      aria-label="Start from a theme"
      disabled={items.length === 0}
      items={items}
      layout="inline"
      placeholder="Start from a theme…"
      value={null}
      onValueChange={(value): void => {
        const picked = themes?.find((theme) => theme.id === String(value));
        if (picked !== undefined) {
          onPick(picked);
        }
      }}
    />
  );
}

/** Nesting under the parent global `<ThemeScope>` resolves character over global over default. */
function ThemePreview({ override }: { readonly override: ReturnType<typeof overrideFromCharacterThemeForm> }): ReactElement {
  return (
    <ThemeScope tokens={override ?? {}}>
      <Stack gap="row" className="rounded-card border border-border bg-background p-block">
        <Text size="label" weight="medium" className="text-speaker">
          Aria
        </Text>
        <Stack gap="field" className="rounded-card bg-ai-bubble p-block">
          <Text as="span" className="text-dialogue">
            “Welcome to the archive,” she said.
          </Text>{" "}
          <Text as="span" className="text-narration">
            The lamplight flickered against the shelves.
          </Text>
        </Stack>
      </Stack>
    </ThemeScope>
  );
}
