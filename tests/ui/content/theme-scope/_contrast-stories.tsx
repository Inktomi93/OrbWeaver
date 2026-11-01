import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { ListRow } from "@orb/ui/list-row";
import { MessageBubble } from "@orb/ui/message-bubble";
import { TrackBar } from "@orb/ui/meter";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_ROLE_RECIPES, TONE_ROLES, TONES } from "@orb/ui/tokens";
import type { CSSProperties, ReactElement } from "react";

const SEMANTIC_PAIRS = [
  ["background", "foreground"],
  ["surface-raised", "foreground"],
  ["card", "foreground"],
  ["card", "card-foreground"],
  ["card", "prose-body"],
  ["accent", "foreground"],
  ["muted", "foreground"],
  ["popover", "popover-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["accent", "accent-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
  ["secondary", "secondary-foreground"],
] as const;
const MUTED_HOSTS = ["background", "card", "popover", "sidebar", "secondary", "muted"] as const;
const INPUT_HOSTS = ["background", "card", "popover"] as const;
const FIELD_HOSTS = ["background", "surface-raised", "card", "popover"] as const;
// Columns wrap so every sample stays inside a phone viewport as well as a desktop one.
const GRID_COLUMNS = "repeat(auto-fill, minmax(10rem, 1fr))";
const SAMPLE_STYLE: CSSProperties = { margin: 0, padding: "1rem", minHeight: "3rem" };

/** Every neutral ink on the hosts it is painted on: under a shipped palette (`theme`, Hearth when absent), or under a custom scope on `background`. */
export function SemanticContrastStory({
  background,
  theme,
}: {
  readonly background?: string;
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
}): ReactElement {
  const pairs = <SemanticPairs />;
  return (
    <CtIsolation subject="ThemeScope" isolates="Domain-free emitted theme tokens and browser color composition">
      {background === undefined ? <div data-theme={theme}>{pairs}</div> : <ThemeScope tokens={{ background }}>{pairs}</ThemeScope>}
    </CtIsolation>
  );
}

function SemanticPairs(): ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
      {SEMANTIC_PAIRS.map(([surface, ink]) => (
        <p
          key={`${surface}-${ink}`}
          style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS[`color.${surface}`].cssVar})`, color: `var(${TOKENS[`color.${ink}`].cssVar})` }}
        >
          {`${ink} on ${surface}`}
        </p>
      ))}
      {MUTED_HOSTS.map((surface) => (
        <p
          key={`muted-${surface}`}
          style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS[`color.${surface}`].cssVar})`, color: `var(${TOKENS["color.muted-foreground"].cssVar})` }}
        >
          {`muted on ${surface}`}
        </p>
      ))}
      {INPUT_HOSTS.map((surface) => (
        <div key={`input-${surface}`} style={{ backgroundColor: `var(${TOKENS[`color.${surface}`].cssVar})` }}>
          <p
            style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS["color.input"].cssVar})`, color: `var(${TOKENS["color.muted-foreground"].cssVar})` }}
          >{`input on ${surface}`}</p>
        </div>
      ))}
      {FIELD_HOSTS.map((surface) => (
        <div key={`field-${surface}`} style={{ backgroundColor: `var(${TOKENS[`color.${surface}`].cssVar})` }}>
          <p
            style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS["color.field-fill"].cssVar})`, color: `var(${TOKENS["color.foreground"].cssVar})` }}
          >{`field value on ${surface}`}</p>
        </div>
      ))}
    </div>
  );
}

