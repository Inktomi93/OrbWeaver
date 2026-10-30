import { CtAppearanceChannels, CtIsolation } from "@orb/testkit/browser";
import { BarList } from "@orb/ui/bar-list";
import { Button } from "@orb/ui/button";
import type { OrbEChartsInstance } from "@orb/ui/chart";
import { CodeEditor } from "@orb/ui/code-editor";
import { Histogram } from "@orb/ui/histogram";
import { Icon, Lock } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Stack, Surface } from "@orb/ui/layout";
import { SegmentedClock } from "@orb/ui/meter";
import { Select } from "@orb/ui/select";
import { WebSpinner } from "@orb/ui/spinner";
import { Switch } from "@orb/ui/switch";
import { Heading, Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { WeaveGlyph } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useState } from "react";

export function RampControlsStory(): ReactElement {
  const [pressed, setPressed] = useState(false);
  return (
    <CtIsolation subject="Token-backed public controls" isolates="Primitive ink, chrome and pointer hit geometry have no application state dependency.">
      <div style={{ display: "grid", gap: "var(--spacing-section)", padding: "var(--spacing-section)" }}>
        <div data-slot="icon-samples">
          <Icon icon={Lock} label="Small icon" size="xs" weight="hairline" />
          <Icon icon={Lock} label="Regular icon" size="md" />
          <Icon icon={Lock} label="Bold icon" size="lg" weight="bold" />
        </div>
        <WebSpinner label="Compact loader" size="sm" />
        <WebSpinner label="Hero loader" size="hero" />
        <WeaveGlyph size="lg" />
        <SegmentedClock filled={1} segments={4} label="Hidden clock" hidden={true} />
        <Button size="sm" aria-pressed={pressed} onClick={(): void => setPressed(!pressed)}>
          Toggle sample
        </Button>
        <Switch aria-label="Switch sample" />
        <Select
          aria-label="Select sample"
          items={[
            { label: "First", value: "first" },
            { label: "Second", value: "second" },
          ]}
          defaultValue="first"
        />
        <Textarea aria-label="Bounded notes" rows={2} maxRows={2} defaultValue="one\ntwo" />
        <CodeEditor ariaLabel="Code sample" value="invalid" diagnostics={[{ severity: "error", from: 0, to: 7, message: "Invalid declaration" }]} />
      </div>
    </CtIsolation>
  );
}

export function RampChartsStory({
  font = "Geist",
  density = "comfortable",
}: {
  readonly font?: ThemeScopeTokens["font"];
  readonly density?: ThemeScopeTokens["density"];
}): ReactElement {
  const [chart, setChart] = useState<OrbEChartsInstance | null>(null);
  const [snapshot, setSnapshot] = useState("");
  return (
    <CtIsolation
      subject="Chart token consumers"
      isolates="Public chart components and their real ECharts instance exercise live theme, density and font metrics without application data."
    >
      <ThemeScope tokens={{ font, density }}>
        <div data-live-token-root="" style={{ inlineSize: "100%", maxInlineSize: "var(--width-lane)" }}>
          <Text voice="label" data-slot="chart-font-reference">
            12345 tokens
          </Text>
          <BarList
            items={[
              { id: "one", label: "A long category name for ellipsis", value: 12_345 },
              { id: "two", label: "Second category", value: 42 },
            ]}
            label="Ranked sample"
            valueFormatter={(value): string => `${value} tokens`}
            onChartReady={setChart}
          />
          <Histogram
            buckets={[
              { label: "First", count: 3 },
              { label: "Second", count: 5 },
            ]}
            label="Distribution sample"
          />
          <Button onClick={(): void => setSnapshot(JSON.stringify(chart?.getOption()))}>Read chart options</Button>
          <output aria-label="Chart options" style={{ display: "block", overflowWrap: "anywhere" }}>
            {snapshot}
          </output>
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

export function RampTypographyStory({ fontScale }: { readonly fontScale: number }): ReactElement {
  return (
    <CtIsolation
      subject="Governed typography"
      isolates="Production voices, heading defaults and entry floors use the actual root-channel writer without application data."
    >
      <CtAppearanceChannels settings={{ fontScale }}>
        <Stack padding="block" gap="row">
          <Heading level={1}>Heading sample</Heading>
          <Heading level={2}>Subheading sample</Heading>
          <Heading level={3} voice="masthead">
            Masthead sample
          </Heading>
          <Text voice="reading">Reading sample</Text>
          <Text voice="label">Label sample</Text>
          <Text voice="gloss">Gloss sample</Text>
          <Text voice="code">Code sample</Text>
          <Input aria-label="Form typography" defaultValue="Form entry" />
          <Surface tier="instrument">
            <Input aria-label="Dense typography" defaultValue="Dense entry" />
          </Surface>
        </Stack>
      </CtAppearanceChannels>
    </CtIsolation>
  );
}
