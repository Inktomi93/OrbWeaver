// The CONTEXT Appearance tab (FINAL-Character §7 / §8.1). TWO immediate-commit clusters, both riding
// `character.update` on change — NEVER the CONTENT save-bar, never a dirty pill (§2, the #1 way this lane
// breaks):
//   • §8.1 per-character THEME override (the cluster ABOVE Trust) — the sanctioned autosave form
//     (`createAutosaveEntityForm`, D54 §13.4: "≥3 fields OR save semantics → a factory"; a hand-rolled
//     multi-field form is the drift the factory prevents). "Flip it and it saves" IS §8.1's immediate
//     commit: a debounced change persists the WHOLE `themeOverride` blob, no Save button, no draft form.
//     The bound `field.ColorField`/`field.SelectField` mirror the WS2 global theme editor's control cluster
//     (same @orb/ui primitives + the same `@orb/contracts` allowlists — a runtime cross-feature import is
//     forbidden, so the shared home is contracts, not a settings export). A field left on its sentinel is
//     OMITTED → that token inherits (§8.2, pure `<ThemeScope>` cascade); all-sentinel ⇒ `null` (no
//     override). The decorative background IMAGE is NOT here (D63 — a user `appearance` pref). chatStyle
//     offers all `THEME_CHAT_STYLES` incl. the 5 immersive modes (the override.ts header sanctions
//     per-character immersive picks; the §8.1 table predates them).
//   • Trust — `forbidExternalMedia` + `trustHtml`, both tri-state (inherit / …), `override ?? global`.
//
// Tri-state ⇄ boolean|null: the Select speaks strings (inherit/forbid/allow · inherit/trusted/untrusted);
// the wire is `boolean | null` (null = inherit the deployment default).

import type { ThemeChatStyle, ThemeDensity, ThemeRadius } from "@orb/contracts/theme";
import {
  THEME_CHAT_STYLES,
  THEME_DENSITIES,
  THEME_FONT_ALLOWLIST,
  THEME_RADII,
} from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import { useCharacterThemeForm } from "../hooks/use-character-theme-form";
import type { CharacterThemeFormValues } from "../lib/character-theme-form-model";
import {
  characterThemeFormFromOverride,
  EMPTY_CHARACTER_THEME_FORM,
  overrideFromCharacterThemeForm,
  THEME_INHERIT,
} from "../lib/character-theme-form-model";

export interface CharacterAppearanceTabProps {
  readonly characterId: CharacterId;
}

// ── Select item sets (the WS2 control cluster's items — same @orb/contracts allowlists, an Inherit head) ──

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
const FONT_ITEMS: SelectItems<string> = [
  INHERIT_ITEM,
  ...THEME_FONT_ALLOWLIST.map((value) => ({ value, label: value })),
];
const RADIUS_ITEMS: SelectItems<string> = [
  INHERIT_ITEM,
  ...THEME_RADII.map((value) => ({ value, label: RADIUS_LABELS[value] })),
];
const CHAT_STYLE_ITEMS: SelectItems<string> = [
  INHERIT_ITEM,
  ...THEME_CHAT_STYLES.map((value) => ({ value, label: CHAT_STYLE_LABELS[value] })),
];
const DENSITY_ITEMS: SelectItems<string> = [
  INHERIT_ITEM,
  ...THEME_DENSITIES.map((value) => ({ value, label: DENSITY_LABELS[value] })),
];

const THEME_FIELD_NAMES = Object.keys(
  EMPTY_CHARACTER_THEME_FORM,
) as (keyof CharacterThemeFormValues)[];

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
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load appearance.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
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

  const commit = (input: {
    forbidExternalMedia?: boolean | null;
    trustHtml?: boolean | null;
  }): void => {
    update.mutate({ characterId, input });
  };

  return (
    <Stack gap="section">
      {/* §8.1 — the per-character theme cluster. Keyed by id so switching character remounts the form
          (the factory's reseed contract) with the newly-selected character's override as the seed. */}
      <ThemeControls key={characterId} characterId={characterId} serverValue={data.themeOverride} />

      <Section heading="Trust">
        <Row gap="field" className="flex-wrap">
          {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the Select's `label` prop renders the visible, associated label (the rule can't see a custom prop); the bound SelectField carries the same suppression. */}
          <Select
            label="External media"
            items={[
              { value: "inherit", label: "Inherit default" },
              { value: "off", label: "Allow" },
              { value: "on", label: "Forbid" },
            ]}
            value={tristateValue(data.forbidExternalMedia)}
            onValueChange={(value): void =>
              commit({ forbidExternalMedia: tristateFlag(String(value)) })
            }
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
        <Text size="micro" tone="muted">
          Trust settings apply the instant you change them — no save needed.
        </Text>
      </Section>
    </Stack>
  );
}

interface ThemeControlsProps {
  readonly characterId: CharacterId;
  readonly serverValue: Parameters<typeof characterThemeFormFromOverride>[0];
}

