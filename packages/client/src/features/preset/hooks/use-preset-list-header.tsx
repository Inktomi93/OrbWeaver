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
import { Tip } from "#components";
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
  // The census lives in `hooks/use-preset-census.ts` because the phone topbar's screen title reads the same
  // number: on a phone the ONE-NAME rule (shell.css) sheds this band's title and the census travels INSIDE it
  // (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE TITLE"). One hook, two readers — exactly one visible
  // census per regime, and the filter lens is not re-derived.
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
      return outcome.error;
    }
    setImportOpen(false);
    if (outcome.created !== true) {
      notify.success("That preset is already in your library — nothing was added.");
    } else if (outcome.renamedFrom !== null && outcome.renamedFrom !== undefined) {
      notify.success(`Imported as “${outcome.name ?? outcome.renamedFrom}” — you already have a different “${outcome.renamedFrom}”.`);
    } else {
      notify.success("Preset imported.");
    }
    return null;
  };

  return {
    action: (
      <Row align="center" gap="field">
        {/* Icon-only, so the tooltip is the same string as the aria-label and the two can't drift.
                `size="icon"`, not `sm`: the `sm` box is width-fitted to a LABEL, so an icon-only trigger
                would miss the coarse touch floor. `size="icon"` is `size-control-md`, which is 34px fine / 48px coarse BY TOKEN
                (D62 P1), so the touch floor holds without any hand math here. */}
        <Tip text={IMPORT_LABEL}>
          <Button aria-label={IMPORT_LABEL} intent="ghost" onClick={(): void => setImportOpen(true)} size="icon">
            <Icon icon={Upload} size="sm" />
          </Button>
        </Tip>
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
