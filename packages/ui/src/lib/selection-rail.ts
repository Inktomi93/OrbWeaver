// SELECTION_RAIL — the app-wide SELECTED-ROW idiom, in ONE spelling: a 2px left ember rail plus a 10%
// `--color-primary` tint, keyed on `data-selected`, over a rail box that is always reserved (transparent at
// rest, so selecting a row never shifts its content by 2px and an unselected sibling holds the same column).
//
// OWNER-RATIFIED (2026-08-22, issue #485). The pair is the textbook shape of design-audit's two §6 absolute
// bans (`side-tab` + `border-accent-on-rounded`) and it fired on every list in the app — because it IS the
// app-wide selection idiom, not a decorative card tell. The owner ruled it stands as shipped; design-audit
// carries the matching SCOPED exemption, keyed on slot identity AND `data-selected` TOGETHER
// (tooling/src/ui-audit/ops/walker/core.ts `SELECTION_RAIL_SEL` + lib/checks-decor.ts).
//
// WHY IT IS A FRAGMENT AND NOT A LIST-ROW DETAIL (#1823). It was spelled three times — twice inside
// `list-row/variants.ts` (the `body` slot and the `rowTint:"row"` arm) and, from #1823, once more on the
// config BAND, which is a `Button` rather than a `ListRow` and therefore cannot inherit it by composition.
// A rail whose carriers each keep their own copy is a rail that drifts: the E2 selection-idiom collapse
// ("ring for a selected grid cell; left rail plus tint for a selected list row") is only true while every
// carrier paints the SAME two declarations, and the design-audit exemption above keys on that fact.
//
// CONSEQUENCE FOR ANYONE ADDING A CARRIER: the accent's carrier is part of the ratified exemption. A new
// element wearing this fragment owes a matching selector in `SELECTION_RAIL_SEL`, or the audit reports the
// idiom as a generated-UI tell on that element alone — a false positive against an owner ruling.
export const SELECTION_RAIL = "border-l-2 border-l-transparent data-selected:border-l-primary data-selected:bg-primary/10";
