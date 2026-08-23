// The row's CONTENT parts — the title line and the body's inner content. Split out of `list-row.tsx` when
// the rendered `titleQualifier` (#517) pushed the primitive past the 450-line `component-size-ui` cap: the
// seal (the props contract, the clickable-body wrapper, the collapse observer) stays there, and everything
// that lays out ONE row's text column lives here. Internal to the primitive — `index.ts` exports neither.

import type { ReactElement, ReactNode } from "react";
import type { listRowVariants } from "./variants.ts";

export type Slots = ReturnType<typeof listRowVariants>;

function subtitleStepAttribute(step: "default" | "label"): "label" | undefined {
  return step === "label" ? "label" : undefined;
}

/** The DOM ids of the row's describing spans (subtitle · meta · markers), for the body's
 *  `aria-describedby`. Undefined-when-absent so callers space-join only the present ones (empty ⇒ no attr). */
export interface ListRowDescriptors {
  subtitleId: string | undefined;
  metaId: string | undefined;
  markersId: string | undefined;
}

/** THE TITLE LINE — the name, its `titleQualifier`, the `inline` subtitle arm, the rest-visible markers and
 *  the trailing meta. Its own component because the row's content grew past the complexity cap when the
 *  qualifier landed (#517), and because this line is one idea: everything that identifies the row.
 *
 *  `data-title-step` is READ BY THE TIER MAP (tiers.css), not by a utility: the tier rule that sets the
 *  title's font-size is unlayered and outranks any class the variant could add inside a `<Surface>`. The
 *  variant's class is the tier-less fallback for a row rendered outside every Surface. */
function ListRowTitleLine({
  slots,
  clickable,
  title,
  fullTitle,
  titleStep,
  titleQualifier,
  inlineSubtitle,
  markers,
  meta,
  ids,
}: {
  slots: Slots;
  clickable: boolean;
  title: string;
  fullTitle: string | undefined;
  titleStep: "default" | "promoted";
  titleQualifier: string | undefined;
  inlineSubtitle: ReactNode;
  markers: ReactNode;
  meta: string | undefined;
  ids: ListRowDescriptors;
}): ReactElement {
  return (
    <span className={slots.titleRow()} data-slot="list-row-title-row">
      <span
        aria-hidden={clickable ? true : undefined}
        className={slots.title()}
        data-slot="list-row-title"
        data-title-step={titleStep === "promoted" ? "promoted" : undefined}
        title={fullTitle ?? title}
      >
        {title}
      </span>
      {/* THE DISAMBIGUATOR, RENDERED (#517). `aria-hidden` on a clickable row exactly like the title beside
          it: both are the body's `aria-label`, and repeating either as content would double the name. The
          separator AND its leading space live inside this span so the line's text is `"<title> ·
          <qualifier>"` — character-for-character the accessible name (adjacent inline nodes concatenate
          with NO separator, the same reason `subtitleLead` carries its own space). */}
      {titleQualifier === undefined ? null : (
        <span aria-hidden={clickable ? true : undefined} className={slots.titleQualifier()} data-slot="list-row-title-qualifier">
          {` · ${titleQualifier}`}
        </span>
      )}
      {/* INLINE: the scent rides the title line, taking the flexing column so the NAME keeps its floor. */}
      {inlineSubtitle}
      {markers === undefined ? null : (
        <span className={slots.markers()} data-slot="list-row-markers" id={ids.markersId}>
          {markers}
        </span>
      )}
      {meta === undefined ? null : (
        <span className={slots.meta()} data-slot="list-row-meta" id={ids.metaId}>
          {meta}
        </span>
      )}
    </span>
  );
}

