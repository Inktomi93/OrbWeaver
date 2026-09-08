// regex feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The stories
// reach feature internals the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent): the member editor is mounted by the CONFIG host through `regexCollection`. The DISPLAY-tier
// story lives in the `#data` mirror beside the hook it exercises (`tests/client/data/_ct-stories.tsx`) —
// the CT bundler registers stories per directory, so a cross-directory story import double-declares.

import { QueryBoundary, RegexScriptPicker } from "@orb/client/components";
import { useTRPC } from "@orb/client/data";
import type { CollectionGroupDefinition } from "@orb/client/state";
import {
  __resetConfigGroupOpen,
  clearCollectionSelection,
  exitRegexBulkMode,
  isCollectionGroup,
  toggleRegexBulkMode,
  useRegexBulkActive,
} from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfigCollectionLanding } from "../../../../packages/client/src/features/config/components/config-collection-landing.tsx";
import { RegexBulkBar } from "../../../../packages/client/src/features/regex/components/regex-bulk-bar.tsx";
import { RegexContextBody } from "../../../../packages/client/src/features/regex/components/regex-context-body.tsx";
import { regexGroup } from "../../../../packages/client/src/features/regex/lib/regex-group.tsx";

import { RegexMemberSurface } from "../../../../packages/client/src/features/regex/surfaces/regex-member-surface.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CONTENT_COLUMN_NARROW_PANE, CONTENT_COLUMN_WIDE_PANE } from "../../../support/browser/measure-content-column.ts";

/** The narrow end of the real CONTENT pane: a 752px shell docks the LIST at its measured 307px default and
 *  the pane pays its own `px-section` inset, leaving 397. Stated here so the bulk bar's reachability pin is
 *  measured where the verbs are actually tight. */
const REGEX_LIBRARY_PANE_PX = 397;

/** The regex group NARROWED to its collection arm — the def is typed as the whole union (the gate's
 *  co-location arm keys on that annotation), and the band component takes the narrowed shape. */
const REGEX_COLLECTION_GROUP: CollectionGroupDefinition = isCollectionGroup(regexGroup)
  ? regexGroup
  : ((): never => {
      throw new Error("regexGroup is not a collection group");
    })();

/** The regex MEMBER EDITOR mounted in CONTENT (config-rail C-7 — the same fields the retired Dialog bound,
 *  minus the Dialog) — `regex.listScripts` (the read) and `regex.updateScript`/`removeScript` (the writes)
 *  are stubbed per-test via routeTrpc. The QueryBoundary is production's (the config host wraps
 *  `detail(view)` in one): the surface reads through `useSuspenseQuery`. */
