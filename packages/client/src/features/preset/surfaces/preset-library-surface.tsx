// The preset library surface — the Presets list hub. Reads `preset.list` + `settings.getUserSettings`
// (for the active-for-generation pointer), filters client-side by name, renders a `PresetLibraryRow` per
// preset. A row click opens the preset in CONTENT (`selectPreset`); ACTIVATION is the row's own toggle
// (redesign §9/D1) — the pane-level "Active for generation" Select is DELETED, not kept beside it, and the
// built-in row's toggle is the `defaultPresetId === null` pick. CRUD composes existing verbs —
// Duplicate/Delete/Export here, and New/Import in the LIST chrome band (`preset-list-header.tsx`,
// D66 A1/A2 — the band owns the pane's create verbs). The focus/QueryBoundary shell + search/empty body
// come from the shared library-surface scaffold.
//
// RENAME IS NOT ONE OF THEM (#506). It single-homes in the EDITOR — #442's ruling for the same verb on
// world-info ("rename single-homes in the EDITOR", the posture tags and regex already ship), applied to the
// door #483 built at `preset-editor-header.tsx`. This pane therefore mounts no rename dialog and holds no
// rename state; `PresetRenameDialog` is the editor header's now, and `preset.update {id, name}` has one
// caller. The row's own omission carries the reasoning.
//
// EXPORT (G6) is client-side: the cached `preset.get` row through `buildPresetFile` — the SAME contract
// serde the whole-profile bundle's export arm writes (`domain/preset/verbs/export.ts`). No second
// serialization and no export endpoint of its own; the single-preset door is a thin arm over the one seam.

import { buildPresetFile } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Search, SlidersHorizontal } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useDeferredValue, useRef } from "react";
import { LibraryListFrame, LibraryListRows, LibrarySurfaceShell } from "#components";
import { useInvalidation, useTRPC, useTRPCClient } from "#data";
import { downloadJson, notify, rowQualifiers, slugifyFilename, timeLib, useFocusOnMount } from "#lib";
import { selectPreset, setPresetSearchQuery, usePresetSearchQuery, useSelectedPresetId } from "#state";
import { PresetLibraryRow } from "../components/preset-library-row.tsx";
import { useCreatePreset, useRemovePreset, useSetDefaultPreset } from "../hooks/use-preset-mutations.ts";
import { notifyActivePreset } from "../lib/active-preset-notice.ts";
import { filterPresetsByName, presetSearchNeedle } from "../lib/preset-search.ts";

const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";

export interface PresetLibrarySurfaceProps {
  /** Defaults to the bare `selectPreset` writer; the route injects a wrapper that also closes the mobile sheet. */
  readonly onSelectPreset?: ((id: PresetId) => void) | undefined;
}

export function PresetLibrarySurface({ onSelectPreset }: PresetLibrarySurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  // The search box is pane CHROME and now renders above the boundary (#1748), so its value is read here.
  // It was already SECTION state rather than the list's own (`preset-search-store.ts`) — the chrome band's
  // census answers off the same lens — so nothing about ownership changes, only which side of the read it
  // is read on. The list below still reads it (deferred) for the filter.
  const query = usePresetSearchQuery();

  return (
    // THE FOCUS TARGET IS NAMED (side-eye 2026-08-19 ARIA). `useFocusOnMount` parks focus on this container
    // when the section opens, and it was an unnamed, role-less `div` — a screen reader announced "group" or
    // nothing at all, so entering the section told the user where they were only if they then Tab'd. It is a
    // region-shaped landmark for exactly this reason; the name is the pane's own noun.
    <Stack aria-label="Presets list" ref={surfaceRef} className="h-full outline-none" gap="block" role="region" tabIndex={-1}>
      {/* THE PANE CHROME AND ITS SCROLL BOX SIT ABOVE THE BOUNDARY (#1748): the reservation's measuring Stack
          is auto-height, so a scroller under the boundary stops scrolling and strands the rows past the fold.
          The search input rides up with the frame, so it is also on screen while the read is in flight. The
          key is minted HERE, not in the shared shell — one literal there would be one box for every library. */}
      <LibraryListFrame onSearchChange={setPresetSearchQuery} scroll={true} searchLabel="Search presets" searchPlaceholder="Search presets" searchValue={query}>
        <LibrarySurfaceShell errorLabel="your presets" loadingLabel="Loading your presets…" reserveKey="preset.library">
          <PresetList onSelectPreset={onSelectPreset ?? selectPreset} />
        </LibrarySurfaceShell>
      </LibraryListFrame>
    </Stack>
  );
}

