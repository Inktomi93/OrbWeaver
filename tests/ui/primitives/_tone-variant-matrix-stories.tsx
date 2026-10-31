import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { GlyphButton } from "@orb/ui/glyph-button";
import { Circle, Icon } from "@orb/ui/icons";
import { InlineAction } from "@orb/ui/inline-action";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Toggle } from "@orb/ui/toggle";
import type { ToneRole } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_HOST_UTILITIES, TONE_ROLES, TONES } from "@orb/ui/tokens";
import { WeaveGlyph } from "@orb/ui/web-weave";
import type { ReactElement } from "react";

const BUTTON_VARIANTS = ["solid", "outline", "ghost", "link"] as const;
const BADGE_VARIANTS = ["solid", "soft", "outline"] as const;
const CARD_VARIANTS = ["surface", "soft", "outline"] as const;
const TOGGLE_VARIANTS = ["ghost", "outline"] as const;
const GLYPH_VARIANTS = ["solid", "outline", "ghost"] as const;
const INLINE_VARIANTS = ["ghost", "link"] as const;
// The named colours a case reads that are not a tone role: the neutral toggle's resting ink and the selected fill.
const NAMED_PROBES = {
  muted: "color.muted-foreground",
  selection: "color.selection-quiet",
  "selection-foreground": "color.selection-quiet-foreground",
} as const satisfies Record<string, keyof typeof TOKENS>;

function roleVar(role: ToneRole): string {
  return `var(${TOKENS[`color.tone-${role}`].cssVar})`;
}

/** Every primitive in every tone and style, each tone beside a probe per role painted straight from its variable. */
function Matrix(): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.5rem",
        backgroundColor: `var(${TOKENS["color.background"].cssVar})`,
        color: `var(${TOKENS["color.foreground"].cssVar})`,
      }}
    >
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
          {TOGGLE_VARIANTS.map((variant) => (
            <Toggle key={variant} data-case={`toggle-${variant}`} tone={tone} variant={variant}>
              {`${tone} ${variant}`}
            </Toggle>
          ))}
          {GLYPH_VARIANTS.map((variant) => (
            <GlyphButton key={variant} aria-label={`${tone} glyph ${variant}`} data-case={`glyph-${variant}`} glyph="lg" tone={tone} variant={variant}>
              <Icon icon={Circle} size="xs" />
            </GlyphButton>
          ))}
          {INLINE_VARIANTS.map((variant) => (
            <InlineAction key={variant} data-case={`inline-${variant}`} step="label" tone={tone} variant={variant}>
              {`${tone} inline ${variant}`}
            </InlineAction>
          ))}
          <Toggle data-case="toggle-pressed" defaultPressed={true} tone={tone} variant="outline">
            {`${tone} pressed`}
          </Toggle>
          <Text data-case="text" tone={tone}>{`${tone} text`}</Text>
          <Icon icon={Circle} label={`${tone} icon`} tone={tone} />
          <WebSpinner label={`${tone} wait`} tone={tone} />
          <WeaveGlyph tone={tone} decorative={true} />
          {TONE_ROLES.map((role) => (
            <span key={role} data-probe={role} data-tone={tone} style={{ color: roleVar(role) }} />
          ))}
          <span data-probe="card" style={{ color: `var(${TOKENS["color.card"].cssVar})` }} />
          {/* A surface Card is the host of its own edge, so its edge mixes over the card fill. */}
          <span className={TONE_HOST_UTILITIES.card} data-probe="edge-on-card" data-tone={tone} style={{ color: roleVar("edge") }} />
          {Object.entries(NAMED_PROBES).map(([probe, token]) => (
            <span key={probe} data-probe={probe} style={{ color: `var(${TOKENS[token].cssVar})` }} />
          ))}
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
    <CtIsolation
      subject="The D336 tone and variant matrix"
      isolates="Button, GlyphButton, InlineAction, Badge, Card, Toggle, Text, Icon, WebSpinner and WeaveGlyph in every tone and style"
    >
      <div data-theme={theme} style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, padding: "1rem" }}>
        {background === undefined ? (
          <Matrix />
        ) : (
          <ThemeScope
            tokens={{ background }}
            {...(ambient === undefined
              ? {}
              : { ambientBackground: ambient[TOKENS["color.background"].cssVar], ambientAccent: ambient[TOKENS["color.primary"].cssVar] })}
          >
            <Matrix />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