export function RegexMemberStory({
  memberId = "regex_script_stripooc",
  width = 720,
}: {
  readonly memberId?: string;
  /** The host pane's width — the CONTENT COLUMN's behaviour is a function of it (#1664). */
  readonly width?: number;
}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 700, overflow: "auto", width }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          {/* `library` is the host's own group label (`regex-group.tsx`) — the drill row's exit (#1747). */}
          <RegexMemberSurface view={{ library: "Regex scripts", memberId }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The regex member editor at the two pane widths its CONTENT COLUMN behaves differently at (#1664) —
 *  the tag editor's twin story carries the argument. ONE mount, both arms: the widen button is the
 *  `@5xl` crossover a CT cannot otherwise reach on a fixed host. */
export function RegexMemberContentColumnStory(): ReactElement {
  const [width, setWidth] = useState(CONTENT_COLUMN_NARROW_PANE);
  return (
    <>
      <button onClick={(): void => setWidth(CONTENT_COLUMN_WIDE_PANE)} type="button">
        widen the pane
      </button>
      <RegexMemberStory width={width} />
    </>
  );
}

/** The regex LIBRARY as the config host draws it (REGX2): the real `ConfigCollectionLanding` over the real
 *  `regexGroup` def (whose `body.collection` is the `regexCollection` door), so the library's own control
 *  row (filter · bulk-select toggle · create · the overflow's import) and the contribution's own rows
 *  (kebab · global switch · checkboxes · the selection bar) are exercised through the production seam, not
 *  a double.
 *
 *  ═══ IT MOUNTED THE LIST BAND UNTIL #1725 ════════════════════════════════════════════════════════════
 *  The owner moved every collection's members and chrome out of the LIST into CONTENT, so
 *  `CollectionListGroup` is one Button now — a door with nothing behind it in this pane — and this story
 *  mounting it left all fourteen of this file's tests asserting a surface that no longer exists there. The
 *  subject is the LANDING; the band's own pins live in `config-list-collection-group.ct.tsx`.
 *
 *  THE BOX IS A FLEX COLUMN WITH A DEFINITE HEIGHT because the pane is: since #1725 the windowed row arm
 *  takes its bounded height from this chain (`min-h-0 flex-1` down to CONTENT's `overflow-y-auto` box)
 *  rather than from a 384px cap, and a plain block here would render a zero-height scroller. The width is
 *  the narrow end of the real CONTENT pane (a 752px shell docks the LIST at 307 and pays its own inset),
 *  which is where the bulk bar's five verbs have to fit.
 *
 *  Mounting ONE collection's landing directly is legal under the #1203 keying law for the same reason the
 *  host's `key={collection.id}` satisfies it: this fiber only ever serves one contribution.
 *
 *  The `reset` button is determinism, not product: the disclosure store is device-local (localStorage) and
 *  bulk mode is module state, so a CT that inherited another run's state would assert the wrong first frame. */
export function RegexLibraryGroupStory(): ReactElement {
  return (
    <CtDataProviders>
      <button
        onClick={(): void => {
          __resetConfigGroupOpen();
          clearCollectionSelection();
          exitRegexBulkMode();
        }}
        type="button"
      >
        reset
      </button>
      <div style={{ display: "flex", flexDirection: "column", height: 620, overflow: "auto", width: REGEX_LIBRARY_PANE_PX }}>
        <ConfigCollectionLanding group={REGEX_COLLECTION_GROUP} />
      </div>
    </CtDataProviders>
  );
}

/** Has this PAGE already entered bulk mode? See the seed below — the store's own door is a toggle, and a
 *  render initializer may run more than once. */
let bulkModeSeeded = false;

function RegexBulkBarHarness(): ReactElement {
  const trpc = useTRPC();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(["regex_script_stripooc00000", "regex_script_narrate000000"]);
  // TWO observables, because the bar has two ways of standing down and only one of them is `onClear`: the
  // per-verb CLEAR (the host's prop) and the DELETE arm's `exitRegexBulkMode()`, which writes the shared
  // bulk store the host never sees. A pin on the count alone is blind to the delete verb entirely.
  // ENTERING BULK MODE HAS TO BE IDEMPOTENT HERE. `toggleRegexBulkMode` is a FLIP, and a render-phase
  // initializer is not called exactly once — StrictMode, a double render or a remount all re-run it, and a
  // second flip turns bulk mode back OFF, silently inverting the premise of every pin below. The guard makes
  // the seed a SET: the first call enters the mode, every later call is a no-op. Module-scoped rather than
  // component state because it is a property of the PAGE (each CT test gets a fresh realm and a fresh store),
  // not of one mount.
  useState((): null => {
    if (!bulkModeSeeded) {
      bulkModeSeeded = true;
      toggleRegexBulkMode();
    }
    return null;
  });
  return (
    <>
      <output aria-label="Bulk selection count">{selectedIds.length}</output>
      <output aria-label="Bulk mode">{useRegexBulkActive() ? "on" : "off"}</output>
      <RegexBulkBar ids={selectedIds} onClear={(): void => setSelectedIds([])} trpc={trpc} />
    </>
  );
}

/** The regex bulk bar mounted directly so same-task held-mutation CTs exercise only its action ownership. */
export function RegexBulkBarStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 330 }}>
        <RegexBulkBarHarness />
      </div>
    </CtDataProviders>
  );
}

/** The collection's CONTEXT arm — "Where it’s attached" for the selected script: the global switch and, once the
 *  global tier holds more than one script, its RUN ORDER. Narrow on purpose (320px): this pane is the
 *  config rail's context column, and a reorder affordance that only fits at story width is not shipped. */
export function RegexContextStory({ memberId = "regex_script_000000000000000a" }: { readonly memberId?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <RegexContextBody memberId={memberId} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

const PICKER_CHARACTER = "character_ctpickerstoryyyyy" as CharacterId;

/** The shared PICKER at the character scope — attach/detach against `regex.listForCharacter`.
 *
 *  The `QueryBoundary` is REQUIRED, not decoration: the picker reads through `useSuspenseQuery`, so without
 *  a boundary the suspend has nothing to catch and the story mounts to a blank page (which is exactly how
 *  this suite first failed). In production the boundary is the surface's — the facet editor and the preset
 *  tab each mount the picker inside one — so the story supplying it is the story matching production, not
 *  papering over a gap. */
export function RegexPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <RegexScriptPicker
            scope={{ kind: "character", characterId: PICKER_CHARACTER }}
            heading="Regex scripts"
            helperText="Rules that run whenever this character is in the room."
          />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The picker as a DECK GROUP beside a sibling group — the preset Transforms shape. The sibling exists so
 *  the CT can compare the two group headings' painted type instead of asserting a px literal (F-8/R-4: the
 *  picker's heading came back as a 16px sentence-case white heading among 10.5px muted caps kickers). */
export function RegexPickerInDeckStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <Stack gap="section">
            <Section kicker="Delivery">
              <Text voice="gloss">a sibling deck group</Text>
            </Section>
            <RegexScriptPicker scope={{ kind: "character", characterId: PICKER_CHARACTER }} heading="Regex" helperText="Rules this preset runs." />
          </Stack>
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The picker as the WHOLE BODY of an already-named drill (the character facet) — no heading of its own,
 *  and the empty arm carrying its action (X-7 + X-19). */
export function RegexPickerHeadlessStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <Section heading="Regex scripts">
            <RegexScriptPicker
              scope={{ kind: "character", characterId: PICKER_CHARACTER }}
              helperText="Rules that run whenever this character is in the room."
              onOpenLibrary={(): void => undefined}
            />
          </Section>
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}
