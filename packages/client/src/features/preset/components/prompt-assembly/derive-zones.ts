// Zone derivation for the Assembly rack — pure, node-safe, derived at render, never stamped on the
// sections. The `chat_history` marker is the conversation pivot: everything above is `setup`, everything
// below is `post`. The first `chat_history` wins; a preset with no pivot derives every section to `setup`
// and flags `missingPivot`.

import type { PromptSection } from "@orb/contracts/preset";
import { estimateSectionTokens } from "./estimate-tokens";

/** The two conversation zones. `Zone` is derived inline, never an exported alias. */
export const ZONES = ["setup", "post"] as const;
type Zone = (typeof ZONES)[number];

/** Per-zone roll-up for the summary strip: how many ENABLED sections it holds + their token estimate. */
export interface ZoneSummary {
  readonly enabledCount: number;
  readonly tokenEstimate: number;
}

export interface DerivedZones {
  /** Index of the FIRST `chat_history` pivot, or `-1` when the preset has none (`missingPivot`). */
  readonly pivotIndex: number;
  /** No `chat_history` marker anywhere — the rack shows the "add chat history" callout. */
  readonly missingPivot: boolean;
  /** The 2nd+ `chat_history` indexes (ascending) — inert warning rows; zones still derive from the first. */
  readonly duplicatePivotIndexes: readonly number[];
  /** The zone a section index falls in. Above the pivot ⇒ `setup`; the pivot and below ⇒ `post`. */
  readonly zoneOf: (index: number) => Zone;
  /** Per-zone enabled-count + token-estimate roll-ups for the summary strip. */
  readonly summaries: Readonly<Record<Zone, ZoneSummary>>;
}

function isPivot(section: PromptSection): boolean {
  return section.type === "marker" && section.marker === "chat_history";
}

/**
 * Derive the setup/post zones for a rack ordering. Pure over the passed section array; nothing is
 * mutated or stamped. The pivot itself is classified `post` (it opens the conversation band), so a
 * section AT `pivotIndex` and everything after it are `post`; everything strictly before is `setup`.
 */
export function deriveZones(sections: readonly PromptSection[]): DerivedZones {
  const pivotIndexes = sections.reduce<number[]>((acc, section, i) => {
    if (isPivot(section)) {
      acc.push(i);
    }
    return acc;
  }, []);

  const pivotIndex = pivotIndexes[0] ?? -1;
  const missingPivot = pivotIndex === -1;
  const duplicatePivotIndexes = pivotIndexes.slice(1);

  const zoneOf = (index: number): Zone => (!missingPivot && index >= pivotIndex ? "post" : "setup");

  const summaries: Record<Zone, ZoneSummary> = {
    setup: { enabledCount: 0, tokenEstimate: 0 },
    post: { enabledCount: 0, tokenEstimate: 0 },
  };
  for (const [i, section] of sections.entries()) {
    if (!section.enabled) {
      continue;
    }
    const zone = zoneOf(i);
    const bucket = summaries[zone];
    summaries[zone] = {
      enabledCount: bucket.enabledCount + 1,
      tokenEstimate: bucket.tokenEstimate + estimateSectionTokens(section),
    };
  }

  return { pivotIndex, missingPivot, duplicatePivotIndexes, zoneOf, summaries };
}
