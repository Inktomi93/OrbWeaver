// World Info feature CT stories (core/Spine-Testing.md §7 — a CT mounts ONLY from a non-test module). World
// Info is a `CollectionContribution` now (R2), so its surfaces are deep-imported the way the regex/tag
// stories deep-import theirs: the config HOST mounts them in production, and the front door exports only the
// contribution. Every story wraps the real client data layer (<CtDataProviders> — Query + real tRPC over the
// routeTrpc-stubbed network).

import { QueryBoundary } from "@orb/client/data";
import { selectCollectionMember, useCollectionSelection } from "@orb/client/state";
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
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";

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
export function WorldInfoCollectionRowsStory({
  filter = "",
  selectedId = null,
}: {
  readonly filter?: string;
  readonly selectedId?: string | null;
} = {}): ReactElement {
  // SEEDED HERE, IN A LAZY INITIALIZER, AND IDEMPOTENT — the three properties together are the point.
  //   · HERE, not in the probe: a component that writes a store it also SUBSCRIBES to during its own render
  //     does not reliably see its own write, which is what the first attempt at this hit. The parent's
  //     initializer runs before the probe mounts, so the probe's first read is already the seeded value.
  //   · a LAZY INITIALIZER, not an effect: the rows mount in the same pass, so a delete driven before an
  //     effect ran would read an empty store — and a `setState`-shaped write in a prop-keyed effect is the
  //     exact shape the hooks lint refuses.
  //   · IDEMPOTENT: `selectCollectionMember` is a plain SET, so a double-invoked initializer (StrictMode, a
  //     remount) lands the same value rather than flipping state.
  useState((): null => {
    if (selectedId !== null) {
      selectCollectionMember("worldInfo", selectedId);
    }
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width: 330 }}>
        {/* The OPEN book, as the shell's selection store holds it. A delete only has a selection to CLEAR
            when one is open, so whether a rejected delete ejects the reader from a book that still exists
            is unobservable without one — and `clearCollectionSelection` writes the STORE, so the probe
            reads the store rather than a rendered echo (this story mounts no CONTENT pane to echo it). */}
        <CollectionSelectionProbe />
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <WorldInfoCollectionRows view={{ selectedId, onSelect: (): void => undefined, filter }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** READ-ONLY: prints what the selection store holds. The seed is the story's (see above) — this component
 *  only subscribes, so it can never be a writer that misses its own write. */
function CollectionSelectionProbe(): ReactElement {
  const open = useCollectionSelection();
  return <output aria-label="Open collection member">{open === null ? "none" : open.memberId}</output>;
}

/** The world-info MEMBER EDITOR mounted in CONTENT (config-rail C-7) — the book view, its sortable entry
 *  list, and the drilled entry editor. The QueryBoundary is production's (the config host wraps
 *  `detail(view)` in one): the surface reads through `useSuspenseQuery`. */
export function WorldInfoMemberStory({ memberId = "world_book_reorder001" }: { readonly memberId?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          {/* `library` is the host's own group label (`world-info-group.tsx`) — the drill exit (#1747). */}
          <WorldInfoMemberSurface view={{ library: "World Info", memberId }} />
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
  const [deleted, setDeleted] = useState("none");
  return (
    <CtDataProviders>
      <div style={{ width: 560, padding: 16 }}>
        {/* `onDeleted` is the editor's ONE outward consequence of the delete — the host tears the editor
            down on it — so a story that discards it cannot tell a sent delete from a landed one. */}
        <output aria-label="Deleted entry">{deleted}</output>
        <EntryEditor entry={STORY_ENTRY} onDeleted={(id): void => setDeleted(id)} />
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
          <WorldInfoMemberSurface view={{ library: "World Info", memberId: "world_book_reorder001" }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}
