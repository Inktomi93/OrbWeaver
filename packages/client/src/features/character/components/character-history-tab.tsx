// The CONTEXT History tab (FINAL-Character §7) — the `character_snapshots` browse log (D28: a log that
// gates nothing). Reverse-chron `{label, createdAt}` rows + a "Snapshot now" button + per-row Restore
// behind an AlertDialog confirm (restore auto-snapshots current state first, so it's reversible — §7).
// SHIP label/timestamp + restore ONLY this round: the optional §12 FIX #3 `getSnapshot` diff-read is a
// deliberate DEFERRAL (no backend change implied), so there is no compare-before-restore here.

import type { CharacterId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useInvalidation, useTRPC } from "#data";
import {
  useRestoreCharacter,
  useSnapshotCharacter,
} from "../hooks/use-character-context-mutations";

export interface CharacterHistoryTabProps {
  readonly characterId: CharacterId;
}

/** Epoch-ms → a readable local date. (`toLocaleDateString`, not `toLocaleString` — the latter resolves to
 *  the base `Object` signature under the noBaseToString gate; the date is enough for a browse log.) */
function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

export function CharacterHistoryTab({ characterId }: CharacterHistoryTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const snapshotsQuery = useQuery(trpc.character.listSnapshots.queryOptions({ characterId }));
  const snapshot = useSnapshotCharacter({ trpc, invalidation });
  const restore = useRestoreCharacter({ trpc, invalidation });

  // Reverse-chron (newest first) — the browse-log reading order, independent of the read's own ordering.
  const rows = useMemo(
    () => [...(snapshotsQuery.data ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [snapshotsQuery.data],
  );

  return (
    <Stack gap="block">
      <Button intent="secondary" onClick={(): void => snapshot.mutate({ characterId })}>
        Snapshot now
      </Button>

      {rows.length === 0 ? (
        <Text tone="muted">
          No snapshots yet. Take one to capture this character's current state.
        </Text>
      ) : (
        <Stack gap="row">
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={row.label ?? "Untitled snapshot"}
              subtitle={formatTimestamp(row.createdAt)}
              actions={
                <RestoreConfirm
                  onConfirm={(): void => {
                    restore.mutate({ characterId, snapshotId: row.id });
                  }}
                />
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** The per-row Restore button + its confirm interrupt (§13.8 R4 — a legal AlertDialog, never a plain
 *  Dialog). Uncontrolled trigger: no per-row open state to manage. */
function RestoreConfirm({ onConfirm }: { readonly onConfirm: () => void }): ReactElement {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button intent="ghost">Restore</Button>} />
      <AlertDialogPopup>
        <Stack gap="block">
          <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
          {/* Plain children — AlertDialogDescription IS the <p>; a nested <Text> (also <p>) is invalid HTML. */}
          <AlertDialogDescription>
            This replaces the character's current card with this snapshot. Your current state is
            snapshotted first, so you can undo it.
          </AlertDialogDescription>
          <AlertDialogActions>
            <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
            <AlertDialogClose
              render={
                <Button intent="primary" onClick={onConfirm}>
                  Restore
                </Button>
              }
            />
          </AlertDialogActions>
        </Stack>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
