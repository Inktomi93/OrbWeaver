import { tv } from "#lib";

// The data-series line skin (mirrors the mock's `.prow`): swatch · label/detail · trailing value.
// ONE vertical rhythm (`py-field` — instrument density): no `density` prop, because layout-context props are
// gate-banned (ESLint layout-attribute restrictions in `eslint.config.js`) — the container model + the `data-density` attribute own that axis.
export const seriesRowVariants = tv({
  slots: {
    // `text-start` is load-bearing: the row is DESIGNED to sit inside a `<button>` trigger, and a button's
    // UA default is `text-align: center` — without this the whole row centres itself.
    root: "flex items-center gap-row py-field text-start text-label leading-label inline-full min-inline-0",
    // A small square keyed to the bar's segment — decoration, sized off the `row` spacing intent.
    swatch: "shrink-0 rounded-control block-row inline-row",
    content: "flex flex-1 flex-col min-inline-0",
    label: "truncate text-foreground",
    detail: "truncate text-micro leading-micro text-muted-foreground",
    value: "shrink-0 text-muted-foreground tabular-nums",
  },
  variants: {
    // A hairline ABOVE the row — the separator lives on the row itself (not a wrapper) so a stack of rows
    // reads as one ruled list even when each row is wrapped in its own disclosure.
    divider: { true: { root: "border-bs border-border" } },
  },
});
