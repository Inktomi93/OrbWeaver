// The Appearance tab — two immediate-commit clusters riding `character.update` (no save bar, no dirty
// pill): the per-character theme override (an autosave form persisting the whole `themeOverride` blob on
// change) and Trust (`forbidExternalMedia`/`trustHtml`, tri-state). `trustHtml` resolves `override ??
// global`; `forbidExternalMedia` is TIGHTEN-ONLY over the deployment ceiling, so while the deployment
// blocks external media the control renders locked (see the Trust section below).

import type { ThemeBackground, ThemeChatStyle, ThemeDensity, ThemeRadius } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES, THEME_DENSITIES, THEME_FONT_ALLOWLIST, THEME_RADII } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { BackgroundSourceField } from "#components";
import { QueryBoundary, QueryErrorState, useExternalMediaBlocked, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { CharacterThemeForm } from "../hooks/use-character-theme-form";
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
const CHAT_STYLE_LABELS: Record<ThemeChatStyle, string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  echo: "Echo (bled portrait)",
  whisper: "Whisper (avatar banner)",
  hush: "Hush (flat + speaker stripe)",
  ripple: "Ripple (VN sticky portrait)",
  tide: "Tide (paragraph bubbles)",
};
const DENSITY_LABELS: Record<ThemeDensity, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
const FONT_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_FONT_ALLOWLIST.map((value) => ({ value, label: value }))];
const RADIUS_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_RADII.map((value) => ({ value, label: RADIUS_LABELS[value] }))];
const CHAT_STYLE_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_CHAT_STYLES.map((value) => ({ value, label: CHAT_STYLE_LABELS[value] }))];
const DENSITY_ITEMS: SelectItems<string> = [INHERIT_ITEM, ...THEME_DENSITIES.map((value) => ({ value, label: DENSITY_LABELS[value] }))];

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
      <ThemeControls characterId={characterId} serverValue={data.themeOverride} />

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
  readonly serverValue: Parameters<typeof characterThemeFormFromOverride>[0];
}

/** The §8.1 control cluster — an autosave form whose every debounced change persists `themeOverride`.
 *  Mounted through the D78 session boundary (`CharacterThemeForm`), which OWNS the characterId key — a
 *  character switch remounts the form seeded from the new override, no manual `key` to place wrong. */
function ThemeControls({ characterId, serverValue }: ThemeControlsProps): ReactElement {
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
      {(session): ReactElement => <ThemeControlsBody form={session.form} />}
    </CharacterThemeForm>
  );
}

interface ThemeControlsBodyProps {
  readonly form: AutosaveSession<CharacterThemeFormValues>["form"];
}

/** The form-bearing theme controls — remounted per character by the boundary's keyed Session. */
function ThemeControlsBody({ form }: ThemeControlsBodyProps): ReactElement {
  // Reset to global = clear each field to its empty (Inherit) value. The store-subscription driver
  // persists each setFieldValue (autosave-form-doctrine.md §3) — no call-site flush, no reseed (this is
  // a live field edit, not a re-baseline to a server row).
  const resetToGlobal = (): void => {
    for (const name of THEME_FIELD_NAMES) {
      form.setFieldValue(name, EMPTY_CHARACTER_THEME_FORM[name]);
    }
  };

  return (
    <Stack gap="block">
      <Row gap="field" align="center" className="justify-between">
        <Text size="label" weight="medium">
          Theme
        </Text>
        <form.Subscribe selector={(state): boolean => overrideFromCharacterThemeForm(state.values) === null}>
          {(isEmpty): ReactElement => (
            <Button intent="ghost" disabled={isEmpty} onClick={resetToGlobal}>
              Reset to global
            </Button>
          )}
        </form.Subscribe>
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
          <form.AppField name="chatStyle">{(field): ReactElement => <field.SelectField label="Message style" items={CHAT_STYLE_ITEMS} />}</form.AppField>
          <form.AppField name="density">{(field): ReactElement => <field.SelectField label="Density" items={DENSITY_ITEMS} />}</form.AppField>
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
