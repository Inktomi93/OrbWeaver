import { CtIsolation } from "@orb/testkit/browser";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_ROLE_RECIPES, TONE_ROLES, TONES } from "@orb/ui/tokens";
import type { CSSProperties, ReactElement } from "react";

const SEMANTIC_PAIRS = [
  ["background", "foreground"],
  ["surface-raised", "foreground"],
  ["card", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["accent", "accent-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
  ["secondary", "secondary-foreground"],
] as const;
const MUTED_HOSTS = ["background", "card", "popover", "sidebar", "secondary", "muted"] as const;
const INPUT_HOSTS = ["background", "card", "popover"] as const;
// Columns wrap so every sample stays inside a phone viewport as well as a desktop one.
const GRID_COLUMNS = "repeat(auto-fill, minmax(10rem, 1fr))";
const SAMPLE_STYLE: CSSProperties = { margin: 0, padding: "1rem", minHeight: "3rem" };

export function SemanticContrastStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="ThemeScope" isolates="Domain-free emitted theme tokens and browser color composition">
      <ThemeScope tokens={{ background }}>
        <div style={{ display: "grid", gridTemplateColumns: GRID_COLUMNS }}>
          {SEMANTIC_PAIRS.map(([surface, ink]) => (
            <p key={`${surface}-${ink}`} style={{ ...SAMPLE_STYLE, backgroundColor: `var(--color-${surface})`, color: `var(--color-${ink})` }}>
              {`${ink} on ${surface}`}
            </p>
          ))}
          {MUTED_HOSTS.map((surface) => (
            <p key={`muted-${surface}`} style={{ ...SAMPLE_STYLE, backgroundColor: `var(--color-${surface})`, color: "var(--color-muted-foreground)" }}>
              {`muted on ${surface}`}
            </p>
          ))}
          {INPUT_HOSTS.map((surface) => (
            <div key={`input-${surface}`} style={{ backgroundColor: `var(--color-${surface})` }}>
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-input)", color: "var(--color-muted-foreground)" }}>{`input on ${surface}`}</p>
            </div>
          ))}
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
            {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
          >
            <ToneFloorPairs />
          </ThemeScope>
        )}
      </div>
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
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-reading-band)", color: "var(--color-reading-plate-foreground)" }}>Reading band</p>
              <p
                style={{ ...SAMPLE_STYLE, backgroundColor: "oklch(from var(--color-reading-plate) l c h / 1)", color: "var(--color-reading-plate-foreground)" }}
              >
                Opaque plate reference
              </p>
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-reading-plate)", color: "var(--color-reading-plate-foreground)" }}>Reading plate</p>
            </section>
          ))}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
