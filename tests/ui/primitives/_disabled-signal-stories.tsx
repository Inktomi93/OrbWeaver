import type { SeedScopeProps } from "@orb/testkit/browser";
import { CtIsolation, SeedScope } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { ColorField } from "@orb/ui/color-field";
import { Input } from "@orb/ui/input";
import { ListRow } from "@orb/ui/list-row";
import { NumberField } from "@orb/ui/number-field";
import { OptionStrip } from "@orb/ui/option-strip";
import { RadioGroup, RadioGroupItem } from "@orb/ui/radio-group";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Tabs, TabsList, TabsTab } from "@orb/ui/tabs";
import { Textarea } from "@orb/ui/textarea";
import type { ThemeScopeProps } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { Toggle } from "@orb/ui/toggle";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { SignalCase } from "./disabled-signal-cases.ts";
import { SIGNAL_STATES } from "./disabled-signal-cases.ts";

const SELECT_ITEMS = [{ value: "one", label: "One" }];

// One control of each kind, enabled or disabled, each in a box the CT finds by `data-case`.
const RENDERS = {
  "outline button": (disabled: boolean) => (
    <Button disabled={disabled} variant="outline">
      Outline
    </Button>
  ),
  "ghost button": (disabled: boolean) => (
    <Button disabled={disabled} variant="ghost">
      Ghost
    </Button>
  ),
  "list row": (disabled: boolean) => <ListRow clickable={true} data-disabled={disabled ? "" : undefined} title="Row" />,
  "selected list row": (disabled: boolean) => <ListRow clickable={true} data-disabled={disabled ? "" : undefined} data-selected="" title="Row" />,
  "option strip": (disabled: boolean) => (
    <OptionStrip
      aria-label="Commands"
      id={`strip-${String(disabled)}`}
      items={[{ id: `option-${String(disabled)}`, label: "/command", disabled }]}
      onSelect={(): void => undefined}
    />
  ),
  "active tab": (disabled: boolean) => (
    <Tabs value="a">
      <TabsList>
        <TabsTab disabled={disabled} value="a">
          Active
        </TabsTab>
        <TabsTab value="b">Other</TabsTab>
      </TabsList>
    </Tabs>
  ),
  "active rail cell": (disabled: boolean) => (
    <Tabs value="a">
      <TabsList>
        <TabsTab disabled={disabled} layout="cell" value="a">
          Active
        </TabsTab>
        <TabsTab layout="cell" value="b">
          Other
        </TabsTab>
      </TabsList>
    </Tabs>
  ),
  "pressed toggle": (disabled: boolean) => (
    <Toggle disabled={disabled} pressed={true}>
      Pressed
    </Toggle>
  ),
  "color field": (disabled: boolean) => <ColorField aria-label="Colour" disabled={disabled} onValueChange={(): void => undefined} value="#336699" />,
  "text field": (disabled: boolean) => <Input aria-label="Name" defaultValue="Ash" disabled={disabled} />,
  "field textarea": (disabled: boolean) => <Textarea aria-label="Notes" defaultValue="Ash" disabled={disabled} />,
  "bare textarea": (disabled: boolean) => <Textarea aria-label="Draft" chrome="bare" defaultValue="Ash" disabled={disabled} />,
  "empty text field": (disabled: boolean) => <Input aria-label="Search" disabled={disabled} placeholder="Search chats" />,
  "number field": (disabled: boolean) => <NumberField aria-label="Count" defaultValue={3} disabled={disabled} />,
  "select trigger": (disabled: boolean) => <Select aria-label="Pick" defaultValue="one" disabled={disabled} items={SELECT_ITEMS} />,
  "checked switch": (disabled: boolean) => <Switch aria-label="On" checked={true} disabled={disabled} />,
  "quiet checked switch": (disabled: boolean) => <Switch aria-label="Quiet on" checked={true} disabled={disabled} tone="quiet" />,
  "off switch": (disabled: boolean) => <Switch aria-label="Off" checked={false} disabled={disabled} />,
  "checked checkbox": (disabled: boolean) => <Checkbox aria-label="Ticked" checked={true} disabled={disabled} />,
  "checked radio": (disabled: boolean) => (
    <RadioGroup aria-label="Choice" disabled={disabled} value="one">
      <RadioGroupItem aria-label="One" value="one" />
    </RadioGroup>
  ),
  slider: (disabled: boolean) => <Slider aria-label="Level" defaultValue={50} disabled={disabled} thumbLabels={["Level"]} />,
} as const satisfies Record<SignalCase, (disabled: boolean) => ReactElement>;

function Cases(): ReactElement {
  return (
    <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "1fr 1fr", inlineSize: "40rem" }}>
      {/* The muted pair a disabled control swaps to, read back as each scope resolves it. */}
      <span data-probe="muted" style={{ backgroundColor: `var(${TOKENS["color.muted"].cssVar})`, color: `var(${TOKENS["color.muted-foreground"].cssVar})` }}>
        muted
      </span>
      <span />
      {Object.entries(RENDERS).flatMap(([name, render]) =>
        SIGNAL_STATES.map((state) => (
          <div key={`${name} ${state}`} data-case={name} data-state={state}>
            {render(state === "disabled")}
          </div>
        )),
      )}
    </div>
  );
}

/** Every control kind enabled and disabled on a seed's page. */
export function SeedDisabledSignalStory(props: SeedScopeProps): ReactElement {
  return (
    <CtIsolation subject="The disabled signal of every control kind" isolates="Each kind's enabled and disabled paint on a seed's page">
      <SeedScope {...props}>
        <Cases />
      </SeedScope>
    </CtIsolation>
  );
}

/** Every control kind enabled and disabled under a user's theme, on the page it carries. */
export function CustomThemeDisabledSignalStory({ tokens }: { readonly tokens: ThemeScopeProps["tokens"] }): ReactElement {
  return (
    <CtIsolation subject="The disabled signal under a custom theme" isolates="Each kind's enabled and disabled paint through the ThemeScope a theme renders in">
      <ThemeScope tokens={tokens}>
        <div style={{ backgroundColor: `var(${TOKENS["color.background"].cssVar})`, color: `var(${TOKENS["color.foreground"].cssVar})`, padding: "1rem" }}>
          <Cases />
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
