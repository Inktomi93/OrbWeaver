// The preset library surface — the Presets list hub. Reads `preset.list` + `settings.getUserSettings`
// (for the active-for-generation pointer), filters client-side by name, renders a `PresetLibraryRow` per
// preset. A row click opens the preset in CONTENT (`selectPreset`); activation is the "Active for
// generation" dropdown ONLY. CRUD composes existing verbs — New/Duplicate/Rename/Delete/Import.

import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Plus/Search/SlidersHorizontal/Upload fine (the character-library-surface.tsx precedent).
import { Icon, Plus, Search, SlidersHorizontal, Upload } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef, useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC, useTRPCClient } from "#data";
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
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full outline-none" gap="block">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your presets…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your presets.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <PresetList onSelectPreset={onSelectPreset ?? selectPreset} />
      </QueryBoundary>
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
    <Stack gap="block" className="h-full">
      <Row gap="field" align="center" justify="between">
        <Text size="micro" tone="muted" transform="caps">
          Presets
        </Text>
        <Row gap="field" align="center">
          <Button
            intent="ghost"
            size="sm"
            aria-label="Import a SillyTavern preset"
            onClick={(): void => setImportOpen(true)}
          >
            <Icon icon={Upload} size="sm" />
          </Button>
          <Button intent="primary" size="sm" onClick={onCreate} disabled={create.isPending}>
            <Icon icon={Plus} size="sm" />
            New
          </Button>
        </Row>
      </Row>

      <Stack gap="field">
        <Text size="micro" tone="muted" transform="caps">
          Active for generation
        </Text>
        <Select
          items={activeItems}
          value={activeId ?? ""}
          onValueChange={(next): void => onSetActive(next as string)}
          aria-label="Active preset for generation"
        />
      </Stack>

      <Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search presets"
        aria-label="Search presets"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Icon icon={needle === "" ? SlidersHorizontal : Search} size="lg" />}
          title={needle === "" ? "No presets yet" : "No matches"}
          description={
            needle === ""
              ? "Create a preset to tune sampling, reasoning, and the prompt structure."
              : "No preset matches your search."
          }
          action={
            needle === "" ? (
              <Button intent="secondary" size="sm" onClick={onCreate} disabled={create.isPending}>
                New preset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack gap="field" className="min-h-0 flex-1 overflow-y-auto">
          {filtered.map((preset) => (
            <PresetLibraryRow
              key={preset.id}
              preset={preset}
              selected={preset.id === selectedId}
              active={preset.id === activeId}
              onSelect={onSelectPreset}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onRename={(id): void => setRenameId(id)}
            />
          ))}
        </Stack>
      )}

      {renamePreset !== null ? (
        <PresetRenameDialog
          open={true}
          onOpenChange={(next): void => {
            if (!next) {
              setRenameId(null);
            }
          }}
          currentName={renamePreset.name}
          onRename={(name): void => update.mutate({ id: renamePreset.id, name })}
        />
      ) : null}

      <PresetImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        creating={create.isPending}
        onImport={({ name, config }): void => {
          void create.mutateAsync({ name, kind: NEW_PRESET_KIND, config }).then((created) => {
            setImportOpen(false);
            onSelectPreset(created.id);
          });
        }}
      />
    </Stack>
  );
}
