// The preset library surface — the Presets list hub. Reads `preset.list` + `settings.getUserSettings`
// (for the active-for-generation pointer), filters client-side by name, renders a `PresetLibraryRow` per
// preset. A row click opens the preset in CONTENT (`selectPreset`); activation is the "Active for
// generation" dropdown ONLY. CRUD composes existing verbs — New/Duplicate/Rename/Delete/Import. The
// focus/QueryBoundary shell + header/search/empty body come from the shared library-surface scaffold.

import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus, Search, SlidersHorizontal, Upload } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { LibraryListLayout, LibrarySurfaceShell } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import { useFocusOnMount } from "#lib";
import { selectPreset, useSelectedPresetId } from "#state";
import { PresetImportDialog } from "../components/preset-import-dialog";
import { PresetLibraryRow } from "../components/preset-library-row";
import { PresetRenameDialog } from "../components/preset-rename-dialog";
import {
  useCreatePreset,
  useRemovePreset,
  useSetDefaultPreset,
  useUpdatePreset,
} from "../hooks/use-preset-mutations";

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
      <LibrarySurfaceShell
        errorLabel="Couldn't load your presets."
        loadingLabel="Loading your presets…"
      >
        <PresetList onSelectPreset={onSelectPreset ?? selectPreset} />
      </LibrarySurfaceShell>
    </Stack>
  );
}

function PresetList({
  onSelectPreset,
}: {
  readonly onSelectPreset: (id: PresetId) => void;
}): ReactElement {
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
  const [importOpen, setImportOpen] = useState(false);

  const needle = deferredQuery.trim().toLowerCase();
  const filtered =
    needle === "" ? presets : presets.filter((p) => p.name.toLowerCase().includes(needle));

  const activeItems: SelectItems<string> = [
    { value: "", label: "Built-in default" },
    ...presets.map((p) => ({ value: p.id, label: p.name })),
  ];

  const onCreate = (): void => {
    void create
      .mutateAsync({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND })
      .then((created) => onSelectPreset(created.id));
  };

  const onSetActive = (id: string): void => {
    setDefault.mutate({ section: "seeds", patch: { defaultPresetId: id === "" ? null : id } });
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

  return (
    <>
      <LibraryListLayout
        actions={
          <>
            <Button
              aria-label="Import a SillyTavern preset"
              intent="ghost"
              onClick={(): void => setImportOpen(true)}
              size="sm"
            >
              <Icon icon={Upload} size="sm" />
            </Button>
            <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
              <Icon icon={Plus} size="sm" />
              New
            </Button>
          </>
        }
        beforeSearch={
          <Stack gap="field">
            <Text size="micro" tone="muted" transform="caps">
              Active for generation
            </Text>
            <Select
              aria-label="Active preset for generation"
              items={activeItems}
              onValueChange={(next): void => onSetActive(next as string)}
              value={activeId ?? ""}
            />
          </Stack>
        }
        empty={
          <EmptyState
            action={
              needle === "" ? (
                <Button disabled={create.isPending} intent="secondary" onClick={onCreate} size="sm">
                  New preset
                </Button>
              ) : undefined
            }
            description={
              needle === ""
                ? "Create a preset to tune sampling, reasoning, and the prompt structure."
                : "No preset matches your search."
            }
            icon={<Icon icon={needle === "" ? SlidersHorizontal : Search} size="lg" />}
            title={needle === "" ? "No presets yet" : "No matches"}
          />
        }
        isEmpty={filtered.length === 0}
        onSearchChange={setQuery}
        searchLabel="Search presets"
        searchPlaceholder="Search presets"
        searchValue={query}
        title="Presets"
      >
        {filtered.map((preset) => (
          <PresetLibraryRow
            active={preset.id === activeId}
            key={preset.id}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onRename={(id): void => setRenameId(id)}
            onSelect={onSelectPreset}
            preset={preset}
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

      <PresetImportDialog
        creating={create.isPending}
        onImport={({ name, config }): void => {
          void create.mutateAsync({ name, kind: NEW_PRESET_KIND, config }).then((created) => {
            setImportOpen(false);
            onSelectPreset(created.id);
          });
        }}
        onOpenChange={setImportOpen}
        open={importOpen}
      />
    </>
  );
}
