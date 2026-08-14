// The theme editor — edits one owned themes row. Token-override pickers, font/radius/density selects, a
// custom-CSS code editor with live validateThemeCss diagnostics + a themeable-var reference, a scoped live
// <ThemeScope> preview (authoring never restyles the real app), and non-blocking WCAG AA badges on the
// picked text colors. AUTOSAVE through `updateTheme` (the house pattern — north-star §7 / D66 A4, the
// preset editor's `createAutosaveEntityForm` + `AutosaveStatus` chrome, its mint-once sibling): the header
// carries the live save status where a Save button used to be; the preview is live off the form's current
// values regardless.
//
// DRAFT sessions (`mint`): "Customize a built-in" and "New theme" open this editor on values that have NO
// row behind them yet. The mint is INTERCEPTED here — nothing is written until the first real edit lands,
// so opening a customize and going straight back leaves nothing behind (it used to leave a copy nobody
// asked for). The mechanism is the preset editor's (`use-preset-autosave`, mirrored by `use-theme-autosave`
// here): one serialized mint promise held in a ref, every later write retargeted to the row it returned, so
// the copy is minted exactly ONCE per session — by the autosave driver's own edit → debounce → save chain,
// never per-keystroke and never by opening the editor. A save that races the mint awaits the same promise,
// so it can never patch the seed it was customizing.

import type { Theme, ThemeRadius } from "@orb/contracts/theme";
import { THEME_FONT_ALLOWLIST, THEME_RADII } from "@orb/contracts/theme";
import { validateThemeCss } from "@orb/kit/css-validate";
import type { CodeEditorDiagnostic, CodeEditorProps } from "@orb/ui/code-editor";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { THEME_SCOPE_EMIT_VARS, ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
// biome's resolver mis-enumerates react's conditional-CJS export map and misses lazy/Suspense
// specifically (main.tsx precedent); tsc resolves them and the client typechecks clean.
import { lazy, Suspense, useEffect } from "react";
import type { AppFormInstance, AutosaveSession } from "#forms";
import { AutosaveStatus, createAutosaveEntityForm } from "#forms";
// The THEME-shaped appearance table. It used to ride the settings feature's own
// `appearance-select-items.ts`; SET-SEAMS stage 1 split that file into its chat- and app-shell-owned halves,
// so the table three features render homes at the `#lib` shared-vocabulary floor.
import { DENSITY_ITEMS, messageBubbleClass } from "#lib";
import { useThemeAutosave } from "../hooks/use-theme-autosave.ts";
import { AA_CONTRAST_FLOOR, contrastRatio } from "../lib/theme-contrast.ts";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM, themeFormFromEntity, themeOverrideFromForm } from "../lib/theme-editor-model.ts";

// Lazy so CodeMirror never lands in the entry chunk for a modal-only editor.
const CodeEditor = lazy(async () => {
  const mod = await import("@orb/ui/code-editor");
  return { default: mod.CodeEditor };
}) as (props: CodeEditorProps) => ReactElement;

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

export interface ThemeEditorProps {
  /** The OWNED theme being edited — or, with `mint`, the DRAFT values a not-yet-existing row starts from
   *  (seeds are read-only, so the picker never opens this on one directly). */
  readonly theme: Theme;
  /**
   * DRAFT session: create the row this session edits, and resolve to it. Called AT MOST ONCE, by the
   * autosave driver's first real save (or a retry that beat it). Omit for an existing row.
   */
  readonly mint?: () => Promise<Theme>;
}

// The session-boundary autosave form (D78 §1, mirroring the preset editor's `PresetForm`). Module-scope so
// the Boundary + its inner Session hold stable identities. `save` is supplied per-instance (`useThemeAutosave`
// closes over the live tRPC client + the row/mint state, neither reachable at this module scope).
const ThemeForm = createAutosaveEntityForm<ThemeFormValues>({ defaultValues: DEFAULT_THEME_FORM });

