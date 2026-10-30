// The public Heatmap paints through its production renderer; the browser's own 2D canvas is the color oracle.
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { OrbEChartsInstance } from "@orb/ui/chart";
import { Heatmap } from "@orb/ui/heatmap";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

type Point = readonly [number, number];

function hasColorStops(fill: unknown): boolean {
  return typeof fill === "object" && fill !== null && "colorStops" in fill;
}

// Sample the legend ramp clear of the calculable handles, which paint over both bar ends.
function rampSamples(chart: OrbEChartsInstance): Point[] {
  const shapes = chart
    .getZr()
    .storage.getDisplayList(true)
    .filter((element) => !element.invisible)
    .map((element) => {
      const bounds = element.getBoundingRect().clone();
      bounds.applyTransform(element.getComputedTransform());
      return { bounds, ramp: hasColorStops(element.style["fill"]), handle: element.draggable === true };
    });
  const bar = shapes.find((shape) => shape.ramp)?.bounds;
  if (bar === undefined) {
    throw new Error("The legend gradient is not painted");
  }
  const center = bar.x + bar.width / 2;
  const handles = shapes.filter((shape) => shape.handle && !shape.ramp).map((shape) => shape.bounds);
  const start = Math.max(bar.x, ...handles.filter((handle) => handle.x < center).map((handle) => handle.x + handle.width)) + 1;
  const end = Math.min(bar.x + bar.width, ...handles.filter((handle) => handle.x > center).map((handle) => handle.x)) - 1;
  const y = bar.y + bar.height / 2;
  return [
    [start, y],
    [(start + end) / 2, y],
    [end, y],
  ];
}

interface NativePaint {
  readonly css: string;
  readonly pixel: number[];
}

// A CSS color value (a token reference or a computed color) painted by the browser's own canvas parser,
// independent of zrender.
function nativePaint(host: HTMLElement, value: string): NativePaint {
  const reference = host.ownerDocument.createElement("canvas");
  reference.width = 1;
  reference.height = 1;
  const context = reference.getContext("2d");
  if (context === null) {
    throw new Error("The native color oracle needs a 2D canvas");
  }
  const probe = host.ownerDocument.createElement("span");
  probe.style.color = value;
  host.append(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  return { css, pixel: [...context.getImageData(0, 0, 1, 1).data] };
}

// The tooltip ECharts mounts inside the chart's DOM: the one absolutely positioned div it paints a background on.
function tooltipPaint(host: HTMLElement, chart: OrbEChartsInstance): { readonly background: NativePaint; readonly text: NativePaint } | null {
  const tooltip = [...chart.getDom().querySelectorAll("div")].find((element) => element.style.position === "absolute" && element.style.backgroundColor !== "");
  return tooltip === undefined
    ? null
    : { background: nativePaint(host, tooltip.style.backgroundColor), text: nativePaint(host, getComputedStyle(tooltip).color) };
}

/** Custom-theme CSS declarations on the live-token root, the cascade position a user's theme stylesheet reaches. */
type TokenOverrides = Readonly<Record<`--${string}`, string>>;

export function HeatmapPaintStory({
  tokens = {},
  overrides = {},
  width,
}: {
  readonly tokens?: ThemeScopeTokens;
  readonly overrides?: TokenOverrides;
  readonly width: number;
}): ReactElement {
  const [chart, setChart] = useState<OrbEChartsInstance | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const root = useRef<HTMLDivElement>(null);
  return (
    <CtIsolation
      subject="Heatmap renderer color boundary"
      isolates="The public Heatmap and its production ECharts renderer inside a live ThemeScope; no application state is needed to prove token paint."
    >
      <ThemeScope tokens={tokens}>
        <div ref={root} data-live-token-root="" style={{ ...overrides, width }}>
          <Heatmap
            label="Intensity paint"
            height={240}
            matrix={{ rows: ["Only"], cols: ["Low", "Mid", "High"], values: [[0, 50, 100]] }}
            onChartReady={setChart}
          />
          <Button
            disabled={chart === null}
            onClick={(): void => {
              const host = root.current;
              if (chart === null || host === null) {
                throw new Error("The public chart has not become ready");
              }
              const native = (cssVar: string): NativePaint => nativePaint(host, `var(${cssVar})`);
              const cells = [0, 1, 2].map((col): Point => {
                const [x, y] = chart.convertToPixel({ seriesIndex: 0 }, [col, 0]);
                if (x === undefined || y === undefined) {
                  throw new Error("The heatmap cell has no pixel position");
                }
                return [x, y];
              });
              const stops = rampSamples(chart);
              // Each renderer layer read on its own, so a defect in one layer's compositing cannot hide another's paint.
              const layers = [...chart.getDom().querySelectorAll("canvas")].map((canvas) => {
                const layer = canvas.getContext("2d");
                if (layer === null) {
                  throw new Error("A renderer canvas has no 2D context");
                }
                const at = ([x, y]: Point): number[] => [
                  ...layer.getImageData(Math.floor((x * canvas.width) / chart.getWidth()), Math.floor((y * canvas.height) / chart.getHeight()), 1, 1).data,
                ];
                return { cells: cells.map(at), stops: stops.map(at) };
              });
              setSnapshot(
                JSON.stringify({
                  series: native(TOKENS["color.chart-1"].cssVar),
                  border: native(TOKENS["color.border"].cssVar),
                  muted: native(TOKENS["color.muted"].cssVar),
                  popover: native(TOKENS["color.popover"].cssVar),
                  popoverText: native(TOKENS["color.popover-foreground"].cssVar),
                  tooltip: tooltipPaint(host, chart),
                  cells,
                  stops,
                  layers,
                }),
              );
            }}
          >
            Read heatmap paint
          </Button>
          <Button
            disabled={chart === null}
            onClick={(): void => {
              // The legend's calculable range narrowed to its minimum, as a user dragging both handles would: the
              // rest of the bar is the inactive track, unobscured by the in-range ramp.
              chart?.dispatchAction({ type: "selectDataRange", visualMapIndex: 0, selected: [0, 0] });
            }}
          >
            Narrow heatmap legend
          </Button>
          <output aria-label="Heatmap paint">{snapshot}</output>
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
