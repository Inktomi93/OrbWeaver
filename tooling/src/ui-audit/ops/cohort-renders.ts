// The rendered cohort comparison: each census cohort member's box and the colours of its outer edge and the fill just inside
// it, compared with the same majority rule the source-level ui-facts cohorts use. A band that is not one colour is refused,
// so that member stays incomplete instead of counting as a match.
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { PixelRect, Rgb } from "../../floor/instrument/pixel-backdrop.ts";
import { uniformRingBackdropOfRegion } from "../../floor/instrument/pixel-backdrop.ts";
import type { Cohort, Comparison } from "../../floor/verdict/cohort-compare.ts";
import { compareCohort, NOT_APPLICABLE } from "../../floor/verdict/cohort-compare.ts";
import type { CohortAnatomyInput, CohortMemberRender, CohortMemberState, RawSamples } from "../contract/samples.ts";
import type { PixelRaw } from "../lib/pixel-regions.ts";
import { viewportPixels } from "./pixels.ts";

refuseDirectInvocation(import.meta.url, "pnpm e2e:surface");

const REST_STATE = "rest" satisfies CohortMemberState;
const EDGE_COLUMN = "edge";
const FILL_COLUMN = "fill";
const BAND_COLUMNS = [EDGE_COLUMN, FILL_COLUMN] as const;
/** The edge value of a member whose outer pixel shows its parent's backdrop. */
const BACKDROP_PAINT = "backdrop";
/** The fill value of a member whose inner band repeats its edge colour. */
const EDGE_PAINT = "edge";
// Two colours count as one when every channel is within this many levels. The closest seed-theme surface tokens sit about
// five levels apart, and whole pixels inside the box carry no anti-aliasing, so identical members read identical values.
const SAME_COLOUR_LEVELS = 2;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;
// An edge band and a fill band each need a pixel on both sides, plus one pixel between them.
const MIN_BANDED_PX = 5;

type CohortMemberFingerprint =
  | { readonly status: "measured"; readonly edge: string; readonly fill: string }
  | { readonly status: "incomplete"; readonly reason: string };

interface CohortRenderMember extends CohortMemberRender {
  readonly fingerprint: CohortMemberFingerprint;
}

export interface CohortRender {
  readonly parent: string;
  readonly cohortKey: string;
  readonly members: readonly CohortRenderMember[];
  /** `divergent` names outliers in either band; `uniform` is every compared member on one paint; `no-verdict` is a tie or fewer than two. */
  readonly verdict: "divergent" | "uniform" | "no-verdict";
  readonly comparisons: readonly Comparison[];
}

type BandPaint = { readonly kind: "token"; readonly value: string } | { readonly kind: "colour"; readonly rgb: Rgb };
type MemberPaint =
  | { readonly status: "measured"; readonly edge: BandPaint; readonly fill: BandPaint }
  | { readonly status: "incomplete"; readonly reason: string };

function sameColour(a: Rgb, b: Rgb): boolean {
  return Math.abs(a.r - b.r) <= SAME_COLOUR_LEVELS && Math.abs(a.g - b.g) <= SAME_COLOUR_LEVELS && Math.abs(a.b - b.b) <= SAME_COLOUR_LEVELS;
}

