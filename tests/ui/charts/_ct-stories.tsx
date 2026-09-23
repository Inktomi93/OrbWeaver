// CT stories for the @orb/ui chart family (docs/law/Spine-Testing.md §7 — a CT mounts from a non-test module).
//
// WHY THESE EXIST AT ALL (measured 2026-08-19, lane analytics-charts): playwright-ct SERIALIZES the mounted
// JSX tree across its RPC boundary, and a FUNCTION prop on a component nested inside that tree does not
// survive it. A `valueFormatter` passed as `<div style={…}><BarList valueFormatter={fn} /></div>` arrives
// UNDEFINED, and the canvas quietly draws the DEFAULT `String(value)` label — a green-looking test asserting
// a chart nobody composes. Every chart defect that lives in a formatter (a clipped value label) or in a
// production-narrow host box therefore needs its formatter and its host box owned HERE, in real module code.
//
// Components only — playwright-ct rewrites this module's named imports into generated component consts, so
// a mixed import (component + constant) fails to parse in the consuming CT.
import { BarList } from "@orb/ui/bar-list";
import type { OrbChartOption, OrbEChartsInstance } from "@orb/ui/chart";
import { Chart } from "@orb/ui/chart";
import { LIVE_TOKEN_ROOT_ATTRIBUTE } from "@orb/ui/lib";
import { ThemeScope } from "@orb/ui/theme-scope";
import { TOKEN_POLARITY_ARMS, TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { useChartTheme } from "../../../packages/ui/src/charts/chart/use-chart-theme.ts";

/** Distinguishes a RE-RENDER from a REMOUNT: the id is minted once per mounted instance, so a repaint
 *  proven with an unchanged id is the live store re-resolving, not React throwing the subtree away. */
let mountSequence = 0;

/**
 * #503 — the live-token store's repaint contract, read out as DOM. `useChartTheme().axisLine` is the token
 * every chart's axis + split lines paint from (`color.border`), and `color.border` is exactly what the
 * colorization axis re-declares on `<html>`. The value rides a `data-*` attribute rather than the canvas
 * because a canvas repaint is only provable in pixels; this reads the same value the option builders get.
 */
export function ChartThemeAxisLineReadoutStory(): ReactElement {
  const colors = useChartTheme();
  const [mountId] = useState((): string => {
    mountSequence += 1;
    return `mount-${mountSequence}`;
  });
  // `seriesPositive` rides along because it is the OTHER resolution path — the attached-probe read that
  // makes the cascade resolve a `light-dark()` intent token (#504 moved that probe's host into the marked
  // resolution root, so a green here is also the receipt that the probe still resolves where it now lands).
  return (
    <p
      data-axis-line={colors.axisLine}
      data-mount-id={mountId}
      data-palette={colors.palette.join("|")}
      data-series={colors.series}
      data-series-positive={colors.seriesPositive}
    >
      {colors.axisLine}
    </p>
  );
}

/**
 * #504 — the same readout, mounted the way the APP mounts a chart: inside a `<ThemeScope>` carrying a CUSTOM
 * theme's palette, under the element the shell marks as the live-token root. A custom theme sets no
 * `[data-theme]`, so nothing about it is visible from `documentElement` — with the store resolving there,
 * this readout painted the BASE `color.border` while every DOM hairline around it painted the custom one.
 *
 * The three arms are the flips that must repaint: custom → a DIFFERENT custom (which moves no attribute
 * anywhere except ThemeScope's inline `style`) → seed/no-override (the palette falls back to the base
 * cascade). `borderColor` is the one override key that lands on `--color-border` BYTE-IDENTICALLY
 * (`clamp.ts` puts it with no derivation), so each arm's expected value is exactly its token value — two
 * ramp stops nothing else in this story declares, standing in for a custom theme's picked hairline.
 */
const CUSTOM_BORDER_ARMS = [TOKEN_POLARITY_ARMS["color.chart-3"].dark, TOKEN_POLARITY_ARMS["color.chart-4"].dark] as const;

export function CustomThemeChartAxisLineStory(): ReactElement {
  const [arm, setArm] = useState(0);
  const borderColor = CUSTOM_BORDER_ARMS[arm];
  return (
    <ThemeScope tokens={borderColor === undefined ? {} : { borderColor }} ambientBackground={TOKENS["color.background"].value}>
      <div {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }}>
        <button onClick={(): void => setArm((current): number => current + 1)} type="button">
          Next theme
        </button>
        <ChartThemeAxisLineReadoutStory />
      </div>
    </ThemeScope>
  );
}

