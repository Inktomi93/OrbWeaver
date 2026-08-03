// World Info feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). World
// Info is a `CollectionContribution` now (R2), so its surfaces are deep-imported the way the regex/tag
// stories deep-import theirs: the config HOST mounts them in production, and the front door exports only the
// contribution. Every story wraps the real client data layer (<CtDataProviders> — Query + real tRPC over the
// routeTrpc-stubbed network).

import { QueryBoundary } from "@orb/client/data";
import type { EntryView } from "@orb/contracts/world-info";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { EntryEditor } from "../../../../packages/client/src/features/world-info/components/entry-editor.tsx";
import { WorldInfoCollectionRows } from "../../../../packages/client/src/features/world-info/components/world-info-collection-rows.tsx";
import { WorldInfoContextBody } from "../../../../packages/client/src/features/world-info/components/world-info-context-body.tsx";
import { WorldInfoSettingsSection } from "../../../../packages/client/src/features/world-info/components/world-info-settings-section.tsx";
import { WorldInfoMemberSurface } from "../../../../packages/client/src/features/world-info/surfaces/world-info-member-surface.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The World-info settings SECTION (Phase B ②) over the real data layer — getUserSettings +
 *  updateUserSettingsSection("worldInfo") stubbed in the `.ct.tsx`. Proves the contributed section's
 *  autosave write path fires. */
export function WorldInfoSettingsSectionStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 640, padding: 16 }}>
        <WorldInfoSettingsSection sectionId="world-info-settings" />
      </div>
    </CtDataProviders>
  );
}

/** The world-info collection's ROWS, inside the frame the host gives them (a bounded 330px roster column and
 *  the `filter` the host owns). `selectedId` stays null: what a row click DOES is the host's kinded
 *  selection, covered by the config workspace CT; what the ROW SAYS is this story's subject. */
export function WorldInfoCollectionRowsStory({ filter = "" }: { readonly filter?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width: 330 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <WorldInfoCollectionRows view={{ selectedId: null, onSelect: (): void => undefined, filter }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The world-info MEMBER EDITOR mounted in CONTENT (config-rail C-7) — the book view, its sortable entry
 *  list, and the drilled entry editor. The QueryBoundary is production's (the config host wraps
 *  `detail(view)` in one): the surface reads through `useSuspenseQuery`. */
export function WorldInfoMemberStory({ memberId = "world_book_reorder001" }: { readonly memberId?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <WorldInfoMemberSurface memberId={memberId} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The world-info CONTEXT arm for one open book — the activation panel the collection declares as
 *  `context: {kind:"body"}`. */
export function WorldInfoContextStory({ memberId = "world_book_reorder001" }: { readonly memberId?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width: 360 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <WorldInfoContextBody memberId={memberId} />
        </QueryBoundary>
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

/** WorldInfoEditorReorderStory — the book view with its sortable entry LIST (item-8 restoration), mounted as
 *  the collection's `detail` the way the config host mounts it. Fixed size so the sortable's nudge math is
 *  deterministic. */
export function WorldInfoEditorReorderStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 420, height: 640, padding: 16 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <WorldInfoMemberSurface memberId="world_book_reorder001" />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}
