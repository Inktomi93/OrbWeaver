// The Corpus workspace's mode vocabulary (D271, Variant A) and the contract a foreign feature fills to
// become one mode. Explore is discovery's own; Insights and Labels arrive from the door, so discovery never
// imports stats or tag.

import type { ReactNode } from "react";
import type { ListPaneHeaderView, ListSearchPolicy } from "./list-pane-header-view.ts";

export const CORPUS_MODES = ["explore", "insights", "labels"] as const;
export type CorpusMode = (typeof CORPUS_MODES)[number];

/** The user-facing mode names — the switch, the LIST band, and the phone title all read these. */
export const CORPUS_MODE_LABELS: Readonly<Record<CorpusMode, string>> = { explore: "Explore", insights: "Insights", labels: "Tags" };

/** The CONTEXT band's name for owner-wide context in every mode — never a description of the open subject. */
export const CORPUS_WHOLE_LABEL = "Whole corpus";

export function isCorpusMode(v: unknown): v is CorpusMode {
  return typeof v === "string" && (CORPUS_MODES as readonly string[]).includes(v);
}

/** One contributed Corpus mode: its finder, its CONTENT, its CONTEXT band, and its phone title. Its CONTEXT
 *  tabs ride the section's contributor registry instead, gated by `CorpusContextState.mode`. */
export interface CorpusModeContribution {
  /** The LIST body below the mode switch, already inside its own container anchor. */
  readonly list: () => ReactNode;
  /** The LIST chrome band: the mode's title and census. */
  readonly useListHeader: (active?: boolean) => ListPaneHeaderView;
  readonly listSearch: ListSearchPolicy;
  readonly content: () => ReactNode;
  /** The CONTEXT head band while this mode is active. */
  readonly contextHeader: () => ReactNode;
  /** The phone title for this mode. The section calls every mode's hook on every render, so hook order never
   *  depends on the active mode; an inactive mode returns `null` and must fetch nothing. */
  readonly useSelectionTitle: (active: boolean) => string | null;
}
