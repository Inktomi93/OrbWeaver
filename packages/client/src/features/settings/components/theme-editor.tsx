// The theme EDITOR (D44 §12.1 · §13.4) — edits ONE owned `themes` row. Token-override pickers (the SEED
// set only; the neutral ramp + all foregrounds DERIVE via <ThemeScope>, never picked), font/radius/style/
// density selects, the custom-CSS code editor with LIVE `validateThemeCss` diagnostics + a themeable-var
// reference, a SCOPED live <ThemeScope> preview (authoring NEVER restyles the real app — only a deliberate
// SELECT applies globally, Tier-3), and non-blocking WCAG AA badges on the picked text colors (Tier-2 —
// inform, don't block; the customizer's own app, their risk). BUTTON-GATED save through `updateTheme`
// (`createSavedEntityForm`, §13.4) — the preview above is live off the form's unsaved values; the Save
// button is the only thing that persists.

import type { Theme, ThemeChatStyle, ThemeDensity, ThemeRadius } from "@orb/contracts/theme";
import {
  THEME_CHAT_STYLES,
  THEME_DENSITIES,
  THEME_FONT_ALLOWLIST,
  THEME_RADII,
} from "@orb/contracts/theme";
import { validateThemeCss } from "@orb/kit/css-validate";
import type { ThemeId } from "@orb/kit/ids";
import type { CodeEditorDiagnostic } from "@orb/ui/code-editor";
import { CodeEditor } from "@orb/ui/code-editor";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useThemeForm } from "../hooks/use-theme-form";
import { useUpdateTheme } from "../hooks/use-theme-mutations";
import type { ThemeFormValues } from "../lib/theme-editor-model";
import {
  AA_CONTRAST_FLOOR,
  contrastRatio,
  THEMEABLE_VARS,
  themeFormFromEntity,
  themeInputFromForm,
  themeOverrideFromForm,
} from "../lib/theme-editor-model";

const FONT_ITEMS: SelectItems<string> = THEME_FONT_ALLOWLIST.map((value) => ({
  value,
  label: value,
}));
const RADIUS_LABELS: Record<ThemeRadius, string> = {
  base: "Base",
  control: "Tight",
  card: "Card",
  full: "Round",
};
const RADIUS_ITEMS: SelectItems<string> = THEME_RADII.map((value) => ({
  value,
  label: RADIUS_LABELS[value],
}));
const CHAT_STYLE_LABELS: Record<ThemeChatStyle, string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
  // §B.2 — the 5 immersive modes (FINAL-Persona-and-Immersive-Chat-Visuals.md).
  echo: "Echo (bled portrait)",
  whisper: "Whisper (avatar banner)",
  hush: "Hush (flat + speaker stripe)",
  ripple: "Ripple (VN sticky portrait)",
  tide: "Tide (paragraph bubbles)",
};
const CHAT_STYLE_ITEMS: SelectItems<string> = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
}));
const DENSITY_LABELS: Record<ThemeDensity, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
const DENSITY_ITEMS: SelectItems<string> = THEME_DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
}));

export interface ThemeEditorProps {
  /** The OWNED theme being edited (seeds are read-only → the picker duplicates before opening this). */
  readonly theme: Theme;
}