function hex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(HEX_RADIX).padStart(HEX_DIGITS, "0")).join("")}`;
}

// The 1px band at the outside of `rect`, leaving out a `corner`-sized square at each corner where a rounded member shows
// the parent's backdrop. A rect too small to keep any straight edge falls back to the whole band, which then refuses.
function bandColour(raw: PixelRaw, rect: PixelRect, corner: number): Rgb | null {
  const interior = { left: 1, top: 1, width: rect.width - 2, height: rect.height - 2 };
  const corners =
    corner <= 0
      ? []
      : [
          { left: 0, top: 0, width: corner, height: corner },
          { left: rect.width - corner, top: 0, width: corner, height: corner },
          { left: 0, top: rect.height - corner, width: corner, height: corner },
          { left: rect.width - corner, top: rect.height - corner, width: corner, height: corner },
        ];
  return uniformRingBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, { ...rect, marks: [interior, ...corners] });
}

const inset = (rect: PixelRect, by: number): PixelRect => ({
  left: rect.left + by,
  top: rect.top + by,
  width: rect.width - 2 * by,
  height: rect.height - 2 * by,
});

function paintOf(raw: PixelRaw, member: CohortMemberRender): MemberPaint {
  if (member.state !== REST_STATE) {
    return { status: "incomplete", reason: `member paints its ${member.state} state, not the resting anatomy` };
  }
  // Chromium paints backgrounds and borders on the pixel-snapped rect, each edge rounded to the nearest pixel, so the
  // snapped rect's outer pixel is the member's own edge and the pixel beyond it is the parent's backdrop.
  const left = Math.round(member.x);
  const top = Math.round(member.y);
  const box = { left, top, width: Math.round(member.x + member.width) - left, height: Math.round(member.y + member.height) - top };
  const outer = inset(box, -1);
  if (
    outer.left < 0 ||
    outer.top < 0 ||
    outer.left + outer.width > raw.info.width ||
    outer.top + outer.height > raw.info.height ||
    box.width < MIN_BANDED_PX ||
    box.height < MIN_BANDED_PX
  ) {
    return { status: "incomplete", reason: "member box and the band around it are not wholly inside the viewport screenshot" };
  }
  const corner = Math.ceil(member.radiusPx);
  const edge = bandColour(raw, box, corner);
  if (edge === null) {
    return { status: "incomplete", reason: "edge band is not one colour" };
  }
  const fill = bandColour(raw, inset(box, 1), corner - 1);
  if (fill === null) {
    return { status: "incomplete", reason: "fill band is not one colour" };
  }
  const backdrop = bandColour(raw, outer, 0);
  if (backdrop === null) {
    return { status: "incomplete", reason: "the backdrop around the member is not one colour" };
  }
  // Relative values keep a transparent member over changing art on one fingerprint: its edge is the local backdrop.
  return {
    status: "measured",
    edge: sameColour(edge, backdrop) ? { kind: "token", value: BACKDROP_PAINT } : { kind: "colour", rgb: edge },
    fill: sameColour(fill, edge) ? { kind: "token", value: EDGE_PAINT } : { kind: "colour", rgb: fill },
  };
}

// One label per group of colours within the tolerance, so two near-identical colours never split on a bucket boundary.
function clusterLabels(colours: readonly Rgb[]): string[] {
  const representatives: Rgb[] = [];
  return colours.map((colour) => {
    const match = representatives.find((representative) => sameColour(representative, colour));
    if (match !== undefined) {
      return hex(match);
    }
    representatives.push(colour);
    return hex(colour);
  });
}

function bandLabels(paints: readonly MemberPaint[], column: (typeof BAND_COLUMNS)[number]): string[] {
  const bands = paints.map((paint) => (paint.status === "measured" ? paint[column] : null));
  const colours = clusterLabels(bands.flatMap((band) => (band?.kind === "colour" ? [band.rgb] : [])));
  let next = 0;
  return bands.map((band) => {
    if (band === null) {
      return NOT_APPLICABLE;
    }
    if (band.kind === "token") {
      return band.value;
    }
    const label = colours[next] ?? hex(band.rgb);
    next += 1;
    return label;
  });
}

function fingerprints(paints: readonly MemberPaint[]): CohortMemberFingerprint[] {
  const edges = bandLabels(paints, EDGE_COLUMN);
  const fills = bandLabels(paints, FILL_COLUMN);
  return paints.map((paint, index) =>
    paint.status === "incomplete" ? paint : { status: "measured", edge: edges[index] ?? NOT_APPLICABLE, fill: fills[index] ?? NOT_APPLICABLE },
  );
}

function compared(anatomy: CohortAnatomyInput, members: readonly CohortRenderMember[]): Cohort {
  const cell = (value: string, index: number): { readonly value: string; readonly line: number } => ({ value, line: index + 1 });
  return {
    name: anatomy.cohortKey,
    what: `rendered members under ${anatomy.selector}`,
    columns: [...BAND_COLUMNS],
    info: ["width", "height", "state"],
    basis: { [EDGE_COLUMN]: "measured", [FILL_COLUMN]: "measured", width: "measured", height: "measured", state: "measured" },
    members: members.map(({ fingerprint, ...member }, index) => ({
      path: member.selector,
      section: anatomy.selector,
      label: member.state,
      cells: {
        [EDGE_COLUMN]: cell(fingerprint.status === "measured" ? fingerprint.edge : NOT_APPLICABLE, index),
        [FILL_COLUMN]: cell(fingerprint.status === "measured" ? fingerprint.fill : NOT_APPLICABLE, index),
        width: cell(String(Math.round(member.width)), index),
        height: cell(String(Math.round(member.height)), index),
        state: cell(member.state, index),
      },
    })),
  };
}

function verdictOf(comparisons: readonly Comparison[]): CohortRender["verdict"] {
  const bands = comparisons.filter(({ column }) => (BAND_COLUMNS as readonly string[]).includes(column));
  if (bands.some(({ outliers }) => outliers.length > 0)) {
    return "divergent";
  }
  return bands.length === BAND_COLUMNS.length && bands.every(({ total, tied }) => total >= 2 && !tied) ? "uniform" : "no-verdict";
}

/** Fingerprint every census cohort member from one viewport screenshot taken where the census read the boxes. */
export async function readCohortRenders(
  page: Pick<Page, "screenshot">,
  samples: Pick<RawSamples, "cohortAnatomies">,
): Promise<{ readonly cohorts: readonly CohortRender[]; readonly error: string | null }> {
  const anatomies = samples.cohortAnatomies;
  if (anatomies === undefined) {
    return { cohorts: [], error: "the design census returned no cohort list" };
  }
  if (anatomies.length === 0) {
    return { cohorts: [], error: null };
  }
  const raw = await viewportPixels(page);
  const cohorts = anatomies.map((anatomy): CohortRender => {
    const paints = anatomy.memberRenders.map(
      (member): MemberPaint => ("error" in raw ? { status: "incomplete", reason: `viewport screenshot unavailable (${raw.error})` } : paintOf(raw, member)),
    );
    const prints = fingerprints(paints);
    const members = anatomy.memberRenders.map(
      (member, index): CohortRenderMember => ({ ...member, fingerprint: prints[index] ?? { status: "incomplete", reason: "member was not fingerprinted" } }),
    );
    const comparisons = compareCohort(compared(anatomy, members));
    return { parent: anatomy.selector, cohortKey: anatomy.cohortKey, members, verdict: verdictOf(comparisons), comparisons };
  });
  return { cohorts, error: "error" in raw ? raw.error : null };
}