/** The ramp members a picker row and a rail track are told apart by, each a bare fill over the card or popover it sits on. */
export function NeutralFillStory({ background }: { readonly background: string }): ReactElement {
  const fill = (name: string, token: "muted" | "accent" | "popover" | "card" | "input", host: "card" | "popover"): ReactElement => (
    <div style={{ backgroundColor: `var(${TOKENS[`color.${host}`].cssVar})` }}>
      <div data-fill={name} style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS[`color.${token}`].cssVar})` }} />
    </div>
  );
  return (
    <CtIsolation subject="ThemeScope" isolates="The neutral ramp and the input rail a custom scope paints">
      <ThemeScope tokens={{ background }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
          {fill("muted", "muted", "popover")}
          {fill("accent", "accent", "popover")}
          {fill("popover", "popover", "popover")}
          {fill("card", "card", "card")}
          {fill("rail", "input", "card")}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

type ToneFloorSurface = (typeof TONE_ROLE_RECIPES)[ToneRole]["floor"][number];

function surfaceVar(surface: ToneFloorSurface): string {
  return "role" in surface ? TOKENS[`color.tone-${surface.role}`].cssVar : TOKENS[`color.${surface.host}`].cssVar;
}

/** Every D336 floor pair for every tone, painted with the generated role variables on `[data-tone]` elements. */
function ToneFloorPairs(): ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
      {TONES.flatMap((tone) =>
        TONE_ROLES.flatMap((role) =>
          TONE_ROLE_RECIPES[role].floor.map((surface) => {
            const label = `${tone} ${role} on ${"role" in surface ? surface.role : surface.host}`;
            return (
              <p
                key={label}
                data-tone={tone}
                style={{ ...SAMPLE_STYLE, backgroundColor: `var(${surfaceVar(surface)})`, color: `var(${TOKENS[`color.tone-${role}`].cssVar})` }}
              >
                {label}
              </p>
            );
          }),
        ),
      )}
    </div>
  );
}

/**
 * The tone roles under a seed palette (`theme`, Hearth when absent) and, when `background` is set, a nested custom
 * scope. The nested scope takes the seed's base and accent as its ambient, as the shell root hands them down.
 */
export function ToneRoleContrastStory({
  theme,
  background,
}: {
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
  readonly background?: string;
}): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="Tone roles" isolates="Generated [data-tone] role variables over seed palettes and a nested custom ThemeScope">
      <div data-theme={theme}>
        {background === undefined ? (
          <ToneFloorPairs />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined
              ? {}
              : { ambientBackground: ambient[TOKENS["color.background"].cssVar], ambientAccent: ambient[TOKENS["color.primary"].cssVar] })}
          >
            <ToneFloorPairs />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}

/** The hue-carrying roles one tone paints, each sample addressed by `data-sample`; the tints and the solid are bare fills. */
const HUE_SAMPLE_ROLES = ["solid", "tint", "tint-active"] as const satisfies readonly ToneRole[];

/**
 * Each colored tone's text on the page and its solid and tints as fills, inside a custom ThemeScope on `background`, with
 * Hearth's base and accent as the ambient the shell root hands down.
 */
export function ToneHueStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="Tone hues" isolates="Literal tone roles a custom ThemeScope emits over a mid-lightness page">
      <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
        <div
          data-sample="ground"
          style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, display: "grid", gridTemplateColumns: GRID_COLUMNS, padding: "1rem" }}
        >
          {TONES.filter((tone) => tone !== "neutral").map((tone) => (
            <div key={tone} data-tone={tone} style={{ display: "grid", gap: "0.5rem" }}>
              <p data-sample="text" style={{ ...SAMPLE_STYLE, color: `var(${TOKENS["color.tone-text"].cssVar})`, fontWeight: 700 }}>
                {`${tone} text`}
              </p>
              {HUE_SAMPLE_ROLES.map((role) => (
                <div key={role} data-sample={role} style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS[`color.tone-${role}`].cssVar})` }} />
              ))}
            </div>
          ))}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

/** Each seed palette's stamp: the base palette by its own block, the value-set palettes by `data-theme`. */
const SEED_STAMPS = [
  { name: "base", stamp: { "data-palette": "base" } },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((name) => ({ name, stamp: { "data-theme": name } })),
] as const;

