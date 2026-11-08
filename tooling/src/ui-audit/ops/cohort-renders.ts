// The rendered cohort comparison: each census cohort member's box and a pixel fingerprint of its perimeter ring,
// compared with the same majority rule the source-level ui-facts cohorts use. A ring that is not one colour is
// refused, so that member stays incomplete instead of counting as a match.
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Rgb } from "../../floor/instrument/pixel-backdrop.ts";
import { uniformRingBackdropOfRegion } from "../../floor/instrument/pixel-backdrop.ts";
import type { Cohort, Comparison } from "../../floor/verdict/cohort-compare.ts";
import { compareCohort, NOT_APPLICABLE } from "../../floor/verdict/cohort-compare.ts";
import type { CohortAnatomyInput, CohortMemberRender, CohortMemberState, RawSamples } from "../contract/samples.ts";
import type { PixelRaw } from "../lib/pixel-regions.ts";
import { viewportPixels } from "./pixels.ts";

refuseDirectInvocation(import.meta.url, "pnpm e2e:surface");

const REST_STATE = "rest" satisfies CohortMemberState;
const FINGERPRINT_COLUMN = "ring";
// One hex digit per channel: identical members at different subpixel offsets blend their edge rows by a few levels.
const CHANNEL_QUANTUM = 16;
const HEX_RADIX = 16;
/** The fingerprint of a member whose edge shows its parent's backdrop. */
const BACKDROP_FINGERPRINT = "backdrop";

export type CohortMemberFingerprint = { readonly status: "measured"; readonly ring: string } | { readonly status: "incomplete"; readonly reason: string };

export interface CohortRenderMember extends CohortMemberRender {
  readonly fingerprint: CohortMemberFingerprint;
}

export interface CohortRender {
  readonly parent: string;
  readonly cohortKey: string;
  readonly members: readonly CohortRenderMember[];
  /** `divergent` names outliers; `uniform` is every compared member on one fingerprint; `no-verdict` is a tie or fewer than two. */
  readonly verdict: "divergent" | "uniform" | "no-verdict";
  readonly comparisons: readonly Comparison[];
}