/** The body's inner content — strictly phrasing content so it's valid inside the clickable button. On a
 *  CLICKABLE row the title is `aria-hidden` because it backs the body's `aria-label` (repeating it as
 *  content would double the name); subtitle + meta stay visible AND carry ids the body's
 *  `aria-describedby` points at, so a screen reader hears "<title>, <subtitle> <meta>" — the name is the
 *  title alone, the rest a description.
 *
 *  A NON-CLICKABLE row is the opposite case and the hide was unconditional (side-eye 2026-08-06): a static
 *  `<div>` body carries no role, no `aria-label` and no `aria-describedby`, so hiding its title deleted the
 *  row's only accessible name — measured on the chat rack, where five rows announced their byte size and
 *  never the document they belonged to. The hide is therefore keyed to the very thing that supplies the
 *  replacement name. */
export function ListRowContent({
  slots,
  clickable,
  leading,
  title,
  fullTitle,
  subtitle,
  subtitleLead,
  subtitleReveal,
  subtitleInline,
  subtitleDecorative,
  subtitleStep,
  meta,
  markers,
  titleStep,
  titleQualifier,
  ids,
}: {
  slots: Slots;
  clickable: boolean;
  leading: ReactNode;
  title: string;
  titleStep: "default" | "promoted";
  titleQualifier: string | undefined;
  fullTitle: string | undefined;
  subtitle: string | undefined;
  subtitleLead: ReactNode;
  subtitleReveal: string | undefined;
  subtitleInline: boolean;
  subtitleDecorative: boolean;
  subtitleStep: "default" | "label";
  meta: string | undefined;
  markers: ReactNode;
  ids: ListRowDescriptors;
}): ReactElement {
  // The subtitle YIELDS on hover/focus only when a reveal is present, so the reveal takes the exact line.
  // VISIBILITY, not display: both spans share one grid cell (`subtitleStack`), so the line's box is the max
  // of the two and never changes under the pointer (gate `no-hover-display-swap`).
  const subtitleSwap = subtitleReveal === undefined ? "" : "col-start-1 row-start-1 group-hover:invisible group-focus-within:invisible";
  const subtitleSpan =
    subtitle === undefined ? null : (
      <span
        aria-hidden={subtitleDecorative ? true : undefined}
        className={slots.subtitle({ className: subtitleSwap })}
        data-slot="list-row-subtitle"
        data-subtitle-step={subtitleStepAttribute(subtitleStep)}
        id={ids.subtitleId}
        title={subtitle}
      >
        {subtitleLead}
        {/* A literal space between the chip and the scent: the accessible-description computation
            concatenates adjacent inline nodes with NO separator, so a screen reader heard
            "IndexingWiki · 91.7 KB" until this text node existed. Visual spacing is the chip's own margin. */}
        {subtitleLead === undefined ? null : " "}
        {subtitle}
      </span>
    );
  // ONE span, TWO possible parents (the `inline` arm puts it on the title line). Resolved to two nullable
  // nodes here so each render site is a bare expression, never a ternary whose alternate is a variable.
  const inlineSubtitle = subtitleInline ? subtitleSpan : null;
  const blockSubtitle = subtitleInline ? null : subtitleSpan;
  return (
    <>
      {leading === undefined ? null : (
        // Decorative — the title backs the accessible name. aria-hidden keeps a fallback avatar's
        // initials (or an image's alt) from leaking into the name.
        <span className={slots.leading()} data-slot="list-row-leading" aria-hidden={true}>
          {leading}
        </span>
      )}
      <span className={slots.content()} data-slot="list-row-content">
        <ListRowTitleLine
          clickable={clickable}
          fullTitle={fullTitle}
          ids={ids}
          inlineSubtitle={inlineSubtitle}
          markers={markers}
          meta={meta}
          slots={slots}
          title={title}
          titleQualifier={titleQualifier}
          titleStep={titleStep}
        />
        {subtitleReveal === undefined ? (
          blockSubtitle
        ) : (
          // ONE grid cell, TWO stacked spans — the reveal swaps in by visibility without moving the line.
          <span className={slots.subtitleStack()} data-slot="list-row-subtitle-stack">
            {blockSubtitle}
            <span aria-hidden={true} className={slots.subtitleReveal()} data-slot="list-row-subtitle-reveal" title={subtitleReveal}>
              {subtitleReveal}
            </span>
          </span>
        )}
      </span>
    </>
  );
}