/** #939 — a user-authored light base, not the Light seed. ThemeScope derives `color-scheme: light` from
 * the carried background, and the chart hook must therefore resolve the same categorical light arms. */
export function CustomLightChartRampStory(): ReactElement {
  return (
    <ThemeScope tokens={{ background: "oklch(0.9 0.01 60)" }} ambientBackground={TOKENS["color.background"].value}>
      <div {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }}>
        <ChartThemeAxisLineReadoutStory />
      </div>
    </ThemeScope>
  );
}

/** #939 — five categorical fills authored into, and read back from, one real ECharts option. */
function MidlightFiveCategoryChart(): ReactElement {
  const colors = useChartTheme();
  const chartRef = useRef<OrbEChartsInstance | null>(null);
  const [optionJson, setOptionJson] = useState("");
  const option: OrbChartOption = {
    grid: { bottom: 8, left: 8, right: 8, top: 8 },
    xAxis: { max: 10, min: 0, show: false, type: "value" },
    yAxis: { data: ["One", "Two", "Three", "Four", "Five"], show: false, type: "category" },
    series: [
      {
        barWidth: 14,
        data: colors.palette.map((color, index) => ({ itemStyle: { color }, value: index + 5 })),
        type: "bar",
      },
    ],
  };
  const captureOption = (): void => {
    const chart = chartRef.current;
    if (chart !== null) {
      setOptionJson(JSON.stringify(chart.getOption()));
    }
  };
  return (
    <div
      {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }}
      data-echarts-option={optionJson}
      data-testid="midlight-chart-panel"
      style={{ backgroundColor: "var(--color-card)" }}
    >
      <Chart
        height={180}
        label="Midlight five-category chart"
        onChartReady={(instance): void => {
          chartRef.current = instance;
          setOptionJson(JSON.stringify(instance.getOption()));
        }}
        onEvents={{ finished: captureOption }}
        option={option}
      />
    </div>
  );
}

export function CustomMidlightChartRampStory(): ReactElement {
  return (
    <ThemeScope tokens={{ background: "oklch(0.63 0.01 60)" }} ambientBackground={TOKENS["color.background"].value}>
      <MidlightFiveCategoryChart />
    </ThemeScope>
  );
}

/** #939 cold-verifier accepted-input matrix: standards named color, alpha-composited bases, and an
 * extreme out-of-gamut OKLCH pick all mount through the real ThemeScope → token store → ECharts path. */
const ACCEPTED_CHART_CASES = [
  ["named", "red"],
  ["transparent", "oklch(0.98 0.004 75 / 0)"],
  ["partial-alpha", "oklch(0.98 0.004 75 / 0.35)"],
  ["extreme-gamut", "oklch(0.2 3.6 225)"],
] as const;

export function CustomAcceptedChartCasesStory(): ReactElement {
  const [caseIndex, setCaseIndex] = useState(0);
  const active = ACCEPTED_CHART_CASES[caseIndex] ?? ACCEPTED_CHART_CASES[0];
  const [name, background] = active;
  return (
    <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value}>
      <div {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }} data-case={name} data-testid="accepted-chart-panel" style={{ backgroundColor: "var(--color-card)" }}>
        <button onClick={(): void => setCaseIndex((current): number => (current + 1) % ACCEPTED_CHART_CASES.length)} type="button">
          Next accepted theme
        </button>
        <ChartThemeAxisLineReadoutStory />
        <BarList items={[{ id: name, label: name, value: 8 }]} label={`${name} chart`} />
      </div>
    </ThemeScope>
  );
}

