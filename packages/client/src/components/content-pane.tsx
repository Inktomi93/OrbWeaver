// The CONTENT body template (UI-Architecture-and-Layout §4.1): the one scroller of a content body, the section inset inside it,
// one centred column, and an optional pinned band drawn across the pane with its content on that column.
//
// The scroller IS the pane box, so its scroll edge is the pane's edge and the wheel reaches it everywhere inside the pane.
// The inset is padding on the boxes INSIDE the scroller (the body and the band), never on the scroller or the shell region,
// so a band can span the pane while its content keeps the column.
//
// A body whose band lives under a provider the pane cannot hold (a `Tabs` root, an autosave session) lays the parts itself:
// `parts` in place of `children`, with `ContentPaneBand` and `ContentPaneBody` anywhere below, as long as no box between the
// scroller and a part adds an inset or a cap. The measure reaches the parts through context.
//
// The pane declares no tier: the editor, the settings pane or the dashboard inside it does, so no tier is declared twice.
// The pane declares no container: the shell region is the container, and every query inside the pane measures the pane.

import type { StackProps } from "@orb/ui/layout";
import { Stack } from "@orb/ui/layout";
import { mergeRefs, usePinnedBarCap } from "@orb/ui/lib";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { createContext, use, useRef } from "react";

/** A body that spans the pane names why, the way a planned section names its reason. */
interface FullMeasure {
  readonly full: string;
}

/** `column` is the editor column that breathes once the pane clears the `cq-64` step; `instrument` holds the narrow cap,
 *  for a body whose flexing cell is a control track; `full` spans the pane with a stated reason. */
export type ContentPaneMeasure = "column" | "instrument" | FullMeasure;

const MEASURE_CAPS = { column: "columnWide", instrument: "column" } as const satisfies Record<Exclude<ContentPaneMeasure, FullMeasure>, StackProps["cap"]>;

const PANE_INSETS = ["section", "block", "none"] as const;
/** The body's block inset: the section step a pane opens and ends with, the block step under a band, or none for a body that
 *  lays its own block rhythm. */
type PaneInset = (typeof PANE_INSETS)[number];

const MeasureContext = createContext<ContentPaneMeasure>("column");
MeasureContext.displayName = "ContentPaneMeasure";

function capOf(measure: ContentPaneMeasure): StackProps["cap"] {
  return typeof measure === "string" ? MEASURE_CAPS[measure] : undefined;
}

/** The column every part centres its content on. */
function Column({
  measure,
  gap,
  children,
}: {
  readonly measure: ContentPaneMeasure;
  readonly gap?: StackProps["gap"];
  readonly children: ReactNode;
}): ReactElement {
  const cap = capOf(measure);
  return (
    <Stack cap={cap} centred={cap !== undefined} gap={gap} grow="content" minWidth="shrinks" width="full">
      {children}
    </Stack>
  );
}

export interface ContentPaneBodyProps {
  readonly gap?: StackProps["gap"];
  readonly inset?: PaneInset;
  /** A body whose measure differs from the pane's, such as one view of a tabbed editor. */
  readonly measure?: ContentPaneMeasure;
  readonly children: ReactNode;
}

/** The pane's inset box and its column: what a body's content rides. */
export function ContentPaneBody({ gap, inset = "section", measure, children }: ContentPaneBodyProps): ReactElement {
  const paneMeasure = use(MeasureContext);
  return (
    // `grow` on the body and its column lets a short body fill the pane, so a centred empty state and a `height="fill"` child
    // resolve against the pane's height.
    <Stack
      data-slot="content-pane-body"
      grow="content"
      paddingBlock={inset === "none" ? undefined : inset}
      paddingInline="section"
      paddingInlineCramped="block"
    >
      <Column gap={gap} measure={measure ?? paneMeasure}>
        {children}
      </Column>
    </Stack>
  );
}

export interface ContentPaneBandProps extends Pick<ComponentProps<"div">, "ref"> {
  readonly gap?: StackProps["gap"];
  /** The most of the pane the band may take while it stays pinned; past it the band scrolls away with the content. */
  readonly maxShare?: number;
  readonly children: ReactNode;
}

/** The pinned band across the pane: the card ground and the hairline span the pane, the content rides the column. */
export function ContentPaneBand({ gap, maxShare, ref, children }: ContentPaneBandProps): ReactElement {
  const measure = use(MeasureContext);
  const bandRef = useRef<HTMLDivElement>(null);
  // Enlarged text grows the band with its copy while the pane does not: a band that would fill the pane stops pinning, so the
  // content under it can scroll clear.
  const pinned = usePinnedBarCap(bandRef, false, maxShare) === null;
  return (
    <Stack
      data-slot="content-pane-band"
      divider="bottom"
      ground="card"
      layer="raised"
      paddingBlock="block"
      paddingInline="section"
      paddingInlineCramped="block"
      placed={pinned ? "pinned" : undefined}
      ref={mergeRefs(ref, bandRef)}
    >
      <Column gap={gap} measure={measure}>
        {children}
      </Column>
    </Stack>
  );
}

type ScrollerProps = Omit<ComponentProps<"div">, "children" | "className" | "style">;

interface PaneCommon extends ScrollerProps {
  readonly measure?: ContentPaneMeasure;
  /** The scroller's edge fade, for a body whose content runs under the pane's edges. */
  readonly scrollFade?: StackProps["scrollFade"];
  /** A box under the scroller, on the column, that never scrolls away (a save receipt). */
  readonly foot?: ReactNode;
}

interface DrawnPane extends PaneCommon {
  readonly band?: ReactNode;
  readonly gap?: StackProps["gap"];
  readonly inset?: PaneInset;
  readonly children: ReactNode;
  readonly parts?: never;
}

interface LaidPane extends PaneCommon {
  /** The pane's content, laid with {@link ContentPaneBand} and {@link ContentPaneBody} by the caller. */
  readonly parts: ReactNode;
  readonly band?: never;
  readonly gap?: never;
  readonly inset?: never;
  readonly children?: never;
}

export type ContentPaneProps = DrawnPane | LaidPane;

/** One CONTENT body: the pane's scroller, its inset, its column and its band. */
export function ContentPane({
  measure = "column",
  foot,
  band,
  gap,
  inset = "section",
  scrollFade,
  children,
  parts,
  ...scroller
}: ContentPaneProps): ReactElement {
  const content = parts ?? (
    <>
      {band === undefined ? null : <ContentPaneBand>{band}</ContentPaneBand>}
      <ContentPaneBody gap={gap} inset={inset}>
        {children}
      </ContentPaneBody>
    </>
  );
  return (
    <MeasureContext value={measure}>
      {/* One tree whether or not a foot shows: a foot that comes and goes must never remount the scroller, which would drop its focus
          and its scroll position. */}
      <Stack height="fill" minHeight="shrinks">
        <Stack data-slot="content-pane" {...scroller} focusTarget={true} grow={true} scroll="y" scrollFade={scrollFade}>
          {content}
        </Stack>
        {foot === undefined ? null : (
          <Stack data-slot="content-pane-foot" paddingInline="section" paddingInlineCramped="block">
            <Column measure={measure}>{foot}</Column>
          </Stack>
        )}
      </Stack>
    </MeasureContext>
  );
}