/** The §8.1 control cluster — an autosave form whose every debounced change persists `themeOverride`. */
function ThemeControls({ characterId, serverValue }: ThemeControlsProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });

  // The persist seam (call-time save, §13.4): map the flat form back to the sparse override (null when
  // every field inherits) and ride `character.update` — the same immediate-commit verb Trust uses.
  const save = (values: CharacterThemeFormValues): Promise<unknown> =>
    update.mutateAsync({
      characterId,
      input: { themeOverride: overrideFromCharacterThemeForm(values) },
    });

  const { form, mountKey } = useCharacterThemeForm({
    entityId: characterId,
    serverValues: characterThemeFormFromOverride(serverValue),
    save,
  });

  // "Reset to global" = clear every field to its sentinel; the mapper then reads the whole override as
  // `null`, and the autosave listener persists it. (The factory removes `form.reset` — reseeding defaults
  // on a live autosave mirror is the infinite-loop footgun it guards against.)
  const resetToGlobal = (): void => {
    for (const name of THEME_FIELD_NAMES) {
      form.setFieldValue(name, EMPTY_CHARACTER_THEME_FORM[name]);
    }
  };

  return (
    <Stack key={mountKey} gap="block">
      <Row gap="field" align="center" className="justify-between">
        <Text size="label" weight="medium">
          Theme
        </Text>
        <form.Subscribe
          selector={(state): boolean => overrideFromCharacterThemeForm(state.values) === null}
        >
          {(isEmpty): ReactElement => (
            <Button intent="ghost" disabled={isEmpty} onClick={resetToGlobal}>
              Reset to global
            </Button>
          )}
        </form.Subscribe>
      </Row>
      <Text size="micro" tone="muted">
        Colours and styles apply to this character's messages instantly — no save needed. Leave a
        field on Inherit (or clear a colour) to fall back to your global theme.
      </Text>

      <Grid cols="wide" gap="gutter">
        <Section heading="Surface">
          <form.AppField name="background">
            {(field): ReactElement => <field.ColorField label="Background" />}
          </form.AppField>
          <form.AppField name="accent">
            {(field): ReactElement => <field.ColorField label="Accent" />}
          </form.AppField>
          <form.AppField name="borderColor">
            {(field): ReactElement => <field.ColorField label="Border" />}
          </form.AppField>
        </Section>

        <Section heading="Message text">
          <form.AppField name="speaker">
            {(field): ReactElement => <field.ColorField label="Speaker name" />}
          </form.AppField>
          <form.AppField name="dialogueColor">
            {(field): ReactElement => <field.ColorField label="Dialogue" />}
          </form.AppField>
          <form.AppField name="narrationColor">
            {(field): ReactElement => <field.ColorField label="Narration" />}
          </form.AppField>
          <form.AppField name="bodyColor">
            {(field): ReactElement => <field.ColorField label="Body" />}
          </form.AppField>
        </Section>

        <Section heading="Bubbles">
          <form.AppField name="userBubbleBg">
            {(field): ReactElement => <field.ColorField label="Your bubble" />}
          </form.AppField>
          <form.AppField name="userBubbleFg">
            {(field): ReactElement => <field.ColorField label="Your text" />}
          </form.AppField>
          <form.AppField name="aiBubbleBg">
            {(field): ReactElement => <field.ColorField label="Character bubble" />}
          </form.AppField>
          <form.AppField name="aiBubbleFg">
            {(field): ReactElement => <field.ColorField label="Character text" />}
          </form.AppField>
          <form.AppField name="systemBubbleBg">
            {(field): ReactElement => <field.ColorField label="System bubble" />}
          </form.AppField>
          <form.AppField name="systemBubbleFg">
            {(field): ReactElement => <field.ColorField label="System text" />}
          </form.AppField>
        </Section>

        <Section heading="Type & shape">
          <form.AppField name="font">
            {(field): ReactElement => <field.SelectField label="Font" items={FONT_ITEMS} />}
          </form.AppField>
          <form.AppField name="radius">
            {(field): ReactElement => (
              <field.SelectField label="Corner radius" items={RADIUS_ITEMS} />
            )}
          </form.AppField>
          <form.AppField name="chatStyle">
            {(field): ReactElement => (
              <field.SelectField label="Message style" items={CHAT_STYLE_ITEMS} />
            )}
          </form.AppField>
          <form.AppField name="density">
            {(field): ReactElement => <field.SelectField label="Density" items={DENSITY_ITEMS} />}
          </form.AppField>
        </Section>
      </Grid>

      <Section heading="Preview">
        <form.Subscribe selector={(state): CharacterThemeFormValues => state.values}>
          {(values): ReactElement => (
            <ThemePreview override={overrideFromCharacterThemeForm(values)} />
          )}
        </form.Subscribe>
      </Section>
    </Stack>
  );
}

/** The live preview — truthful because the override IS committed (§8.1). Nesting under the parent global
 *  `<ThemeScope>` resolves character over global over default with no merge code (§8.2); an unset field
 *  simply isn't emitted, so it inherits through. */
function ThemePreview({
  override,
}: {
  readonly override: ReturnType<typeof overrideFromCharacterThemeForm>;
}): ReactElement {
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