/** The token-override + custom-CSS editor for one owned theme (or one draft — see `mint`). */
export function ThemeEditor({ theme, mint }: ThemeEditorProps): ReactElement {
  const { save, mintedName } = useThemeAutosave({ theme, ...(mint === undefined ? {} : { mint }) });

  return (
    <ThemeForm entityId={theme.id} serverValues={themeFormFromEntity(theme)} save={save}>
      {(session): ReactElement => <ThemeEditorBody theme={theme} session={session} mintedName={mintedName} />}
    </ThemeForm>
  );
}

interface ThemeEditorBodyProps {
  readonly theme: Theme;
  readonly session: AutosaveSession<ThemeFormValues>;
  readonly mintedName: string | null;
}

function ThemeEditorBody({ theme, session, mintedName }: ThemeEditorBodyProps): ReactElement {
  const { form, saveState, retrySave } = session;
  // Widen once (the session's `form` is the boundary's surface minus `reset`) — the field bodies below
  // never call it, matching the preset editor's identical widen.
  const boundForm = form as AppFormInstance<ThemeFormValues>;

  // The server de-collides a derived name ("Mocha copy" → "Mocha copy 2") the instant the mint resolves.
  // An UNTOUCHED name field adopts it; a name the author already changed is theirs and is left alone. Lives
  // here (not inside `useThemeAutosave`) because only the render body can reach the live session's form.
  useEffect(() => {
    if (mintedName !== null && boundForm.state.values.name === theme.name) {
      boundForm.setFieldValue("name", mintedName);
    }
  }, [mintedName, boundForm, theme.name]);

  return (
    <Stack gap="section">
      <Row gap="field" align="center" className="justify-end">
        <AutosaveStatus state={saveState} onRetry={retrySave} />
      </Row>
      <boundForm.AppField name="name">{(field): ReactElement => <field.TextField label="Theme name" />}</boundForm.AppField>

      <Grid cols="wide" gap="gutter">
        <Section heading="Surface">
          <boundForm.AppField name="background">
            {(field): ReactElement => (
              <field.ColorField label="Background" description="The base surface — the sidebar/panel/card ramp and all text colors derive from this." />
            )}
          </boundForm.AppField>
          <boundForm.AppField name="accent">{(field): ReactElement => <field.ColorField label="Accent" />}</boundForm.AppField>
          <boundForm.AppField name="borderColor">
            {(field): ReactElement => <field.ColorField label="Border" description="Leave as-is to derive a subtle border from the surface." />}
          </boundForm.AppField>
        </Section>

        <Section heading="Message text">
          <boundForm.AppField name="speaker">{(field): ReactElement => <field.ColorField label="Speaker name" />}</boundForm.AppField>
          <boundForm.AppField name="dialogueColor">{(field): ReactElement => <field.ColorField label="Dialogue" />}</boundForm.AppField>
          <boundForm.AppField name="narrationColor">{(field): ReactElement => <field.ColorField label="Narration" />}</boundForm.AppField>
          <boundForm.AppField name="bodyColor">{(field): ReactElement => <field.ColorField label="Body" />}</boundForm.AppField>
        </Section>

        <Section heading="Bubbles">
          <boundForm.AppField name="userBubbleBg">{(field): ReactElement => <field.ColorField label="Your bubble" />}</boundForm.AppField>
          <boundForm.AppField name="aiBubbleBg">{(field): ReactElement => <field.ColorField label="Character bubble" />}</boundForm.AppField>
          <boundForm.AppField name="systemBubbleBg">{(field): ReactElement => <field.ColorField label="System bubble" />}</boundForm.AppField>
        </Section>

        <Section heading="Type & shape">
          <boundForm.AppField name="font">{(field): ReactElement => <field.SelectField label="Font" items={FONT_ITEMS} />}</boundForm.AppField>
          <boundForm.AppField name="radius">{(field): ReactElement => <field.SelectField label="Corner radius" items={RADIUS_ITEMS} />}</boundForm.AppField>
          <boundForm.AppField name="density">{(field): ReactElement => <field.SelectField label="Density" items={DENSITY_ITEMS} />}</boundForm.AppField>
        </Section>
      </Grid>

      <Section heading="Custom CSS">
        <boundForm.AppField name="css">
          {(field): ReactElement => <CssEditorField value={field.state.value} onChange={(next): void => field.handleChange(next)} />}
        </boundForm.AppField>
        <ThemeableVarsReference />
      </Section>

      <Section heading="Preview">
        <boundForm.Subscribe selector={(state): ThemeFormValues => state.values}>
          {(values): ReactElement => <ThemePreview values={values} />}
        </boundForm.Subscribe>
      </Section>
    </Stack>
  );
}

