// World Info feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). The
// library surface comes through the feature front door; the entry editor is deep-imported (an internal
// component, not front-door). Both wrap in the real client data layer (<CtDataProviders> — Query + real tRPC
// over the routeTrpc-stubbed network).

import { WorldInfoEditorSurface, WorldInfoLibrarySurface } from "@orb/client/features/world-info";
import type { EntryView } from "@orb/contracts/world-info";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { EntryEditor } from "../../../../packages/client/src/features/world-info/components/entry-editor";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The World Info LIST surface over the real data layer (listBooks/listGlobal stubbed in the `.ct.tsx`). */
export function WorldInfoLibrarySurfaceStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 360, height: 640, padding: 16 }}>
        <WorldInfoLibrarySurface />
      </div>
    </CtDataProviders>
  );
}

/** A fully-populated entry (keyword scope + `position:after` + an UNKNOWN metadata key to prove the save
 *  mapper preserves ST-imported keys). Drives the real editor form + the keyword Combobox. Module-private
 *  (a story module exports components only — useComponentExportOnlyModules); the `.ct.tsx` asserts against
 *  its own known literals. */
const STORY_ENTRY: EntryView = {
  id: castId<WorldEntryId>("world_entry_ctstory0001"),
  worldBookId: castId<WorldBookId>("world_book_ctstory0001"),
  title: "Eldoria",
  description: "the shining capital",
  content: "Eldoria is the capital city, ringed by white walls.",
  keys: ["eldoria", "capital"],
  enabled: true,
  priority: 5,
  ignoreBudget: false,
  metadata: { scopeMode: "keyword", position: "after", extra: "keep-me" },
};

/** The entry editor over the real data layer (updateEntry/removeEntry stubbed in the `.ct.tsx`). */
export function EntryEditorStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560, padding: 16 }}>
        <EntryEditor entry={STORY_ENTRY} onDeleted={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

// Two distinct entries for the F1 SWITCH pin. `content` is the tell of which seed is live — the test never
// edits it: A's is "A-content", B's is "B-content". Entry B carries none of A's metadata quirks.
const SWITCH_ENTRY_A: EntryView = {
  id: castId<WorldEntryId>("world_entry_ctswitch0a"),
  worldBookId: castId<WorldBookId>("world_book_ctstory0001"),
  title: "Entry A",
  description: "",
  content: "A-content",
  keys: [],
  enabled: true,
  priority: 0,
  ignoreBudget: false,
  metadata: null,
};
const SWITCH_ENTRY_B: EntryView = {
  id: castId<WorldEntryId>("world_entry_ctswitch0b"),
  worldBookId: castId<WorldBookId>("world_book_ctstory0001"),
  title: "Entry B",
  description: "",
  content: "B-content",
  keys: [],
  enabled: true,
  priority: 0,
  ignoreBudget: false,
  metadata: null,
};

/** The F1 SWITCH pin harness — one `EntryEditor` mount whose `entry` prop swaps A→B (exactly what the book
 *  surface does when the selected entry changes: same component, new prop, no route/component remount). The
 *  boundary must key its Session by entry id so B's session is a fresh mount seeded from B, never A's frozen
 *  FormApi. Without it, one keystroke after the switch autosaves A's whole row (incl. content="A-content")
 *  into entry B. */
export function EntryEditorSwitchStory(): ReactElement {
  const [entry, setEntry] = useState<EntryView>(SWITCH_ENTRY_A);
  return (
    <CtDataProviders>
      <div style={{ width: 560, padding: 16 }}>
        <button type="button" onClick={(): void => setEntry(SWITCH_ENTRY_B)}>
          switch entry
        </button>
        <EntryEditor entry={entry} onDeleted={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

/** WorldInfoEditorReorderStory — the book view with its sortable entry LIST (item-8 restoration). Drives the
 *  real editor surface over the stubbed network so a CT can keyboard-drag a grip and assert the completed
 *  drag persists via `worldInfo.applyEntryOrder`. Fixed size so the sortable's nudge math is deterministic. */
export function WorldInfoEditorReorderStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 420, height: 640, padding: 16 }}>
        <WorldInfoEditorSurface bookId={castId<WorldBookId>("world_book_reorder001")} />
      </div>
    </CtDataProviders>
  );
}
