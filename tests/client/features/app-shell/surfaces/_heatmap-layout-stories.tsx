// Public scene geometry is read through Heatmap's existing ready callback, not ECharts model internals.
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { OrbEChartsInstance } from "@orb/ui/chart";
import { Heatmap } from "@orb/ui/heatmap";
import { Text } from "@orb/ui/text";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";

export function HeatmapLayoutStory({
  width,
  height,
  density = "comfortable",
  font = "Geist",
}: {
  readonly width: number;
  readonly height: number;
  readonly density?: ThemeScopeTokens["density"];
  readonly font?: ThemeScopeTokens["font"];
}): ReactElement {
  const [chart, setChart] = useState<OrbEChartsInstance | null>(null);
  const [snapshot, setSnapshot] = useState("");
  return (
    <CtIsolation
      subject="Heatmap paint separation"
      isolates="The public heatmap uses the measured production Insights chart host, without application state or a replacement renderer."
    >
      <ThemeScope tokens={{ density, font }}>
        <div data-live-token-root="" style={{ width }}>
          <Text voice="label" data-slot="heatmap-font-reference">
            Chart font
          </Text>
          <Heatmap
            label="Hourly paint bounds"
            height={height}
            matrix={{
              rows: Array.from({ length: 7 }, (_value, index) => `Row ${String(index)}`),
              cols: Array.from({ length: 24 }, (_value, index) => String(index).padStart(2, "0")),
              values: Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_value, index) => (index === 23 ? 137 : index))),
            }}
            onChartReady={setChart}
          />
          <Button
            disabled={chart === null}
            onClick={(): void => {
              if (chart === null) {
                throw new Error("The public chart has not become ready");
              }
              setSnapshot(
                JSON.stringify({
                  textStyle: chart.getOption()["textStyle"],
                  width: chart.getWidth(),
                  height: chart.getHeight(),
                  elements: chart
                    .getZr()
                    .storage.getDisplayList(true)
                    .map((element) => {
                      const bounds = element.getBoundingRect().clone();
                      bounds.applyTransform(element.getComputedTransform());
                      const text: unknown = element.style["text"];
                      return {
                        type: element.type,
                        text: typeof text === "string" ? text : null,
                        draggable: Boolean(element.draggable),
                        invisible: element.invisible,
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height,
                      };
                    }),
                }),
              );
            }}
          >
            Read paint bounds
          </Button>
          <output aria-label="Heatmap paint bounds">{snapshot}</output>
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
