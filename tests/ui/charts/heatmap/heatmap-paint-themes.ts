// Theme inputs for the heatmap paint suite. The user-authored entries are deliberately not tokens: the
// renderer boundary must convert any color a carried base or a custom theme stylesheet can make the cascade compute.
import { TOKEN_POLARITY_ARMS, TOKENS } from "@orb/ui/tokens";

export const HEATMAP_PAINT_THEMES = [
  { name: "dark", mode: "dark", tokens: {}, overrides: {} },
  { name: "light", mode: "light", tokens: {}, overrides: {} },
  // A carried base derives its own chart ramp and border through relative-color syntax.
  {
    name: "custom",
    mode: "dark",
    tokens: { background: TOKENS["color.foreground"].value, accent: TOKEN_POLARITY_ARMS["color.chart-3"].light },
    overrides: {},
  },
  // An achromatic sRGB base: WebKit serializes the derived relative colors with a `none` hue.
  { name: "grey-base", mode: "dark", tokens: { background: "#1e1e1e" }, overrides: {} },
  // A custom theme stylesheet may declare any color the browser computes, including wide-gamut and Lab forms.
  {
    name: "wide-gamut",
    mode: "dark",
    tokens: {},
    overrides: {
      [TOKENS["color.chart-1"].cssVar]: "color(display-p3 0.95 0.35 0.1)",
      [TOKENS["color.border"].cssVar]: "lab(85 0 0 / 0.1)",
      [TOKENS["color.muted-foreground"].cssVar]: "color-mix(in srgb, white 70%, blue)",
    },
  },
] as const;