/** Every tone role under each seed palette, one fill per role addressed by `data-role-sample`. */
function SeedRoleSamples(): ReactElement {
  return (
    <>
      {SEED_STAMPS.map(({ name, stamp }) => (
        <div key={name} {...stamp}>
          {TONES.map((tone) => (
            <div key={tone} data-tone={tone}>
              {TONE_ROLES.map((role) => (
                <div
                  key={role}
                  data-role-sample={`${name} ${tone} ${role}`}
                  style={{ ...SAMPLE_STYLE, backgroundColor: `var(${TOKENS[`color.tone-${role}`].cssVar})` }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Every seed palette twice: on the page, and nested inside a custom ThemeScope on `background`, as a theme thumbnail
 * sits inside a custom app theme. The nested seed must paint its own roles, never the carried scope's solve.
 */
export function NestedSeedStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="Nested seed palettes" isolates="Seed [data-theme] tone roles nested inside a custom ThemeScope">
      <section data-nest="page">
        <SeedRoleSamples />
      </section>
      <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
        <section data-nest="carried">
          <SeedRoleSamples />
        </section>
      </ThemeScope>
    </CtIsolation>
  );
}

/** Every field a carried scope can paint, so the scope emits its whole palette surface over `background`. */
function fullPaletteTokens(background: string): ThemeScopeTokens {
  return {
    background,
    accent: "oklch(0.62 0.2 300)",
    userBubble: { bg: "oklch(0.42 0.08 200)" },
    aiBubble: { bg: "oklch(0.45 0.06 140)" },
    systemBubble: { bg: "oklch(0.5 0.04 90)" },
    speaker: "oklch(0.8 0.12 30)",
    dialogueColor: "oklch(0.82 0.1 210)",
    narrationColor: "oklch(0.78 0.05 120)",
    bodyColor: "oklch(0.9 0.02 60)",
    borderColor: "oklch(0.7 0.1 330)",
  };
}

/**
 * Every seed palette twice, each stamp holding one probe: on the page, and nested inside a custom ThemeScope that paints
 * every field, as a theme thumbnail sits inside a custom app theme. The nested probe must resolve the seed's own values.
 */
export function NestedSeedSurfaceStory({ background }: { readonly background: string }): ReactElement {
  const probes = SEED_STAMPS.map(({ name, stamp }) => <div key={name} data-seed-probe={name} {...stamp} />);
  return (
    <CtIsolation subject="Nested seed palettes" isolates="Seed palette blocks nested inside a ThemeScope that emits its whole palette surface">
      <section data-nest="page">{probes}</section>
      <ThemeScope tokens={fullPaletteTokens(background)} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
        <section data-nest="carried">{probes}</section>
      </ThemeScope>
    </CtIsolation>
  );
}

/** A selected navigation row inside a custom ThemeScope on `background`: its label keeps the page ink on the primary tint. */
export function SelectedRowStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="Selected ListRow" isolates="The selection rail's tint under a custom ThemeScope">
      <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
        <div style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem", inlineSize: "20rem" }}>
          <ListRow title="Connections" clickable={true} data-selected="" />
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

/** The tone marks that carry meaning on their own: a zone meter's fill on its track, and a status Card's edge on the page. */
export function ToneMarkStory({ theme }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS }): ReactElement {
  return (
    <CtIsolation subject="Tone marks" isolates="The meter zone fills and the status Card edges over a seed palette">
      <div
        data-theme={theme}
        data-mark="ground"
        style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem", display: "grid", gap: "1rem" }}
      >
        {(["info", "warning"] as const).map((accent) => (
          <div key={accent} data-mark={`meter-${accent}`}>
            <TrackBar value={50} max={100} accent={accent} />
          </div>
        ))}
        {(["warning", "info"] as const).map((tone) => (
          <Card key={tone} tone={tone} variant="soft" data-mark={`card-${tone}`}>
            {tone} box
          </Card>
        ))}
      </div>
    </CtIsolation>
  );
}

/** The page ground beside a bubble per message role, under a shipped palette (`theme`, Hearth when absent) or a custom scope on `background`. */
export function BubbleSeparationStory({
  background,
  theme,
}: {
  readonly background?: string;
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
}): ReactElement {
  const content = (
    <div style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem" }}>
      <div data-sample="page" style={{ minHeight: "2rem" }} />
      {MESSAGE_ROLES.map((role) => (
        <MessageBubble key={role} messageRole={role} data-bubble={role}>
          {role}
        </MessageBubble>
      ))}
    </div>
  );
  return (
    <CtIsolation subject="ThemeScope" isolates="Message bubble fills against the page under shipped palettes and custom scopes">
      {background === undefined ? <div data-theme={theme}>{content}</div> : <ThemeScope tokens={{ background }}>{content}</ThemeScope>}
    </CtIsolation>
  );
}

/** A speaker's ink-only scope nested in a custom scope, as a transcript row sits in a custom app theme: its dialogue on each bubble. */
export function SpeakerInkStory({ background, dialogueColor }: { readonly background: string; readonly dialogueColor: string }): ReactElement {
  return (
    <CtIsolation subject="ThemeScope" isolates="A nested ink-only scope judged on the bubbles of the carried palette around it">
      <ThemeScope tokens={{ background }}>
        <div style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem" }}>
          <ThemeScope tokens={{ dialogueColor }}>
            {MESSAGE_ROLES.map((role) => (
              <MessageBubble key={role} messageRole={role}>
                <span data-dialogue={role} style={{ color: `var(${TOKENS["color.dialogue"].cssVar})` }}>
                  {role}
                </span>
              </MessageBubble>
            ))}
          </ThemeScope>
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

export function ReadingBandStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="ThemeScope reading band" isolates="Opaque attribution coverage against contrasting art and the live plate color">
      <ThemeScope tokens={{ background }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
          {["black", "white"].map((art) => (
            <section key={art} aria-label={`${art} art`} style={{ backgroundColor: art }}>
              <p
                style={{
                  ...SAMPLE_STYLE,
                  backgroundColor: `var(${TOKENS["color.reading-band"].cssVar})`,
                  color: `var(${TOKENS["color.reading-plate-foreground"].cssVar})`,
                }}
              >
                Reading band
              </p>
              <p
                style={{
                  ...SAMPLE_STYLE,
                  backgroundColor: `oklch(from var(${TOKENS["color.reading-plate"].cssVar}) l c h / 1)`,
                  color: `var(${TOKENS["color.reading-plate-foreground"].cssVar})`,
                }}
              >
                Opaque plate reference
              </p>
              <p
                style={{
                  ...SAMPLE_STYLE,
                  backgroundColor: `var(${TOKENS["color.reading-plate"].cssVar})`,
                  color: `var(${TOKENS["color.reading-plate-foreground"].cssVar})`,
                }}
              >
                Reading plate
              </p>
            </section>
          ))}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
