// The regex collection's ROWS — the OWNER half of the config-rail seam.
//
// The row anatomy: name · a glyph-led scent subtitle · the kebab. Clicking the row opens the script in
// CONTENT (never a stacked editor Dialog).
//
// TWO THINGS are the row's own to render (band chrome is the host's; everything inside the row area is here):
//  · the KEBAB, carrying Duplicate · Export · Delete. EXPORT is a per-member verb, so D121-D's
//    `kebab=Export` half is the owner's; IMPORT is the group band's, declared as data on the contribution.
//    There is NO Rename item — a script's name is a bound field of the editor this row's click already
//    mounts, so a Rename dialog would be a second write path for a field one click away (`LibraryRow`'s
//    `onRename` is optional for exactly this, the `onDuplicate` precedent).
//    The kebab (and the bulk checkbox that replaces it) names its row with the `rowQualifiers` subject, not
//    the bare name — `Add script` mints every row "New script", so the bare form would give one list two
//    identically-named controls. The confirm dialog keeps the bare name: a dialog carries its own
//    context.
//  · BULK MODE. While it is on, the trailing cluster IS a checkbox and the row's click toggles selection
//    instead of opening the editor — the `character-card` bulk shape, so "act on the things I checked" reads
//    the same everywhere. The kebab is suppressed while it runs.
//
// ── THE GLOBAL SWITCH IS NOT ON THIS ROW (a ruled fork) ──────────────────────────────────────────────────
// A switch beside the kebab would cost the text column most of a docked row, clipping names, patterns and
// edit stamps. And `regex-context-body.tsx` renders the SAME setting under "Where it’s attached", so a row
// switch would put two live controls for one fact on one screen, with no confirm and no undo.
//
// "A row reserves what its LIST declares" (reserving the §12.2 maximum would spend the row on DEAD boxes).
// The list declares ONE trailing slot, and the reserved strip pads to it so the bulk checkbox lands at exactly
// the x the kebab does and the list keeps its scan column across the mode flip. The setting's one home is the
// CONTEXT panel — see `regex-context-body.tsx`.
//
// AND THE WIDTH GOES TO THE SCENT (a ruled fork): the subtitle LEADS with the find pattern (`regexRowScent`),
// and the pipeline stages ride the subtitle's own lead slot as glyphs carrying their labels
// (`REGEX_PLACEMENT_GLYPHS`) instead of a line of prose.
//
// Two render arms by size, the tag-collection shape: the sealed `VirtualList` in a bounded box past
// COLLECTION_LARGE_GROUP (with the host's filter), a LABELLED list below it — `role="list"` + `listitem`
// children, the tag collection's own small-arm spelling, so the
// arm that is not a `VirtualList` still announces its item count and boundaries.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { Checkbox } from "@orb/ui/checkbox";
import { Download, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { VirtualList } from "@orb/ui/virtual-list";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { LibraryRow } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import type { CollectionListView } from "#lib";
import {
  COLLECTION_LARGE_GROUP,
  downloadTextFile,
  notify,
  REGEX_PLACEMENT_GLYPHS,
  REGEX_PLACEMENT_LABELS,
  regexPlacementStages,
  regexRowScent,
  regexScriptTitle,
  rowActionSubject,
  rowQualifiers,
  selectActionName,
  timeLib,
} from "#lib";
import {
  clearCollectionSelection,
  clearRegexBulkSelection,
  toggleRegexScriptSelected,
  useIsRegexScriptSelected,
  useRegexBulkActive,
  useRegexBulkSelectedIds,
} from "#state";
import { useDuplicateRegexScript, useRemoveRegexScript } from "../hooks/use-regex-library.ts";
import { RegexBulkBar } from "./regex-bulk-bar.tsx";

/** One row's height guess for the windowed arm — the MEASURED height at the real 290px list mount (name +
 *  scent subtitle + the reserved cluster). The virtualizer re-measures after mount; the guess only decides
 *  how many rows the first frame windows. */
const ESTIMATED_ROW_PX = 52;

/** How many §12.2 cluster slots THIS list reserves per row: ONE — the kebab at rest, the bulk checkbox
 *  while bulk mode runs. It declared two while the global switch lived here (see the header). */
const REGEX_CLUSTER_SLOTS = 1;

export function RegexCollectionRows({ view }: { readonly view: CollectionListView }): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const client = useTRPCClient();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const duplicate = useDuplicateRegexScript({ trpc, invalidation });
  const remove = useRemoveRegexScript({ trpc, invalidation });
  const bulkActive = useRegexBulkActive();
  const selectedIds = useRegexBulkSelectedIds();

  const needle = view.filter.trim().toLowerCase();
  const filtered = needle === "" ? scripts : scripts.filter((script) => regexScriptTitle(script).toLowerCase().includes(needle));

  const onDuplicate = (id: RegexScriptId): void => {
    duplicate.mutate({ scriptId: id }, { onSuccess: (created): void => view.onSelect(created.id) });
  };

  const onDelete = (id: RegexScriptId): void => {
    // Clear the selection FIRST when the open script is the one being deleted, so CONTENT falls back to the
    // workspace welcome instead of holding a dead editor over a deleted id (the world-info row's rule).
    if (view.selectedId === id) {
      clearCollectionSelection();
    }
    remove.mutate({ scriptId: id });
  };

  // The bytes are the SERVER's — the same file the backup bundle carries for this script — downloaded
  // verbatim, so a shared script and a restored one can never diverge.
  const onExport = (id: RegexScriptId): void => {
    void client.regex.exportScript
      .query({ scriptId: id })
      .then((file) => {
        downloadTextFile(file.filename, file.fileText);
      })
      .catch((error: unknown) => {
        notify.error(error instanceof Error ? error.message : "Couldn't export the script.");
      });
  };

  // THE ROW'S CONTROLS NAME WHICH ROW THEY BELONG TO. `Add script` mints every row "New script", so two
  // clicks would produce two buttons both called "Actions for New script" — a screen-reader walk of the list could not tell them apart, and the discriminating datum ("no pattern yet ·
  // edited 3m ago") lives inside the ROW button, never in the control's own label. `rowQualifiers` is the
  // house answer to exactly this (presets fork from one base and hit it eight rows at a time): resolved with
  // the whole list in hand, escalating only where it must — the stamp the row already shows → the absolute
  // date-time → an ordinal. Keyed by id rather than index because both render arms hand `renderRow` an item,
  // not a position.
  const qualifiers = rowQualifiers(
    filtered.map((script) => ({ name: regexScriptTitle(script), at: script.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );
  const qualifierById = new Map(filtered.map((script, index) => [script.id, qualifiers[index] ?? ""]));

  const renderRow = (script: RegexScriptRow): ReactElement => (
    <RegexCollectionRow
      bulkActive={bulkActive}
      key={script.id}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onSelect={(): void => view.onSelect(script.id)}
      qualifier={qualifierById.get(script.id) ?? ""}
      script={script}
      selected={view.selectedId === script.id}
    />
  );

  const rows = ((): ReactElement | null => {
    if (filtered.length === 0) {
      // A FILTER MISS AND AN EMPTY LIBRARY ARE DIFFERENT STATES: with no needle, a "No scripts match that
      // filter." line above the host's own zero-member slot would be a second, false empty state (below
      // COLLECTION_LARGE_GROUP the filter box isn't even rendered). No needle ⇒ the host's slot is the only voice.
      // …AND THE MISS SPEAKS: focus stays in the host's filter box, so the one state with no rows at all needs
      // feedback a keyboard reader receives. `role="status"` rides the
      // MESSAGE, never the row container — a live region around the list would announce every row on every
      // keystroke. Same fix, same words, in the tag and world-info arms.
      return needle === "" ? null : (
        <Text role="status" voice="gloss">
          No scripts match that filter.
        </Text>
      );
    }
    if (scripts.length > COLLECTION_LARGE_GROUP) {
      return (
        <VirtualList
          aria-label="Regex scripts"
          // THE PANE IS THE WINDOW (the mock design §5.4). The bound is the CONTENT pane's own
          // `overflow-y-auto overscroll-contain` box,
          // reached by flex (`character-library-body.tsx`'s chain): the landing is `min-h-0 flex-1` in the
          // pane and this is `min-h-0 flex-1` in the landing. `min-h-0` is the required half — a flex
          // child defaults to `min-height: auto`, which lets the scroller grow to its content and trips the
          // primitive's own unbounded-window throw.
          className="min-h-0 flex-1"
          estimateSize={(): number => ESTIMATED_ROW_PX}
          // The cap is a fixed box and the rows are 51.5px, so the window ends MID-ROW every time; with
          // overlay scrollbars that half-row is the only cue there is more, and it reads as clipping (the tag
          // arm carries the same fade). The fade is state-gated on the live scroll position, so at the bottom it lifts.
          fadeEdge={true}
          gapToken="field"
          getItemKey={(script): string => script.id}
          items={filtered}
          renderItem={renderRow}
        />
      );
    }
    // LIST SEMANTICS ARE EXPLICIT HERE, the tag collection's own small-arm spelling: the sibling arm above is
    // a `VirtualList`, which announces "list, N items" of its own, so a bare `Stack` of buttons would make ONE
    // library speak two a11y grammars depending only on its size.
    return (
      <Stack aria-label="Regex scripts" gap="tight" role="list">
        {filtered.map((script, index) => (
          <Stack aria-posinset={index + 1} aria-setsize={filtered.length} key={script.id} role="listitem">
            {renderRow(script)}
          </Stack>
        ))}
      </Stack>
    );
  })();

  const checkedIds = Object.keys(selectedIds);
  return (
    <>
      {rows}
      {/* THE BAR IS THE MODE'S ONLY VOICE WHILE NOTHING IS CHECKED — but it is not rendered then, and that
          is deliberate: the band toggle is pressed, every row wears a checkbox, and a zero-count bar would
          be chrome saying what the rows already say. It appears the moment a row is checked. */}
      {bulkActive && checkedIds.length > 0 ? <RegexBulkBar ids={checkedIds} onClear={clearRegexBulkSelection} trpc={trpc} /> : null}
    </>
  );
}

interface RegexCollectionRowProps {
  readonly script: RegexScriptRow;
  readonly selected: boolean;
  readonly bulkActive: boolean;
  /** The list-resolved disambiguator this row's controls announce — see the caller. */
  readonly qualifier: string;
  readonly onSelect: () => void;
  readonly onDuplicate: (id: RegexScriptId) => void;
  readonly onDelete: (id: RegexScriptId) => void;
  readonly onExport: (id: RegexScriptId) => void;
}

function RegexCollectionRow({ script, selected, bulkActive, qualifier, onSelect, onDuplicate, onDelete, onExport }: RegexCollectionRowProps): ReactElement {
  const checked = useIsRegexScriptSelected(script.id);
  const title = regexScriptTitle(script);
  // The bulk checkbox is this row's cluster while the mode runs, so it carries the SAME subject the kebab
  // does — one row, one announced identity, whichever control is standing.
  const subject = rowActionSubject(title, qualifier);
  // The glyph strip is OMITTED, not emptied, for a script that runs nowhere: `ListRow` puts a literal space
  // between a present lead and the scent (the accname-concatenation guard), so an empty-but-present lead
  // would prepend a stray space to every such row's subtitle. `regexRowScent` says "runs nowhere" in words
  // for exactly that state, which is the state that needs words rather than a strip of zero marks.
  const stages = regexPlacementStages(script.placement);
  const scent = {
    subtitle: regexRowScent(script, timeLib.formatRelative),
    ...(stages.length === 0 ? {} : { subtitleLead: <RegexPlacementGlyphs stages={stages} /> }),
  };

  if (bulkActive) {
    return (
      <LibraryRow
        actionsReserved={REGEX_CLUSTER_SLOTS}
        onSelect={(): void => toggleRegexScriptSelected(script.id)}
        // `selected` means CHECKED here, not "open in CONTENT": in bulk mode the row's whole job is its
        // membership in the batch, and painting the open-editor row as current on top of that would give one
        // list two "you are here" marks.
        selected={checked}
        stateToggle={<Checkbox aria-label={selectActionName(subject)} checked={checked} onCheckedChange={(): void => toggleRegexScriptSelected(script.id)} />}
        title={title}
        {...scent}
      />
    );
  }

  return (
    <LibraryRow
      actions={{
        name: title,
        qualifier,
        onDuplicate: (): void => onDuplicate(script.id),
        onDelete: (): void => onDelete(script.id),
        deleteDescription: "Deleting a script removes it from every preset, character, and room it's attached to. This can't be undone.",
        // Below Duplicate, above the destructive Delete — the §9 kebab order.
        menuItemsAfter: (
          <MenuItem onClick={(): void => onExport(script.id)}>
            <Icon icon={Download} size="sm" />
            Export
          </MenuItem>
        ),
      }}
      actionsReserved={REGEX_CLUSTER_SLOTS}
      onSelect={onSelect}
      selected={selected}
      title={title}
      {...scent}
    />
  );
}

/**
 * THE PIPELINE STAGES A SCRIPT BITES ON, as the subtitle's LEAD (a ruled fork).
 *
 * A script bites on a SET, so the strip draws every member, in pipeline order — never one of them, and
 * never a count standing in for the set. The glyphs are the shared `REGEX_PLACEMENT_GLYPHS` presentation
 * of the SAME `RegexPlacement` map the labels key off, and each carries its own label as its accessible
 * name, so the set survives verbatim for a screen reader while costing one glyph each instead of a line of
 * words in a narrow column.
 *
 * The strip rides `subtitleLead` (not `markers`): a variable-width mark on the TITLE line steals the name's
 * width on exactly the rows that carry one, which is the defect this whole pass exists to close. The
 * subtitle line has the slack the title line does not (`ListRow.subtitleLead`, the databank precedent).
 *
 * The EMPTY set never reaches here — the caller omits the slot rather than rendering an empty strip (a
 * strip of zero glyphs is indistinguishable from one that failed to load, and it would still cost the
 * separator space `ListRow` puts after a present lead).
 */
function RegexPlacementGlyphs({ stages }: { readonly stages: readonly RegexPlacement[] }): ReactElement {
  return (
    // `as="span"`: this renders INSIDE the subtitle's own span, so the wrapper must be phrasing content.
    // Each glyph's label is its accessible name; the editor's `Runs on` field names the stages in words.
    <Text as="span" className="inline-flex items-center gap-tight align-middle">
      {stages.map((stage) => PLACEMENT_GLYPH_NODES[stage])}
    </Text>
  );
}

/** One placement's glyph as an element, keyed by the stage it draws — see {@link PLACEMENT_GLYPH_NODES}. */
const glyphNode = (stage: RegexPlacement): ReactElement => (
  <Icon icon={REGEX_PLACEMENT_GLYPHS[stage]} key={stage} label={REGEX_PLACEMENT_LABELS[stage]} size="xs" />
);

/** ONE `<Icon>` element per placement, built ONCE at module scope.
 *
 *  A React element is an immutable description, so the same objects can appear in every row's strip — and
 *  the strip is the one thing on this surface that multiplies: the regex band is the NON-virtualized arm, so
 *  expanding it would otherwise construct an element per stage per row synchronously inside the same tick
 *  as the disclosure. The claim is structural: the elements are built once per module instead of once per
 *  rendered stage. The `key` is baked into
 *  each element because these are rendered from a `.map` — an element carrying its own key is exactly how a
 *  hoisted node stays legal in a list.
 *
 *  Spelled as an exhaustive computed-key Record over the SAME two one-home maps (`REGEX_PLACEMENT_GLYPHS` +
 *  `REGEX_PLACEMENT_LABELS`), never a derived-and-cast object: a new `RegexPlacement` fails `tsc` here the
 *  way it does in every other presentation of the axis. */
const PLACEMENT_GLYPH_NODES: Record<RegexPlacement, ReactElement> = {
  ["USER_INPUT"]: glyphNode("USER_INPUT"),
  ["WORLD_INFO"]: glyphNode("WORLD_INFO"),
  ["PROMPT_HISTORY"]: glyphNode("PROMPT_HISTORY"),
  ["REASONING"]: glyphNode("REASONING"),
  ["AI_OUTPUT"]: glyphNode("AI_OUTPUT"),
  ["DISPLAY"]: glyphNode("DISPLAY"),
};
