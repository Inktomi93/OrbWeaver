import { CtIsolation } from "@orb/testkit/browser";
import { Dices, Icon } from "@orb/ui/icons";
import { IndicatorDot } from "@orb/ui/indicator-dot";
import { InlineToken } from "@orb/ui/inline-token";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_ROLES, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const RUN_WIDTH = "24rem";

function roleVar(role: ToneRole): string {
  return `var(${TOKENS[`color.tone-${role}`].cssVar})`;
}

/**
 * Each tone's row: an inline token in a line of prose beside the same line with plain text, a solid dot and a ring, a probe
 * the dot's diameter is read against, and a probe per role painted straight from its variable.
 */
function Family(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
      {TONES.map((tone) => (
        <div key={tone} data-family-tone={tone} style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          <p data-case="run-with-token" style={{ inlineSize: RUN_WIDTH, margin: 0 }}>
            before{" "}
            <InlineToken data-case="inline-token" tone={tone}>
              <Icon icon={Dices} size="xs" />
              {`{{${tone}}}`}
            </InlineToken>{" "}
            after
          </p>
          <p data-case="run-plain" style={{ inlineSize: RUN_WIDTH, margin: 0 }}>
            {`before {{${tone}}} after`}
          </p>
          <IndicatorDot data-case="dot-solid" tone={tone} aria-hidden={true} />
          <IndicatorDot data-case="dot-outline" tone={tone} variant="outline" aria-hidden={true} />
          <span data-probe="dot-box" style={{ display: "block", inlineSize: "var(--spacing-field)", blockSize: "var(--spacing-field)" }} />
          <span data-probe="transparent" style={{ backgroundColor: "transparent" }} />
          {TONE_ROLES.map((role) => (
            <span key={role} data-probe={role} data-tone={tone} style={{ color: roleVar(role) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The family under a seed palette (`theme`, Hearth when absent) and, when `background` is set, a nested custom scope that
 * takes the seed's base and accent as its ambient, as the shell root hands them down.
 */
export function BadgeFamilyStory({ theme, background }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS; readonly background?: string }): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="The badge family's marks" isolates="InlineToken and IndicatorDot in every tone, each beside its role probes">
      <div data-theme={theme} style={{ backgroundColor: "var(--color-background)", padding: "1rem" }}>
        {background === undefined ? (
          <Family />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
          >
            <Family />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