function quantized({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.floor(channel / CHANNEL_QUANTUM).toString(HEX_RADIX)).join("")}`;
}

// Within one quantum per channel: the band outside and the ring inside sit a few pixels apart over a soft backdrop.
function sameColour(a: Rgb, b: Rgb): boolean {
  return Math.abs(a.r - b.r) < CHANNEL_QUANTUM && Math.abs(a.g - b.g) < CHANNEL_QUANTUM && Math.abs(a.b - b.b) < CHANNEL_QUANTUM;
}

function fingerprintOf(raw: PixelRaw, member: CohortMemberRender): CohortMemberFingerprint {
  if (member.state !== REST_STATE) {
    return { status: "incomplete", reason: `member paints its ${member.state} state, not the resting anatomy` };
  }
  // Whole pixels inside the box only: a fractional edge pixel blends in the parent's backdrop.
  const left = Math.ceil(member.x);
  const top = Math.ceil(member.y);
  const region = { left, top, width: Math.floor(member.x + member.width) - left, height: Math.floor(member.y + member.height) - top };
  if (left < 0 || top < 0 || region.width < 1 || region.height < 1 || left + region.width > raw.info.width || top + region.height > raw.info.height) {
    return { status: "incomplete", reason: "member box is not wholly inside the viewport screenshot" };
  }
  // The corner squares hold the parent's backdrop behind a rounded corner, so the ring reads only the straight edges.
  // A member round enough to leave no straight edge falls back to the whole ring, which then refuses as not one colour.
  const corner = Math.ceil(member.radiusPx);
  const marks =
    corner === 0
      ? []
      : [
          { left: 0, top: 0, width: corner, height: corner },
          { left: region.width - corner, top: 0, width: corner, height: corner },
          { left: 0, top: region.height - corner, width: corner, height: corner },
          { left: region.width - corner, top: region.height - corner, width: corner, height: corner },
        ];
  const ring = uniformRingBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, { ...region, marks });
  if (ring === null) {
    return { status: "incomplete", reason: "perimeter ring is not one colour" };
  }
  // The one-pixel band just outside the box is the parent's backdrop there. A member that paints no edge of its own shows
  // that backdrop in its ring, and over chat art the backdrop changes from member to member.
  const surround = {
    left: Math.floor(member.x) - 1,
    top: Math.floor(member.y) - 1,
    right: Math.ceil(member.x + member.width) + 1,
    bottom: Math.ceil(member.y + member.height) + 1,
  };
  if (surround.left < 0 || surround.top < 0 || surround.right > raw.info.width || surround.bottom > raw.info.height) {
    return { status: "incomplete", reason: "the band around the member box is not wholly inside the viewport screenshot" };
  }
  const outer = { left: surround.left, top: surround.top, width: surround.right - surround.left, height: surround.bottom - surround.top };
  const backdrop = uniformRingBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, {
    ...outer,
    marks: [{ left: 1, top: 1, width: outer.width - 2, height: outer.height - 2 }],
  });
  if (backdrop === null) {
    return { status: "incomplete", reason: "the backdrop around the member is not one colour" };
  }
  return { status: "measured", ring: sameColour(ring, backdrop) ? BACKDROP_FINGERPRINT : quantized(ring) };
}

function compared(anatomy: CohortAnatomyInput, members: readonly CohortRenderMember[]): Cohort {
  const cell = (value: string, index: number): { readonly value: string; readonly line: number } => ({ value, line: index + 1 });
  return {
    name: anatomy.cohortKey,
    what: `rendered members under ${anatomy.selector}`,
    columns: [FINGERPRINT_COLUMN],
    info: ["width", "height", "state"],
    basis: { [FINGERPRINT_COLUMN]: "measured", width: "measured", height: "measured", state: "measured" },
    members: members.map((member, index) => ({
      path: member.selector,
      section: anatomy.selector,
      label: member.state,
      cells: {
        [FINGERPRINT_COLUMN]: cell(member.fingerprint.status === "measured" ? member.fingerprint.ring : NOT_APPLICABLE, index),
        width: cell(String(Math.round(member.width)), index),
        height: cell(String(Math.round(member.height)), index),
        state: cell(member.state, index),
      },
    })),
  };
}

function verdictOf(comparisons: readonly Comparison[]): CohortRender["verdict"] {
  const ring = comparisons.find(({ column }) => column === FINGERPRINT_COLUMN);
  if (ring === undefined || ring.total < 2 || ring.tied) {
    return "no-verdict";
  }
  return ring.outliers.length === 0 ? "uniform" : "divergent";
}

/** Fingerprint every census cohort member from one viewport screenshot taken where the census read the boxes. */
export async function readCohortRenders(
  page: Page,
  samples: RawSamples,
): Promise<{ readonly cohorts: readonly CohortRender[]; readonly error: string | null }> {
  const anatomies = samples.cohortAnatomies ?? [];
  if (anatomies.length === 0) {
    return { cohorts: [], error: null };
  }
  const raw = await viewportPixels(page);
  const cohorts = anatomies.map((anatomy): CohortRender => {
    const members = anatomy.memberRenders.map(
      (member): CohortRenderMember => ({
        ...member,
        fingerprint: "error" in raw ? { status: "incomplete", reason: `viewport screenshot unavailable (${raw.error})` } : fingerprintOf(raw, member),
      }),
    );
    const comparisons = compareCohort(compared(anatomy, members));
    return { parent: anatomy.selector, cohortKey: anatomy.cohortKey, members, verdict: verdictOf(comparisons), comparisons };
  });
  return { cohorts, error: "error" in raw ? raw.error : null };
}
