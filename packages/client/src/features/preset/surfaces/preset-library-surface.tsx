// The preset LIBRARY surface — the Presets LIST hub (UI-Arch §4.1: header row · search · rows; §4.2 Presets
// row "preset rows + CRUD toolbar"; BUILD-SPEC §4). A containment CONSUMER (§2.1) — the anchor owns the box.
// Reads `preset.list` (a small owned collection — no pagination/virtualization needed, unlike the character
// library) + `settings.getUserSettings` (for the ACTIVE-for-generation pointer `seeds.defaultPresetId`),
// filters client-side by name (`useDeferredValue` — §13.2 search-over-collection), and renders a
// `PresetLibraryRow` per preset. Selection flows LEFT→RIGHT: a row click OPENS the preset in CONTENT
// (`selectPreset` — the §5.1 writer-only seam) and NEVER activates it. Activation is the "Active for
// generation" dropdown ONLY (ruled §0.1): a raw Select writing `seeds.defaultPresetId` via
// `useSetDefaultPreset` (the `useSetPersonaSeed` bus-driven precedent). CRUD is client composition over the
// existing verbs — New (`preset.create`) · Duplicate (`preset.get` config → `preset.create`) · Rename/Delete
// (row kebab → dialogs) · Import (client-side ST parse → `preset.create`). Delete + rename overlays live in
// the ROW / dialog components (surface-purity — a surface renders no outer overlay); the surface wires the
// mutations and the active-delete seed-null.

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

// The new-preset request — a starter arrangement (the server seeds DEFAULT_PROMPT_CONFIG when `config` is
// omitted). `kind: "generation"` distinguishes it from other preset kinds (D61 roster presets are a
// SEPARATE domain — not conflated here).
const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";

/** The Presets LIST body (rendered inside the shell's `presets` LIST slot). */
export function PresetLibrarySurface(): ReactElement {
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
        <PresetList />
      </QueryBoundary>
    </Stack>
  );
}

function PresetList(): ReactElement {
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
      .then((created) => selectPreset(created.id));
  };

  const onSetActive = (id: string): void => {
    setDefault.mutate({ section: "seeds", patch: { defaultPresetId: id === "" ? null : id } });
  };

  // Duplicate fetches the source config (the LIST row is a summary — no config) then creates a copy.
  const onDuplicate = (id: PresetId): void => {
    const source = presets.find((p) => p.id === id);
    void (async (): Promise<void> => {
      const detail = await client.preset.get.query({ id });
      const created = await create.mutateAsync({
        name: `Copy of ${source?.name ?? "preset"}`,
        kind: NEW_PRESET_KIND,
        config: detail.config,
      });
      selectPreset(created.id);
    })();
  };

  // Delete: when the row is the ACTIVE preset, null the seed FIRST so no stale pointer survives (the seed
  // degrades safely at consumption, settings comment, but we keep it clean), then remove.
  const onDelete = (id: PresetId): void => {
    if (activeId === id) {
      setDefault.mutate({ section: "seeds", patch: { defaultPresetId: null } });
    }
    remove.mutate({ id });
  };

  const renamePreset = presets.find((p) => p.id === renameId) ?? null;

  return (
    <Stack gap="block" className="h-full">
      {/* §4.1 header row — micro-caps title + Import + create "+". */}
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

      {/* Active-for-generation dropdown — the ONLY activation affordance (§0.1). */}
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
              onSelect={selectPreset}
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
            selectPreset(created.id);
          });
        }}
      />
    </Stack>
  );
}
