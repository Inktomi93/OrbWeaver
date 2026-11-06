import { CtIsolation } from "@orb/testkit/browser";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { SeedScopeProps } from "../_seed-scope.tsx";
import { SeedScope } from "../_seed-scope.tsx";

const HOSTS = ["background", "card"] as const;

/** Each state of a switch on each pane host a switch sits on, under a seed palette or a custom scope. */
export function SwitchThumbCeilingStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="Switch" isolates="The OFF thumb stays under the loudest ON state on every seed and both pane hosts">
      <SeedScope {...props}>
        {HOSTS.map((host) => (
          <div
            data-host={host}
            key={host}
            style={{ backgroundColor: `var(${TOKENS[`color.${host}`].cssVar})`, padding: "1.5rem", display: "flex", gap: "1.5rem" }}
          >
            <Switch aria-label={`off on ${host}`} checked={false} />
            <Switch aria-label={`on accent on ${host}`} checked={true} />
            <Switch aria-label={`on quiet on ${host}`} checked={true} tone="quiet" />
          </div>
        ))}
      </SeedScope>
    </CtIsolation>
  );
}