/** #939 cold-refutation matrix: each authored background is CSS-valid but context-dependent, so it is
 * rejected before ThemeScope can derive a chart ramp from an unrelated ambient pixel. The outer `color`
 * recreates the hostile host that made currentColor white and system links/active text browser-specific. */
const REJECTED_CONTEXTUAL_CHART_CASES = [
  ["current-color", "currentColor", "white"],
  ["link-text", "LinkText", "LinkText"],
  ["active-text", "ActiveText", "ActiveText"],
] as const;

export function RejectedContextualChartCasesStory(): ReactElement {
  const [caseIndex, setCaseIndex] = useState(0);
  const active = REJECTED_CONTEXTUAL_CHART_CASES[caseIndex] ?? REJECTED_CONTEXTUAL_CHART_CASES[0];
  const [name, background, hostColor] = active;
  return (
    <div style={{ color: hostColor }}>
      <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value}>
        <div {...{ [LIVE_TOKEN_ROOT_ATTRIBUTE]: "" }} data-case={name} data-testid="contextual-chart-panel" style={{ backgroundColor: "var(--color-card)" }}>
          <button onClick={(): void => setCaseIndex((current): number => (current + 1) % REJECTED_CONTEXTUAL_CHART_CASES.length)} type="button">
            Next rejected theme
          </button>
          <ChartThemeAxisLineReadoutStory />
          <BarList items={[{ id: name, label: name, value: 8 }]} label={`${name} chart`} />
        </div>
      </ThemeScope>
    </div>
  );
}

/** A momentum column at its production floor: `MomentumColumn` is `min-w-48` (192px) inside a wrapping Row,
 *  so ~240px is the width the owner's two-column Momentum band actually renders at on a laptop. */
const NARROW_HOST_PX = 240;

/** `formatSignedDelta`'s shape (the analytics view-model) — the sign lives ONLY in this label. */
function signedDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** A wide bar-end label: the token counts the Models tab formats, at the width they actually take. */
function tokenCount(value: number): string {
  return `${value} tokens`;
}

/**
 * P1c — BOTH clipping faces in one production-shaped chart: a long character name on the y-axis and a real
 * bar-end value label, at the width a momentum column actually gets.
 *
 * Measured at HEAD (band 0.2–0.33 of the canvas): the name was cut off mid-word at x=0, the plot was 22px
 * of 240, and the value label ran off the right edge (last ink column 239 of 240) — "100 tokens" painted as
 * "100 to". The two faces share one cause: ECharts budgets AXIS labels only, and truncates nothing.
 */
export function ClippedValueLabelStory(): ReactElement {
  return (
    <div style={{ width: NARROW_HOST_PX }}>
      <BarList
        items={[
          { id: "a", label: "Morgatha of the Seven Winding Vales", value: 100 },
          { id: "b", label: "Imai", value: 40 },
        ]}
        label="Generations by model"
        valueFormatter={tokenCount}
      />
    </div>
  );
}

/** P1e — a SHORT series: the text equivalent must be there at every length, not only where it is large. */
export function ShortSeriesBarListStory(): ReactElement {
  return (
    <BarList
      items={[
        { id: "a", label: "Morgatha", value: 10 },
        { id: "b", label: "Kate", value: 8 },
        { id: "c", label: "Imai", value: 3 },
      ]}
      label="Rising"
      valueFormatter={signedDelta}
    />
  );
}

/** P1e — a LONG series: 20 rows, where a navigable table is the ONLY usable form of the reading. */
export function LongSeriesBarListStory(): ReactElement {
  return (
    <BarList
      items={Array.from({ length: 20 }, (_unused, index) => ({ id: `m${index}`, label: `Model ${index}`, value: 100 - index * 3 }))}
      label="Generations by model"
      valueFormatter={tokenCount}
    />
  );
}
