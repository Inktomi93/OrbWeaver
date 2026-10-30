import { CtIsolation } from "@orb/testkit/browser";
import { Checkbox } from "@orb/ui/checkbox";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { CHECKBOX_HOSTS } from "./checkbox-hosts.ts";

function Hosts(): ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 8rem)" }}>
      {CHECKBOX_HOSTS.map((host) => (
        <div key={host} data-host={host} style={{ backgroundColor: `var(--color-${host})`, padding: "1.5rem" }}>
          <Checkbox aria-label={`Unchecked on ${host}`} checked={false} />
        </div>
      ))}
    </div>
  );
}

/** Unchecked checkboxes over each host surface, under a seed palette (Hearth when absent) or a custom ThemeScope background. */
export function CheckboxHostsStory({ theme, background }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS; readonly background?: string }): ReactElement {
  return (
    <CtIsolation subject="Checkbox" isolates="The unchecked checkbox edge against the surfaces a control sits on, under seed palettes and a custom ThemeScope">
      <div data-theme={theme}>
        {background === undefined ? (
          <Hosts />
        ) : (
          <ThemeScope tokens={{ background }}>
            <Hosts />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
