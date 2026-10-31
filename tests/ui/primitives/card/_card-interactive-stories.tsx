import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import type { ToneRole } from "@orb/ui/tokens";
import { TOKENS, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { SeedScopeProps } from "../_seed-scope.tsx";
import { SeedScope } from "../_seed-scope.tsx";

const VARIANTS = ["surface", "soft"] as const;
const PROBED_ROLES = ["text-on-tint", "tint-active"] as const satisfies readonly ToneRole[];

function roleVar(role: ToneRole): string {
  return `var(${TOKENS[`color.tone-${role}`].cssVar})`;
}

/** An operable Card in every tone and fill style, each tone beside a probe per role it reads when pressed. */
function Cards(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem", backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}>
      {TONES.map((tone) => (
        <div key={tone} data-card-tone={tone} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {VARIANTS.map((variant) => (
            <Card key={variant} data-case={variant} interactive={true} tone={tone} variant={variant}>
              {`${tone} ${variant}`}
            </Card>
          ))}
          {PROBED_ROLES.map((role) => (
            <span key={role} data-probe={role} data-tone={tone} style={{ color: roleVar(role) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardInteractiveStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Card interactive" isolates="An operable Card in every tone and fill style, read at rest, hovered and pressed">
      <SeedScope {...props}>
        <Cards />
      </SeedScope>
    </CtIsolation>
  );
}
