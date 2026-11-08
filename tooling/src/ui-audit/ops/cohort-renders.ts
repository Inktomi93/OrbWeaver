// The rendered cohort comparison: each census cohort member's box and a pixel fingerprint of its perimeter ring,
// compared with the same majority rule the source-level ui-facts cohorts use. A ring that is not one colour is
// refused, so that member stays incomplete instead of counting as a match.
import type { Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { Rgb } from "../../floor/instrument/pixel-backdrop.ts";
import { clampBoxToImage, uniformRingBackdropOfRegion } from "../../floor/instrument/pixel-backdrop.ts";
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

function fingerprintOf(raw: PixelRaw, member: CohortMemberRender): CohortMemberFingerprint {
  if (member.state !== REST_STATE) {
    return { status: "incomplete", reason: `member paints its ${member.state} state, not the resting anatomy` };
  }
  const region = clampBoxToImage(member, raw.info.width, raw.info.height);
  if (region === null || region.left > member.x || region.top > member.y || region.width < member.width || region.height < member.height) {
    return { status: "incomplete", reason: "member box is not wholly inside the viewport screenshot" };
  }
  const ring = uniformRingBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, region);
  return ring === null ? { status: "incomplete", reason: "perimeter ring is not one colour" } : { status: "measured", ring: quantized(ring) };
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
