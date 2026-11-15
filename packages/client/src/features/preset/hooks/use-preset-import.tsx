// The preset import flow both doors share: the list band's Import and the empty state's. One hook owns the dialog's
// open state, the two verbs behind it (the server's preview, then the import) and what a landed import says, so the
// two doors cannot land a preset differently.
//
// A landed import opens the preset, clears a search that would hide its row, and says whether the preset is the
// active one. Every chat uses the active preset and there is no per-chat pick, so the notice states that and offers
// the one activation call the page already has (`useSetDefaultPreset`).

import type { PresetImportOutcome } from "@orb/contracts/preset";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { NotifyNotice } from "#lib";
import { notify } from "#lib";
import { selectPresetFromList, setPresetSearchQuery, usePresetSearchQuery } from "#state";
import type { PresetFileInput } from "../components/preset-import-dialog.tsx";
import { PresetImportDialog } from "../components/preset-import-dialog.tsx";
import {
  PRESET_IMPORT_ALREADY_HELD,
  PRESET_IMPORT_IN_USE,
  PRESET_IMPORT_LANDED,
  PRESET_IMPORT_NOT_IN_USE,
  PRESET_USE_THIS_NAME,
  presetImportAddedSections,
  presetImportRenamed,
  presetImportScripts,
  presetImportScriptsRefused,
} from "../lib/preset-names.ts";
import { filterPresetsByName, presetSearchNeedle } from "../lib/preset-search.ts";
import { useImportPresetFile, usePreviewPresetFile, useSetDefaultPreset } from "./use-preset-mutations.ts";

type Landed = Extract<PresetImportOutcome, { ok: true }>;

/** The result line for a landed import: what the library gained, and the scripts that came with a SillyTavern preset. */
function importedSentence(outcome: Landed): string {
  const renamedFrom = outcome.renamedFrom ?? null;
  let landed = PRESET_IMPORT_LANDED;
  if (outcome.created !== true) {
    landed = PRESET_IMPORT_ALREADY_HELD;
  } else if (renamedFrom !== null) {
    landed = presetImportRenamed(outcome.name ?? renamedFrom, renamedFrom);
  }
  const scripts = outcome.regexScripts;
  const added = outcome.addedSections ?? [];
  return [
    landed,
    ...(scripts === undefined ? [] : [presetImportScripts(scripts.created + scripts.reused, scripts.created)]),
    ...(scripts === undefined || scripts.refused.length === 0 ? [] : [presetImportScriptsRefused(scripts.refused.length)]),
    ...(added.length === 0 ? [] : [presetImportAddedSections(added)]),
  ].join(" ");
}

export interface PresetImport {
  /** Open the import dialog. */
  readonly open: () => void;
  /** The dialog, mounted by whichever door owns this hook. */
  readonly dialog: ReactElement;
}

export function usePresetImport(): PresetImport {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const importFile = useImportPresetFile({ trpc, invalidation });
  const previewFile = usePreviewPresetFile({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });
  // Non-suspending: the band renders outside any read boundary, and only the notice's wording depends on it.
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  const [isOpen, setOpen] = useState(false);
  const searchQuery = usePresetSearchQuery();

  const landedNotice = (outcome: Landed): NotifyNotice => {
    const { presetId } = outcome;
    const title = importedSentence(outcome);
    if (presetId === undefined) {
      return { title };
    }
    if (settings.data?.config.seeds.defaultPresetId === presetId) {
      return { title, description: PRESET_IMPORT_IN_USE };
    }
    return {
      title,
      description: PRESET_IMPORT_NOT_IN_USE,
      action: { label: PRESET_USE_THIS_NAME, onClick: (): void => setDefault.mutate({ section: "seeds", patch: { defaultPresetId: presetId } }) },
    };
  };

  /** Resolves to the server's error message, or null once the row landed; the landed preset opens. */
  const onImport = async (file: PresetFileInput): Promise<string | null> => {
    const outcome = await importFile.mutateAsync(file);
    if (!outcome.ok) {
      return outcome.error;
    }
    setOpen(false);
    // The landed preset opens, and a search that would hide its row clears, so the import never reads as nothing.
    if (outcome.name !== undefined && filterPresetsByName([{ name: outcome.name }], presetSearchNeedle(searchQuery)).length === 0) {
      setPresetSearchQuery("");
    }
    if (outcome.presetId !== undefined) {
      selectPresetFromList(outcome.presetId);
    }
    notify.success(landedNotice(outcome));
    return null;
  };

  return {
    open: (): void => setOpen(true),
    dialog: <PresetImportDialog busy={importFile.isPending} onImport={onImport} onOpenChange={setOpen} onPreview={previewFile.mutateAsync} open={isOpen} />,
  };
}
