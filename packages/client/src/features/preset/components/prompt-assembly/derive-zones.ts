// Zone derivation for The Assembly rack (BUILD-SPEC §2.1) — PURE, node-safe, DERIVED at render, never
// stamped on the sections. The `chat_history` marker is the conversation PIVOT: everything above it is
// the `setup` zone (sent before the conversation), everything below is the `post` zone (sent after the
// user's latest message). The FIRST `chat_history` (PLAIN_MARKERS) wins — a preset with a duplicate
// pivot still derives its zones from the first, and the 2nd+ pivots render as inert warning rows
// (`duplicatePivotIndexes`). A preset with NO pivot ⇒ `missingPivot` (the rack shows an "add chat
// history" callout) and, having no boundary, every section derives to `setup`.
//
// The returned `zoneOf(i)` + `pivotIndex` are the geometry the rack paints from (left-edge accent
// steel-blue setup / warm-amber post); the per-zone summaries feed the ZoneSummaryStrip chips. Token
// totals defer to `estimate-tokens` (chars/4) so the strip's `~tok` figures are one seam.

import type { PromptSection } from "@orb/contracts/preset";
import { estimateSectionTokens } from "./estimate-tokens";

/** The two conversation zones. The union `Zone` is derived inline (`(typeof ZONES)[number]`), never an
 *  exported alias (§7.4 type-home rule — feature files export tuples, not loose type aliases). */
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
