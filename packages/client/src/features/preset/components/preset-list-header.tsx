// The Presets LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). Presets was one of
// the two sections still printing its title INSIDE the pane via `LibraryListLayout`; the title, the live
// preset count, and the pane's create affordances now ride the `.shell-panel-header` band through the
// section definition's `listHeader` slot, like chats/corpus/analytics already did.
//
// Exactly ONE primary action: New. Import sits beside it as a GHOST icon — a secondary entry into the same
// "get a preset" job, ember-free, exactly as it was in the retired in-pane header. Both create paths (and
// the ONE import dialog they open) live here, because the band owns the pane's create verbs.
//
// The import door is format-agnostic (§16 row 2 — ONE home for import): the dialog sniffs the file and this
// band wires BOTH arms — the ST arm through `preset.create` (the browser-side mapper's output), the
// orb-native arm through `preset.importFile`, whose outcome the dialog reports because a rejected file must
// keep the dialog open with the server's reason. The orb arm resolves to no id (a MERGE targets a row the
// caller never named), so it closes on success without stealing the selection.
//
// The count is a non-suspending `useQuery` sharing the `preset.list` cache with the suspending list below,
// so no extra fetch: the title + actions render immediately and stay put while the count settles.

import { Button } from "@orb/ui/button";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ListPaneHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { selectPresetFromList, usePresetSearchQuery } from "#state";
import { useCreatePreset, useImportPresetFile } from "../hooks/use-preset-mutations.ts";
import { filterPresetsByName, presetSearchNeedle } from "../lib/preset-search.ts";
import { PresetImportDialog } from "./preset-import-dialog.tsx";

const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";
/** ONE string for the import door's accessible name AND its hover tooltip (O-3). */
const IMPORT_LABEL = "Import a preset";

export function PresetListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  // THE CENSUS COUNTS WHAT THE PANE SHOWS (side-eye 2026-08-19 P2). It used to print `presets.length` — the
  // whole library — while the rows below it were filtered, so a search with no hits read "PRESETS 6" beside
  // "No matches". The lens lives in `#state` precisely because these two renderers have no common parent
  // (this is the shell's chrome band; the rows are the surface), and the PREDICATE is the surface's own
  // (`filterPresetsByName`), so the two can't drift into two answers about one list.
  const needle = presetSearchNeedle(usePresetSearchQuery());
  const shown = filterPresetsByName(presets ?? [], needle);
  // …AND THE TOTAL SURVIVES THE ZERO (side-eye 2026-08-22 P3-2). The ruling above SURVIVES — its input
  // changed. `ListPaneHeader` omits a `0` census on purpose ("a zero census is noise, not information"),
  // which is true of an empty library and false of a FILTERED one: there the band went from `PRESETS 5` to
  // a bare `PRESETS` exactly when the number would have said "your presets are still there, this search
  // just missed them". The band still prints what the pane SHOWS — that is the leading number — and the
  // string arm (the caller decides, the band prints) carries the total beside it. Every other filter is
  // untouched: `1 of 5` would be re-stating a total the rows below already make obvious.
  const census = shown.length === 0 && (presets ?? []).length > 0 ? `0 of ${String(presets?.length ?? 0)}` : shown.length;
  const create = useCreatePreset({ trpc, invalidation });
  const importFile = useImportPresetFile({ trpc, invalidation });
  const [importOpen, setImportOpen] = useState(false);

  const onCreate = (): void => {
    void create.mutateAsync({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }).then((created) => selectPresetFromList(created.id));
  };

  /** The orb-native arm: resolves to the server's error message, or null once the row landed. */
  const onImportOrb = async (fileText: string): Promise<string | null> => {
    const outcome = await importFile.mutateAsync({ fileText });
    if (!outcome.ok) {
      // `PresetImportOutcome` is a flat optional bag (the bundle path's shape), so `error` is not narrowed
      // by `ok` — the fallback is a message, never a silent close on a rejected file.
      return outcome.error ?? "That file isn't a valid orbweaver preset export.";
    }
    setImportOpen(false);
    notify.success(outcome.created === true ? "Preset imported." : "Preset merged into the one with the same name.");
    return null;
  };

  return (
    <>
      <ListPaneHeader
        action={
          // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
          <Row align="center" gap="field">
            {/* O-3: icon-only, so the aria-label served AT and left sighted users with nothing on hover —
                the native `title` is the same string, so the tooltip and the accessible name can't drift.
                `size="icon"`, not `sm` (side-eye F-22): the `sm` box is width-fitted to a LABEL, so an
                icon-only trigger measured 40×44 under coarse-pointer emulation — the only sub-44 target on
                the surface. `size="icon"` is `size-control-md`, which is 34px fine / 48px coarse BY TOKEN
                (D62 P1), so the touch floor holds without any hand math here. */}
            <Button aria-label={IMPORT_LABEL} intent="ghost" onClick={(): void => setImportOpen(true)} size="icon" title={IMPORT_LABEL}>
              <Icon icon={Upload} size="sm" />
            </Button>
            <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
              <Icon icon={Plus} size="sm" />
              New
            </Button>
          </Row>
        }
        count={census}
        title="Presets"
      />
      <PresetImportDialog
        busy={create.isPending || importFile.isPending}
        onImportOrb={onImportOrb}
        onImportSt={({ name, config }): void => {
          void create.mutateAsync({ name, kind: NEW_PRESET_KIND, config }).then((created) => {
            setImportOpen(false);
            selectPresetFromList(created.id);
          });
        }}
        onOpenChange={setImportOpen}
        open={importOpen}
      />
    </>
  );
}
