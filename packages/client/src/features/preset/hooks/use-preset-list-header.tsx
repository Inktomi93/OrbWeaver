// The Presets LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). Presets was one of
// the two sections still printing its title INSIDE the pane; the title, the live
// preset count, and the pane's create affordances now ride the `.shell-panel-header` band through the
// section definition's `useListHeader` data slot, like chats/corpus/analytics already did.
//
// Exactly ONE primary action: New. Import sits beside it as a GHOST icon, a secondary entry into the same "get a
// preset" job, ember-free. Its glyph is the file-import shape: `Upload` reads as export or share. The hook supplies
// view data; the shell owns the band renderer. Actions and overlays retain their existing behavior.

import { OWNED_PRESET_KIND } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { FileInput, Icon, Plus } from "@orb/ui/icons";
import { Tip } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { ListPaneHeaderView } from "#lib";
import { BAND_NEW_LABEL } from "#lib";
import { selectPresetFromList } from "#state";
import { usePresetCensus } from "../hooks/use-preset-census.ts";
import { usePresetImport } from "../hooks/use-preset-import.tsx";
import { useCreatePreset } from "../hooks/use-preset-mutations.ts";
import { NEW_PRESET_NAME, PRESET_IMPORT_TITLE } from "../lib/preset-names.ts";
import { PRESETS_SECTION_LABEL } from "../lib/presets-section-label.ts";

export function usePresetListHeader(): ListPaneHeaderView {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // The census lives in `hooks/use-preset-census.ts` because the phone topbar's screen title reads the same
  // number: on a phone the ONE-NAME rule (shell.css) sheds this band's title and the census travels INSIDE it
  // (`list-pane-header.tsx`: "THE COUNT TRAVELS WITH THE TITLE"). One hook, two readers — exactly one visible
  // census per regime, and the filter lens is not re-derived.
  const census = usePresetCensus();
  const create = useCreatePreset({ trpc, invalidation });
  const importer = usePresetImport();

  const onCreate = (): void => {
    create.mutate({ name: NEW_PRESET_NAME, kind: OWNED_PRESET_KIND }, { onSuccess: (created): void => selectPresetFromList(created.id) });
  };

  const newPreset = { id: "preset-new", label: NEW_PRESET_NAME, icon: Plus, onSelect: onCreate, disabled: create.isPending };

  return {
    actions: [
      {
        id: "preset-import",
        inline: (
          // Icon-only, so the tooltip is the same string as the aria-label and the two can't drift. `square`, not a plain
          // `sm`: the `sm` box is width-fitted to a LABEL, so an icon-only trigger would miss the coarse touch floor.
          <Tip text={PRESET_IMPORT_TITLE}>
            <Button aria-label={PRESET_IMPORT_TITLE} variant="ghost" onClick={importer.open} square={true}>
              <Icon icon={FileInput} size="sm" />
            </Button>
          </Tip>
        ),
        menu: [{ id: "preset-import", label: PRESET_IMPORT_TITLE, icon: FileInput, onSelect: importer.open }],
      },
      {
        id: "preset-new",
        inline: (
          <Button disabled={create.isPending} onClick={onCreate} size="sm">
            <Icon icon={Plus} size="sm" />
            {BAND_NEW_LABEL}
          </Button>
        ),
        menu: [newPreset],
        compact: newPreset,
      },
    ],
    count: census ?? 0,
    title: PRESETS_SECTION_LABEL,
    overlay: importer.dialog,
  };
}
