import { CtIsolation } from "@orb/testkit/browser";
import { Checkbox } from "@orb/ui/checkbox";
import { Input } from "@orb/ui/input";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Switch } from "@orb/ui/switch";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

const HOSTS = ["background", "card", "popover"] as const;

function Carriers({ host }: { readonly host: string }): ReactElement {
  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <Checkbox aria-label={`Checkbox on ${host}`} checked={false} />
      <RadioGroup aria-label={`Radio on ${host}`} value="">
        <RadioGroupItem aria-label={`Radio choice on ${host}`} value="one" />
      </RadioGroup>
      <Switch aria-label={`Switch on ${host}`} checked={false} />
      <Input aria-label={`Input on ${host}`} readOnly={true} value="" />
    </div>
  );
}

function Hosts(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {HOSTS.map((host) => (
        <div key={host} data-host={host} style={{ backgroundColor: `var(${TOKENS[`color.${host}`].cssVar})`, padding: "1.5rem" }}>
          <Carriers host={host} />
        </div>
      ))}
      {/* Swatches painted with the two tokens the carriers are judged against: the edge and the focus ring. */}
      <div data-swatch="edge" style={{ backgroundColor: `var(${TOKENS["color.input-border"].cssVar})`, padding: "1rem" }} />
      <div data-swatch="ring" style={{ backgroundColor: `var(${TOKENS["color.ring"].cssVar})`, padding: "1rem" }} />
    </div>
  );
}

/** The form-control carriers over each host surface, under a seed palette (Hearth when absent) or a custom ThemeScope. */
export function CarrierEdgeStory({
  theme,
  background,
  accent,
  ambientAccent,
}: {
  readonly theme?: keyof typeof SEED_THEME_VALUE_SETS;
  readonly background?: string;
  readonly accent?: string;
  /** The app theme's accent a scope without its own pick inherits. */
  readonly ambientAccent?: string;
}): ReactElement {
  return (
    <CtIsolation subject="Form-control carriers" isolates="The resting edge of checkbox, radio, switch and input against the surfaces they sit on">
      <div data-theme={theme}>
        {background === undefined ? (
          <Hosts />
        ) : (
          <ThemeScope tokens={{ background, ...(accent === undefined ? {} : { accent }) }} {...(ambientAccent === undefined ? {} : { ambientAccent })}>
            <Hosts />
          </ThemeScope>
        )}
      </div>
    </CtIsolation>
  );
}