/** The token-override + custom-CSS editor for one owned theme. */
export function ThemeEditor({ theme }: ThemeEditorProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTheme = useUpdateTheme({ trpc, invalidation });
  const themeId = theme.id as ThemeId;

  // Resolves to the SAVED row mapped back to form values (createSavedEntityForm's re-baseline source,
  // obligation 3) — `updateTheme` returns the persisted `Theme` entity, not the flat form shape.
  const save = async (values: ThemeFormValues): Promise<ThemeFormValues> => {
    const saved = await updateTheme.mutateAsync({ id: themeId, input: themeInputFromForm(values) });
    return themeFormFromEntity(saved);
  };

  const { form, mountKey } = useThemeForm({
    entityId: theme.id,
    serverValues: themeFormFromEntity(theme),
    save,
  });

  return (
    <form
      key={mountKey}
      onSubmit={(event): void => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Stack gap="section">
        <form.AppField name="name">
          {(field): ReactElement => <field.TextField label="Theme name" />}
        </form.AppField>

        <Grid cols="wide" gap="gutter">
          <Section heading="Surface">
            <form.AppField name="background">
              {(field): ReactElement => (
                <field.ColorField
                  label="Background"
                  description="The base surface — the sidebar/panel/card ramp and all text colors derive from this."
                />
              )}
            </form.AppField>
            <form.AppField name="accent">
              {(field): ReactElement => <field.ColorField label="Accent" />}
            </form.AppField>
            <form.AppField name="borderColor">
              {(field): ReactElement => (
                <field.ColorField
                  label="Border"
                  description="Leave as-is to derive a subtle border from the surface."
                />
              )}
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
            <form.AppField name="aiBubbleBg">
              {(field): ReactElement => <field.ColorField label="Character bubble" />}
            </form.AppField>
            <form.AppField name="systemBubbleBg">
              {(field): ReactElement => <field.ColorField label="System bubble" />}
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

        <Section heading="Custom CSS">
          <form.AppField name="css">
            {(field): ReactElement => (
              <CssEditorField
                value={field.state.value}
                onChange={(next): void => field.handleChange(next)}
              />
            )}
          </form.AppField>
          <ThemeableVarsReference />
        </Section>

        <Section heading="Preview">
          <form.Subscribe selector={(state): ThemeFormValues => state.values}>
            {(values): ReactElement => <ThemePreview values={values} />}
          </form.Subscribe>
        </Section>

        <form.AppForm>
          <Row gap="field" align="center" className="justify-end">
            <form.DirtyPill />
            <form.SubmitButton>Save theme</form.SubmitButton>
          </Row>
        </form.AppForm>
      </Stack>
    </form>
  );
}

/** The custom-CSS code editor + live validator diagnostics (warn on `@import`, reject `position:fixed`). */
function CssEditorField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactElement {
  const { errors, warnings } = validateThemeCss(value);
  const diagnostics: CodeEditorDiagnostic[] = [
    ...errors.map((message) => ({ severity: "error" as const, message, from: 0, to: 0 })),
    ...warnings.map((message) => ({ severity: "warning" as const, message, from: 0, to: 0 })),
  ];
  return (
    <CodeEditor
      lang="css"
      ariaLabel="Custom theme CSS"
      value={value}
      onChange={onChange}
      diagnostics={diagnostics}
      // WS3 — real inline autocomplete of the themeable `--color-*`/etc vars, fed from the SAME
      // machine-current list the reference chips below render (never a hand-kept second copy).
      completions={THEMEABLE_VARS}
    />
  );
}

/** The themeable-var reference — the machine-current `THEME_SCOPE_EMIT_VARS` set an author can target. */
function ThemeableVarsReference(): ReactElement {
  return (
    <Stack gap="field">
      <Text size="micro" tone="muted" transform="caps">
        Themeable variables
      </Text>
      <Row gap="field" className="flex-wrap">
        {THEMEABLE_VARS.map((name) => (
          <Text
            key={name}
            as="span"
            size="code"
            tone="muted"
            className="rounded-control bg-muted px-field font-mono"
          >
            {name}
          </Text>
        ))}
      </Row>
    </Stack>
  );
}

/** A SCOPED live preview — a sample exchange under the in-progress theme. Authoring never touches the
 *  real app (Tier-3): the <ThemeScope> contains the palette to this box only. */
function ThemePreview({ values }: { readonly values: ThemeFormValues }): ReactElement {
  return (
    <Stack gap="block">
      <ThemeScope tokens={themeOverrideFromForm(values)}>
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
            <Text as="span" className="text-prose-body">
              Everything here has a story.
            </Text>
          </Stack>
          <Stack gap="field" className="self-end rounded-card bg-user-bubble p-block">
            <Text as="span">Show me the oldest one.</Text>
          </Stack>
        </Stack>
      </ThemeScope>
      <ContrastReport values={values} />
    </Stack>
  );
}

/** Non-blocking WCAG feedback (Tier-2): each picked text color vs the surface it reads against. */
function ContrastReport({ values }: { readonly values: ThemeFormValues }): ReactElement {
  const checks: ReadonlyArray<readonly [label: string, color: string, against: string]> = [
    ["Dialogue", values.dialogueColor, values.aiBubbleBg],
    ["Narration", values.narrationColor, values.aiBubbleBg],
    ["Body", values.bodyColor, values.aiBubbleBg],
    ["Speaker", values.speaker, values.background],
    ["Accent", values.accent, values.background],
  ];
  return (
    <Stack gap="field">
      {checks.map(([label, color, against]) => (
        <ContrastBadge key={label} label={label} color={color} against={against} />
      ))}
    </Stack>
  );
}

function ContrastBadge({
  label,
  color,
  against,
}: {
  readonly label: string;
  readonly color: string;
  readonly against: string;
}): ReactElement | null {
  const ratio = contrastRatio(color, against);
  if (ratio === null) {
    return null;
  }
  const passes = ratio >= AA_CONTRAST_FLOOR;
  const rounded = ratio.toFixed(1);
  return (
    <Row gap="field" align="center">
      <Text size="micro" tone="muted" transform="caps">
        {label}
      </Text>
      <Text size="micro" tone={passes ? "muted" : "warning"}>
        {passes ? `${rounded}:1` : `${rounded}:1 — hard to read`}
      </Text>
    </Row>
  );
}