function PresetList({ onSelectPreset }: { readonly onSelectPreset: (id: PresetId) => void }): ReactElement {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const invalidation = useInvalidation();
  // TWO READS, ONE WAVE — the PLURAL hook, never two `useSuspenseQuery` calls (#859 / side-eye 2026-08-30
  // P3-A). Two singular calls in one body structurally cannot fire together: the first SUSPENDS before React
  // reaches the second hook, so the reads serialize into a waterfall and the second one's resume commits
  // INSIDE this pane's entry animation (shell.css `shell-list-panel-in`) — the window the `[drop]` flagger
  // named `aside[aria-label=Presets list]` at 61ms. That flagger attributes by animation-LIFETIME overlap,
  // never by cause (boot-veil.tsx's #429 ruling), so the pane's compositor-owned translate was the victim,
  // not the offender: there is no layout-property transition on this aside to find, and `animations()`
  // reading 0 at SETTLE is that translate having finished. `useSuspenseQueries` issues both in one pass and
  // suspends once. Same idiom and same reason as `character/components/character-library-welcome.tsx`
  // (#1134).
  //
  // WHAT IT BOUGHT, MEASURED RATHER THAN CLAIMED (isolated stage, home → Presets, 4x CPU, n=2 per arm; at
  // 1x NEITHER arm drops a frame at all): HEAD flagged 2 drops / 60+84ms and 1 / 114ms, this tree flags
  // 1 / 58ms and 1 / 51ms. Fewer and smaller, and still 1-8ms over the 50ms budget — so the waterfall was A
  // contributor to that frame, not the whole of it, and the residue is the section-entry commit itself. The
  // deterministic proof of the WAVE is the CT, not those numbers: `preset-library-surface.ct.tsx`'s "#859 …
  // one wave" pin asserts at the network boundary that no response lands before the last request goes out
  // (red on the unfixed source with `out,in,out,in`).
  const [{ data: presets }, { data: settings }] = useSuspenseQueries({
    queries: [trpc.preset.list.queryOptions(), trpc.settings.getUserSettings.queryOptions()],
  });
  const selectedId = useSelectedPresetId();

  const create = useCreatePreset({ trpc, invalidation });
  const remove = useRemovePreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });

  const activeId = settings.config.seeds.defaultPresetId;

  // THE QUERY IS SECTION STATE, not this component's (side-eye 2026-08-19 P2): the chrome BAND's census has
  // to answer off the same lens, and it renders in a different part of the shell entirely — see
  // `preset-search-store.ts`. `useDeferredValue` still rides on top, so typing stays responsive while the
  // (client-side) filter catches up.
  const query = usePresetSearchQuery();
  const deferredQuery = useDeferredValue(query);

  const needle = presetSearchNeedle(deferredQuery);
  const filtered = filterPresetsByName(presets, needle);

  // The band owns the pane's create PRIMARY; this is the EMPTY-STATE's own action, which must stay (an
  // empty library that only says "no presets yet" is a dead end).
  const onCreate = (): void => {
    create.mutate({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }, { onSuccess: (created): void => onSelectPreset(created.id) });
  };

  // §16 row 3: the ONE activation writer this pane has (the row toggle) — the kebab's echo of it is GONE
  // (#481, see `preset-library-row.tsx`) and the editor header owns the other door. The BUILT-IN row is the
  // null pick — the seed stores "no explicit preset", not the system row's sentinel id, so the runner keeps
  // resolving the shared default even if that row is ever re-seeded.
  //
  // IT ANNOUNCES ON SUCCESS (#481): the write is what changes every future generation, so the confirmation
  // rides the SETTLED write, never the intent. `notifyActivePreset` is the one home for the sentence — the
  // editor header's Activate calls the same function.
  const onActivate = (id: PresetId): void => {
    const preset = presets.find((p) => p.id === id);
    if (preset === undefined) {
      return;
    }
    setDefault.mutate(
      { section: "seeds", patch: { defaultPresetId: preset.isSystemDefault ? null : id } },
      { onSuccess: (): void => notifyActivePreset(preset.name) },
    );
  };

  // G6 export: the CACHED detail row → `buildPresetFile` → a browser download. Same bytes as the bundle arm.
  const onExport = (id: PresetId): void => {
    client.preset.get
      .query({ id })
      .then((detail) => {
        downloadJson(`${slugifyFilename(detail.name, "preset")}.json`, buildPresetFile(detail.name, detail.config));
      })
      .catch(() => notify.error("Couldn't export the preset."));
  };

  const onDuplicate = (id: PresetId): void => {
    const source = presets.find((p) => p.id === id);
    client.preset.get
      .query({ id })
      .then((detail) => {
        create.mutate(
          { name: `Copy of ${source?.name ?? "preset"}`, kind: NEW_PRESET_KIND, config: detail.config },
          { onSuccess: (created): void => onSelectPreset(created.id) },
        );
      })
      .catch(() => notify.error("Couldn't duplicate the preset."));
  };

  const onDelete = (id: PresetId): void => {
    if (activeId === id) {
      setDefault.mutate({ section: "seeds", patch: { defaultPresetId: null } });
    }
    remove.mutate({ id });
  };

  const qualifiers = rowQualifiers(
    filtered.map((preset) => ({ name: preset.name, at: preset.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );

  return (
    <LibraryListRows
      empty={
        <EmptyState
          action={
            // A NO-MATCH STATE HAS AN EXIT (side-eye 2026-08-19 P3). It used to render NO action at all, so
            // the only way out of a search that found nothing was to notice the box above and clear it by
            // hand — a dead end wearing an explanation. Clear leads (it restores what you had); New is the
            // second door, because "nothing matched" is also the moment you decide to make the thing.
            needle === "" ? (
              <Button disabled={create.isPending} intent="secondary" onClick={onCreate} size="sm">
                New preset
              </Button>
            ) : (
              <Row align="center" gap="field">
                <Button intent="secondary" onClick={(): void => setPresetSearchQuery("")} size="sm">
                  Clear search
                </Button>
                <Button disabled={create.isPending} intent="ghost" onClick={onCreate} size="sm">
                  New preset
                </Button>
              </Row>
            )
          }
          description={needle === "" ? "Create a preset to tune sampling, reasoning, and the prompt structure." : "No preset matches your search."}
          icon={<Icon icon={needle === "" ? SlidersHorizontal : Search} size="lg" />}
          title={needle === "" ? "No presets yet" : "No matches"}
        />
      }
      isEmpty={filtered.length === 0}
      // The rows' activate toggles are `role="radio"` (side-eye F-19) — this is the group that owns them.
      rowsRadiogroupLabel="Active preset for generation"
      // The FRAME owns this pane's scroll box, because the boundary sits between it and these rows (#1748).
      scroll={false}
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
          onSelect={onSelectPreset}
          preset={preset}
          // The action-name disambiguator, resolved across the WHOLE list (side-eye P2c): the fork
          // workflow mints rows that share a name exactly, and eight minted in the same hour also share
          // "9h ago" — the per-row stamp then produced eight identical accessible names.
          qualifier={qualifiers[index] ?? ""}
          selected={preset.id === selectedId}
        />
      ))}
    </LibraryListRows>
  );
}
