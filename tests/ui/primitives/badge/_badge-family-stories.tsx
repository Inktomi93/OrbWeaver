import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, roleVar, SeedScope } from "@orb/testkit/browser";
import { Dices, Icon } from "@orb/ui/icons";
import { IndicatorDot } from "@orb/ui/indicator-dot";
import { InlineToken } from "@orb/ui/inline-token";
import { TOKENS, TONE_ROLES, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const RUN_WIDTH = "24rem";

/**
 * Each tone's row: an inline token in a line of prose beside the same line with plain text, a solid dot and a ring, a probe
 * the dot's diameter is read against, and a probe per role painted straight from its variable.
 */
function Family(): ReactElement {
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
          <span
            data-probe="dot-box"
            style={{ display: "block", inlineSize: `var(${TOKENS["spacing.field"].cssVar})`, blockSize: `var(${TOKENS["spacing.field"].cssVar})` }}
          />
          <span data-probe="tight" style={{ display: "block", inlineSize: `var(${TOKENS["spacing.tight"].cssVar})` }} />
          <span data-probe="transparent" style={{ backgroundColor: "transparent" }} />
          {TONE_ROLES.map((role) => (
            <span key={role} data-probe={role} data-tone={tone} style={{ color: roleVar(role) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The family under a seed palette (Hearth when absent) and, when `background` is set, a nested custom scope. */
export function BadgeFamilyStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="The badge family's marks" isolates="InlineToken and IndicatorDot in every tone, each beside its role probes">
      <SeedScope {...props}>
        <Family />
      </SeedScope>
    </CtIsolation>
  );
}
