import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const HOSTS = ["background", "card"] as const;

/** Each read-only state of a switch on each pane host a switch sits on, under a seed palette or a custom scope. */
export function SwitchLockGlyphStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Switch" isolates="The read-only lock glyph holds the non-text floor against its thumb on every seed and both pane hosts">
      <SeedScope {...props}>
        {HOSTS.map((host) => (
          <div
            data-host={host}
            key={host}
            style={{ backgroundColor: `var(${TOKENS[`color.${host}`].cssVar})`, padding: "1.5rem", display: "flex", gap: "1.5rem" }}
          >
            <Switch aria-label={`off on ${host}`} checked={false} readOnly={true} />
            <Switch aria-label={`on accent on ${host}`} checked={true} readOnly={true} />
            <Switch aria-label={`on quiet on ${host}`} checked={true} readOnly={true} tone="quiet" />
          </div>
        ))}
      </SeedScope>
    </CtIsolation>
  );
}
