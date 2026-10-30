import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Circle, Icon } from "@orb/ui/icons";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_ROLES, TONES } from "@orb/ui/tokens";
import { WeaveGlyph } from "@orb/ui/web-weave";
import type { ReactElement } from "react";

const BUTTON_VARIANTS = ["solid", "outline", "ghost", "link"] as const;
const BADGE_VARIANTS = ["solid", "soft", "outline"] as const;
const CARD_VARIANTS = ["surface", "soft", "outline"] as const;

function roleVar(role: ToneRole): string {
  return `var(${TOKENS[`color.tone-${role}`].cssVar})`;
}

/** Every primitive in every tone and style, each tone beside a probe per role painted straight from its variable. */
function Matrix(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
      {TONES.map((tone) => (
        <div key={tone} data-matrix-tone={tone} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} data-case={`button-${variant}`} tone={tone} variant={variant}>
              {`${tone} ${variant}`}
            </Button>
          ))}
          {BADGE_VARIANTS.map((variant) => (
            <Badge key={variant} data-case={`badge-${variant}`} tone={tone} variant={variant}>
              {`${tone} ${variant}`}
            </Badge>
          ))}
          {CARD_VARIANTS.map((variant) => (
            <Card key={variant} data-case={`card-${variant}`} tone={tone} variant={variant}>
              {`${tone} ${variant}`}
            </Card>
          ))}
          <Text data-case="text" tone={tone}>{`${tone} text`}</Text>
          <Icon icon={Circle} label={`${tone} icon`} tone={tone} />
          <WebSpinner label={`${tone} wait`} tone={tone} />
          <WeaveGlyph tone={tone} decorative={true} />
          {TONE_ROLES.map((role) => (
            <span key={role} data-probe={role} data-tone={tone} style={{ color: roleVar(role) }} />
          ))}
          <span data-probe="card" style={{ color: "var(--color-card)" }} />
        </div>
      ))}
    </div>
  );
}

/**
 * The matrix under a seed palette (`theme`, Hearth when absent) and, when `background` is set, a nested custom scope that
 * takes the seed's base and accent as its ambient, as the shell root hands them down.
 */
export function ToneVariantMatrixStory({
  theme,
  background,
}: {
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
  readonly background?: string;
}): ReactElement {
  const ambient = theme === undefined ? undefined : SEED_THEME_VALUE_SETS[theme].vars;
  return (
    <CtIsolation subject="The D336 tone and variant matrix" isolates="Button, Badge, Card, Text, Icon, WebSpinner and WeaveGlyph in every tone and style">
      <div data-theme={theme} style={{ backgroundColor: "var(--color-background)", padding: "1rem" }}>
        {background === undefined ? (
          <Matrix />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined ? {} : { ambientBackground: ambient["--color-background"], ambientAccent: ambient["--color-primary"] })}
          >
            <Matrix />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
