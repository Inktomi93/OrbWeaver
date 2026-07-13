// World Info feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). The
// library surface comes through the feature front door; the entry editor is deep-imported (an internal
// component, not front-door). Both wrap in the real client data layer (<CtDataProviders> — Query + real tRPC
// over the routeTrpc-stubbed network).

import { WorldInfoLibrarySurface } from "@orb/client/features/world-info";
import type { EntryView } from "@orb/contracts/world-info";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
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