/** The custom-CSS code editor + live validator diagnostics (warn on `@import`, reject `position:fixed`). */
function CssEditorField({ value, onChange }: { readonly value: string; readonly onChange: (next: string) => void }): ReactElement {
  const { errors, warnings } = validateThemeCss(value);
  const diagnostics: CodeEditorDiagnostic[] = [
    ...errors.map((message) => ({ severity: "error" as const, message, from: 0, to: 0 })),
    ...warnings.map((message) => ({ severity: "warning" as const, message, from: 0, to: 0 })),
  ];
  return (
    <Suspense fallback={null}>
      <CodeEditor lang="css" ariaLabel="Custom theme CSS" value={value} onChange={onChange} diagnostics={diagnostics} completions={THEME_SCOPE_EMIT_VARS} />
    </Suspense>
  );
}

/** The themeable-var reference the author can target. */
function ThemeableVarsReference(): ReactElement {
  return (
    <Stack gap="field">
      <Text voice="kicker">Themeable variables</Text>
      <Row gap="field" className="flex-wrap">
        {THEME_SCOPE_EMIT_VARS.map((name) => (
          <Text key={name} as="span" voice="datum" className="rounded-control bg-muted px-field text-muted-foreground">
            {name}
          </Text>
        ))}
      </Row>
    </Stack>
  );
}

/** A scoped live preview — a sample exchange under the in-progress theme, contained to this box only. The
 *  two bubbles paint from `messageBubbleClass`, the SAME builder the transcript's bubble skins use, so what
 *  an author judges here is the box the app actually paints (side-eye P2: the preview had drifted to
 *  `rounded-base p-block` against the real `rounded-card px-block py-row`). */
function ThemePreview({ values }: { readonly values: ThemeFormValues }): ReactElement {
  return (
    <Stack gap="block">
      <ThemeScope tokens={themeOverrideFromForm(values)}>
        <Stack gap="row" className="rounded-base border border-border bg-background p-block">
          <Text voice="label" className="text-speaker">
            Aria
          </Text>
          <Stack gap="field" className={messageBubbleClass("assistant")}>
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
          <Stack gap="field" className={`self-end ${messageBubbleClass("user")}`}>
            <Text as="span">Show me the oldest one.</Text>
          </Stack>
        </Stack>
      </ThemeScope>
      <ContrastReport values={values} />
    </Stack>
  );
}

/** Non-blocking WCAG feedback: each picked text color vs the surface it reads against. */
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

function ContrastBadge({ label, color, against }: { readonly label: string; readonly color: string; readonly against: string }): ReactElement | null {
  const ratio = contrastRatio(color, against);
  if (ratio === null) {
    return null;
  }
  const passes = ratio >= AA_CONTRAST_FLOOR;
  const rounded = ratio.toFixed(1);
  return (
    <Row gap="field" align="center">
      <Text voice="kicker">{label}</Text>
      <Text voice="gloss" className={passes ? undefined : "text-warning"}>
        {passes ? `${rounded}:1` : `${rounded}:1 — hard to read`}
      </Text>
    </Row>
  );
}
