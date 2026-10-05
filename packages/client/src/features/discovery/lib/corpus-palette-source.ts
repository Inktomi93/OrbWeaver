// The ⌘K rows for the Corpus modes (D271): the palette's section rows reach Corpus, and these reach each mode
// directly, through the same `setCorpusMode` the switch writes.

import { Library } from "@orb/ui/icons";
import type { CommandPaletteSource, CorpusMode, PaletteCommandRow } from "#lib";
import { CORPUS_MODE_LABELS, CORPUS_MODES } from "#lib";
import { setActiveSection, setCorpusMode } from "#state";
import { CORPUS_SECTION_LABEL } from "./corpus-section-label.ts";

const MODE_DESCRIBE: Readonly<Record<CorpusMode, string>> = {
  explore: "Search and browse your whole library",
  insights: "Activity, economics and per-character stats",
  labels: "Create, merge, prune and edit your tags",
};

const MODE_KEYWORDS: Readonly<Record<CorpusMode, readonly string[]>> = {
  explore: ["search", "browse"],
  insights: ["analytics", "stats", "leaderboard"],
  labels: ["tags"],
};

const ROWS: readonly PaletteCommandRow[] = CORPUS_MODES.map((mode) => ({
  id: `corpus-mode:${mode}`,
  label: CORPUS_MODE_LABELS[mode],
  describe: MODE_DESCRIBE[mode],
  badge: CORPUS_SECTION_LABEL,
  keywords: MODE_KEYWORDS[mode],
  run: (): void => {
    setActiveSection("corpus");
    setCorpusMode(mode);
  },
}));

export const corpusModePaletteSource: CommandPaletteSource = {
  id: "corpus-modes",
  heading: CORPUS_SECTION_LABEL,
  icon: Library,
  useRows: () => ROWS,
};
