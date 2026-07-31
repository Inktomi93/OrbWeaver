import { tv } from "#lib";

// The data-series line skin (panel-redesign preview.html `.prow`): swatch · label/detail · trailing value.
// ONE vertical rhythm (`py-field` — instrument density): no `density` prop, because layout-context props are
// gate-banned (`no-layout-context-props`) — the container model + the `data-density` attribute own that axis.
export const seriesRowVariants = tv({
  slots: {
    // `text-start` is load-bearing: the row is DESIGNED to sit inside a `<button>` trigger, and a button's
    // UA default is `text-align: center` — without this the whole row centres itself.
    root: "flex w-full min-w-0 items-center gap-row py-field text-start text-label leading-label",
    // A small square keyed to the bar's segment — decoration, sized off the `row` spacing intent.
    swatch: "size-row shrink-0 rounded-control",
    content: "flex min-w-0 flex-1 flex-col",
    label: "truncate text-foreground",
    detail: "truncate text-micro leading-label text-muted-foreground",
    value: "shrink-0 tabular-nums text-muted-foreground",
  },
  variants: {
    // A hairline ABOVE the row — the separator lives on the row itself (not a wrapper) so a stack of rows
    // reads as one ruled list even when each row is wrapped in its own disclosure.
    divider: { true: { root: "border-border border-t" } },
  },
});
