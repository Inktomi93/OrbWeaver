// The Presets LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). Presets was one of
// the two sections still printing its title INSIDE the pane via `LibraryListLayout`; the title, the live
// preset count, and the pane's create affordances now ride the `.shell-panel-header` band through the
// section definition's `useListHeader` data slot, like chats/corpus/analytics already did.
//
// Exactly ONE primary action: New. Import sits beside it as a GHOST icon — a secondary entry into the same
// "get a preset" job, ember-free, exactly as it was in the retired in-pane header. Both create paths (and
// the ONE // The hook supplies view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import { Button } from "@orb/ui/button";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { ListPaneHeaderView } from "#lib";
import { notify } from "#lib";
import { selectPresetFromList } from "#state";
import { PresetImportDialog } from "../components/preset-import-dialog.tsx";
import { usePresetCensus } from "../hooks/use-preset-census.ts";
import { useCreatePreset, useImportPresetFile } from "../hooks/use-preset-mutations.ts";
import { PRESETS_SECTION_LABEL } from "../lib/presets-section-label.ts";

const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";
/** ONE string for the import door's accessible name AND its hover tooltip (O-3). */
const IMPORT_LABEL = "Import a preset";

export function usePresetListHeader(): ListPaneHeaderView {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // The census (its two side-eye rulings and the lens they ride) moved to `hooks/use-preset-census.ts` with
  // #1676, because the phone topbar's screen title reads the same number: on a phone the ONE-NAME rule
  // (shell.css) sheds this band's title and the census travels INSIDE it (`list-pane-header.tsx`: "THE COUNT
  // TRAVELS WITH THE TITLE"), so the library's size was printed NOWHERE there. One hook, two readers — still
  // exactly one visible census per regime, and the filter lens is not re-derived.
  const census = usePresetCensus();
  const create = useCreatePreset({ trpc, invalidation });
  const importFile = useImportPresetFile({ trpc, invalidation });
  const [importOpen, setImportOpen] = useState(false);

  const onCreate = (): void => {
    create.mutate({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }, { onSuccess: (created): void => selectPresetFromList(created.id) });
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

  return {
    action: (
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
    ),
    count: census ?? 0,
    title: PRESETS_SECTION_LABEL,
    overlay: (
      <>
        <PresetImportDialog
          busy={create.isPending || importFile.isPending}
          onImportOrb={onImportOrb}
          onImportSt={({ name, config }): void => {
            create.mutate(
              { name, kind: NEW_PRESET_KIND, config },
              {
                onSuccess: (created): void => {
                  setImportOpen(false);
                  selectPresetFromList(created.id);
                },
              },
            );
          }}
          onOpenChange={setImportOpen}
          open={importOpen}
        />
      </>
    ),
  };
}
