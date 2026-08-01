// The Presets LIST chrome-band header (north-star §4 N2, D66 A1/A2 — the L4 band sweep). Presets was one of
// the two sections still printing its title INSIDE the pane via `LibraryListLayout`; the title, the live
// preset count, and the pane's create affordances now ride the `.shell-panel-header` band through the
// section definition's `listHeader` slot, like chats/corpus/analytics already did.
//
// Exactly ONE primary (A2): New. Import sits beside it as a GHOST icon — a secondary entry into the same
// "get a preset" job, ember-free, exactly as it was in the retired in-pane header. Both create paths (and
// the import dialog they open) live here, because the band owns the pane's create verbs.
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
import { selectPresetFromList } from "#state";
import { useCreatePreset } from "../hooks/use-preset-mutations";
import { PresetImportDialog } from "./preset-import-dialog";

const NEW_PRESET_NAME = "New preset";
const NEW_PRESET_KIND = "generation";

export function PresetListHeader(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  const create = useCreatePreset({ trpc, invalidation });
  const [importOpen, setImportOpen] = useState(false);

  const onCreate = (): void => {
    void create.mutateAsync({ name: NEW_PRESET_NAME, kind: NEW_PRESET_KIND }).then((created) => selectPresetFromList(created.id));
  };

  return (
    <>
      <ListPaneHeader
        action={
          // ONE flex child, so the band's space-between keeps the cluster hard against the trailing edge.
          <Row align="center" gap="field">
            <Button aria-label="Import a SillyTavern preset" intent="ghost" onClick={(): void => setImportOpen(true)} size="sm">
              <Icon icon={Upload} size="sm" />
            </Button>
            <Button disabled={create.isPending} intent="primary" onClick={onCreate} size="sm">
              <Icon icon={Plus} size="sm" />
              New
            </Button>
          </Row>
        }
        count={presets?.length ?? 0}
        title="Presets"
      />
      <PresetImportDialog
        creating={create.isPending}
        onImport={({ name, config }): void => {
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
