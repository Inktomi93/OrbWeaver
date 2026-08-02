// The preset library surface — the Presets list hub. Reads `preset.list` + `settings.getUserSettings`
// (for the active-for-generation pointer), filters client-side by name, renders a `PresetLibraryRow` per
// preset. A row click opens the preset in CONTENT (`selectPreset`); ACTIVATION is the row's own toggle
// (redesign §9/D1) — the pane-level "Active for generation" Select is DELETED, not kept beside it, and the
// built-in row's toggle is the `defaultPresetId === null` pick. CRUD composes existing verbs —
// Duplicate/Rename/Delete/Export here, and New/Import in the LIST chrome band (`preset-list-header.tsx`,
// D66 A1/A2 — the band owns the pane's create verbs). The focus/QueryBoundary shell + search/empty body
// come from the shared library-surface scaffold.
//
// EXPORT (G6) is client-side: the cached `preset.get` row through `buildPresetFile` — the SAME contract
// serde the whole-profile bundle's export arm writes (`domain/preset/verbs/export.ts`). No second
// serialization and no export endpoint of its own; the single-preset door is a thin arm over the one seam.

import { buildPresetFile } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, SlidersHorizontal } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import { downloadJson, notify, rowQualifiers, slugifyFilename, timeLib, useFocusOnMount } from "#lib";
import { selectPreset, useSelectedPresetId } from "#state";
import { PresetLibraryRow } from "../components/preset-library-row";
import { PresetRenameDialog } from "../components/preset-rename-dialog";
import { useCreatePreset, useRemovePreset, useSetDefaultPreset, useUpdatePreset } from "../hooks/use-preset-mutations";

const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";

export interface PresetLibrarySurfaceProps {
  /** Defaults to the bare `selectPreset` writer; the route injects a wrapper that also closes the mobile sheet. */
  readonly onSelectPreset?: ((id: PresetId) => void) | undefined;
}

export function PresetLibrarySurface({ onSelectPreset }: PresetLibrarySurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} className="h-full outline-none" gap="block" tabIndex={-1}>
      <LibrarySurfaceShell errorLabel="your presets" loadingLabel="Loading your presets…">
        <PresetList onSelectPreset={onSelectPreset ?? selectPreset} />
      </LibrarySurfaceShell>
    </Stack>
  );
}

function PresetList({ onSelectPreset }: { readonly onSelectPreset: (id: PresetId) => void }): ReactElement {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const invalidation = useInvalidation();
  const { data: presets } = useSuspenseQuery(trpc.preset.list.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedId = useSelectedPresetId();

  const create = useCreatePreset({ trpc, invalidation });
  const update = useUpdatePreset({ trpc, invalidation });
  const remove = useRemovePreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });

  const activeId = settings.config.seeds.defaultPresetId;

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [renameId, setRenameId] = useState<PresetId | null>(null);

  const needle = deferredQuery.trim().toLowerCase();
  const filtered = needle === "" ? presets : presets.filter((p) => p.name.toLowerCase().includes(needle));

  // The band owns the pane's create PRIMARY; this is the EMPTY-STATE's own action, which must stay (an
  // empty library that only says "no presets yet" is a dead end).
  const onCreate = (): void => {
    void create.mutateAsync({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }).then((created) => onSelectPreset(created.id));
  };

  // §16 row 3: the ONE activation writer every path (row toggle, kebab item, editor header) funnels through.
  // The BUILT-IN row is the null pick — the seed stores "no explicit preset", not the system row's sentinel
  // id, so the runner keeps resolving the shared default even if that row is ever re-seeded.
  const onActivate = (id: PresetId): void => {
    const preset = presets.find((p) => p.id === id);
    setDefault.mutate({ section: "seeds", patch: { defaultPresetId: preset?.isSystemDefault === true ? null : id } });
  };

  // G6 export: the CACHED detail row → `buildPresetFile` → a browser download. Same bytes as the bundle arm.
  const onExport = (id: PresetId): void => {
    void (async (): Promise<void> => {
      try {
        const detail = await client.preset.get.query({ id });
        downloadJson(`${slugifyFilename(detail.name, "preset")}.json`, buildPresetFile(detail.name, detail.config));
      } catch {
        notify.error("Couldn't export the preset.");
      }
    })();
  };

  const onDuplicate = (id: PresetId): void => {
    const source = presets.find((p) => p.id === id);
    void (async (): Promise<void> => {
      const detail = await client.preset.get.query({ id });
      const created = await create.mutateAsync({
        name: `Copy of ${source?.name ?? "preset"}`,
        kind: NEW_PRESET_KIND,
        config: detail.config,
      });
      onSelectPreset(created.id);
    })();
  };

  const onDelete = (id: PresetId): void => {
    if (activeId === id) {
      setDefault.mutate({ section: "seeds", patch: { defaultPresetId: null } });
    }
    remove.mutate({ id });
  };

  const renamePreset = presets.find((p) => p.id === renameId) ?? null;
  const qualifiers = rowQualifiers(
    filtered.map((preset) => ({ name: preset.name, at: preset.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );

  return (
    <>
      <LibraryListLayout
        empty={
          <EmptyState
            action={
              needle === "" ? (
                <Button disabled={create.isPending} intent="secondary" onClick={onCreate} size="sm">
                  New preset
                </Button>
              ) : undefined
            }
            description={needle === "" ? "Create a preset to tune sampling, reasoning, and the prompt structure." : "No preset matches your search."}
            icon={<Icon icon={needle === "" ? SlidersHorizontal : Search} size="lg" />}
            title={needle === "" ? "No presets yet" : "No matches"}
          />
        }
        isEmpty={filtered.length === 0}
        onSearchChange={setQuery}
        // The rows' activate toggles are `role="radio"` (side-eye F-19) — this is the group that owns them.
        rowsRadiogroupLabel="Active preset for generation"
        searchLabel="Search presets"
        searchPlaceholder="Search presets"
        searchValue={query}
      >
        {filtered.map((preset, index) => (
          <PresetLibraryRow
            // The built-in row IS the null pick (D1) — with the pane Select gone, "nothing chosen" is not an
            // unmarked list, it is that row wearing the state.
            active={preset.isSystemDefault ? activeId === null : preset.id === activeId}
            // Lineage is resolved against the UNFILTERED list (a search that hides the source must not hide
            // the scent) and stays null when the source is not a row we have — packaged templates never are,
            // and nothing here guesses a name from a name.
            forkedFromName={presets.find((p) => p.id === preset.forkedFrom)?.name ?? null}
            key={preset.id}
            onActivate={onActivate}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onExport={onExport}
            onRename={(id): void => setRenameId(id)}
            onSelect={onSelectPreset}
            preset={preset}
            // The action-name disambiguator, resolved across the WHOLE list (side-eye P2c): the fork
            // workflow mints rows that share a name exactly, and eight minted in the same hour also share
            // "9h ago" — the per-row stamp then produced eight identical accessible names.
            qualifier={qualifiers[index] ?? ""}
            selected={preset.id === selectedId}
          />
        ))}
      </LibraryListLayout>

      {renamePreset !== null ? (
        <PresetRenameDialog
          currentName={renamePreset.name}
          onOpenChange={(next): void => {
            if (!next) {
              setRenameId(null);
            }
          }}
          onRename={(name): void => update.mutate({ id: renamePreset.id, name })}
          open={true}
        />
      ) : null}
    </>
  );
}
