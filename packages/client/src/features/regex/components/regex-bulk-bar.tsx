// The regex library's BULK bar (REGX2) — the selection-scoped verbs for the scripts checked in bulk mode.
//
// It lives in a COMPONENT, not the surface, so its interior AlertDialog is legal (surface-purity: a surface
// renders no outer Dialog/Sheet/Drawer; a component owning its own interior confirm is fine — the
// `character-bulk-bar` precedent, whose anatomy this mirrors: one grammar for "act on the things I checked"
// across the whole app).
//
// THE VERBS A SELECTION CAN MEAN HERE: on/off (the row's own `enabled`), CHANGE WHERE THEY RUN (the placement
// set), in/out of every chat (the one scope this library owns), and delete. Placement joined the bar when D2
// was unblocked — the display/prompt tier flags and the `historyDepth` scope it implies are DERIVED (not sent)
// from the chosen set through the SHARED `@orb/kit/regex` derivations, the SAME ones the per-script editor's
// save boundary uses (`../lib/derive-tier-flags.ts`), so there is one derivation home, not two. It is the one
// verb whose target is a SET rather than a scalar, so it opens a chip picker (`RegexBulkPlacementDialog`)
// rather than firing inline — which is why it rides the kebab, where an action that needs a dialog belongs.
//
// THE LAYOUT IS MEASURED, NOT CHOSEN. This bar's host is the config list's 330px LIST column — narrower
// than the ~337px panel whose clipped trailing Delete is written into `character-bulk-bar`'s own header, and
// that bar carries THREE verbs. Two earlier shapes were verified BROKEN on the real 330px mount: five inline
// verbs put "Run everywhere" through the pane edge mid-word and pushed two verbs AND the clear button
// entirely off-screen (three of six controls unreachable); three inline verbs plus a kebab still ran the
// clear button 22px past the edge. What fits is TWO inline verbs plus one overflow — so the frequent pair
// stays inline and everything else, including the destructive verb, rides the kebab. That is not a demotion:
// it is the same place the ROW's kebab already homes Delete, so the library has one grammar, and
// `RowActionsMenu`'s `destructive` slot carries the AlertDialog confirm (§13.8 R4) with the count and the
// CASCADE named — deleting a script detaches it from every preset, character and room, which is the
// consequence a reader cannot see from the list.

import type { RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { Button } from "@orb/ui/button";
import { Ban, Globe, Icon, SlidersHorizontal } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { notify } from "#lib";
import { exitRegexBulkMode } from "#state";
import { useBulkRemoveRegexScripts, useBulkSetRegexEnabled, useBulkSetRegexGlobal, useBulkSetRegexPlacement } from "../hooks/use-regex-library.ts";
import { RegexBulkPlacementDialog } from "./regex-bulk-placement-dialog.tsx";

/** The batch verbs' shared answer, re-derived from the same proc rather than imported (the house shape for
 *  a client-feature derived type — a shared alias would be an exported type outside a type home). */
type RegexBulkOutcome = inferOutput<Trpc["regex"]["bulkRemove"]>;

export interface RegexBulkBarProps {
  /** The checked ids, opaque strings at the store seam and re-branded here (the stamped-id posture). */
  readonly ids: readonly string[];
  readonly onClear: () => void;
  readonly trpc: Trpc;
}

/** "1 script" / "3 scripts" — the subject every label and toast in this bar names. */
function scriptCount(n: number): string {
  return `${String(n)} script${n === 1 ? "" : "s"}`;
}

/** What a finished batch says. The count is the SERVER's `affected`, never the requested one: a selection
 *  raced by another device (or one that was already in the requested state) changed fewer rows than it
 *  named, and saying "20 scripts" over 17 writes would be the bar lying about its own work. */
function bulkToast(verb: string, affected: number): string {
  return `${scriptCount(affected)} ${verb}.`;
}

export function RegexBulkBar({ ids, onClear, trpc }: RegexBulkBarProps): ReactElement {
  const invalidation = useInvalidation();
  const setEnabled = useBulkSetRegexEnabled({ trpc, invalidation });
  const setGlobal = useBulkSetRegexGlobal({ trpc, invalidation });
  const setPlacement = useBulkSetRegexPlacement({ trpc, invalidation });
  const remove = useBulkRemoveRegexScripts({ trpc, invalidation });
  const scriptIds = ids.map((id) => castId<RegexScriptId>(id));
  const count = ids.length;
  const [placementOpen, setPlacementOpen] = useState(false);
  const enabledWriteInFlight = useRef(false);
  const [isPending, setIsPending] = useState(false);

  const report =
    (verb: string) =>
    ({ affected }: RegexBulkOutcome): void => {
      notify.success(bulkToast(verb, affected));
    };

  // THE SELECTION IS THE RETRY (#1501). Enable/Disable below already clear inside `onSuccess`; these four
  // verbs cleared on the same tick as `.mutate`, so a rejected batch dropped the checked set that named its
  // own targets — leaving a toast about scripts the reader could no longer re-select. Same shape everywhere
  // now: the selection survives a failure, and only a landed write dismisses the bar.
  const applyPlacement = (placement: RegexPlacement[]): void => {
    setPlacement.mutate(
      { scriptIds, placement },
      {
        onSuccess: (outcome: RegexBulkOutcome): void => {
          report("updated")(outcome);
          onClear();
        },
      },
    );
  };

  const admitEnabledWrite = (): boolean => {
    if (enabledWriteInFlight.current) {
      return false;
    }
    enabledWriteInFlight.current = true;
    setIsPending(true);
    return true;
  };

  const enabledWriteOptions = (enabled: boolean): NonNullable<Parameters<typeof setEnabled.mutate>[1]> => ({
    onSuccess: (outcome: RegexBulkOutcome): void => {
      report(enabled ? "switched on" : "switched off")(outcome);
      onClear();
    },
    onSettled: (): void => {
      enabledWriteInFlight.current = false;
      setIsPending(false);
    },
  });

  return (
    <>
      <SelectionBar count={count} onClear={onClear}>
        <Button
          disabled={isPending}
          intent="secondary"
          onClick={(): void => {
            if (!admitEnabledWrite()) {
              return;
            }
            setEnabled.mutate({ scriptIds, enabled: true }, enabledWriteOptions(true));
          }}
          size="sm"
        >
          Enable
        </Button>
        <Button
          disabled={isPending}
          intent="secondary"
          onClick={(): void => {
            if (!admitEnabledWrite()) {
              return;
            }
            setEnabled.mutate({ scriptIds, enabled: false }, enabledWriteOptions(false));
          }}
          size="sm"
        >
          Disable
        </Button>
        {/* The menu's accessible name and its destructive copy both carry the COUNT: a bar-level menu acts on
            a selection the reader can no longer see once the popup covers the rows. The GLOBAL pair is named
            the way the row's own switch names it ("runs in every chat") — one vocabulary for one junction, so
            the bar and the row can never read as different features. CHANGE WHERE THEY RUN opens a picker (its
            target is a SET, not a scalar), so it homes here where a dialog-backed action belongs. */}
        <RowActionsMenu
          destructive={{
            title: `Delete ${scriptCount(count)}?`,
            description: "Deleting these removes them from every preset, character, and room they're attached to. This can't be undone.",
            onConfirm: (): void => {
              remove.mutate(
                { scriptIds },
                {
                  onSuccess: (outcome: RegexBulkOutcome): void => {
                    report("deleted")(outcome);
                    // Leave bulk mode entirely: the rows the mode was operating on are gone, so a still-armed
                    // mode over an emptier list is a surface pointing at nothing. On a REJECTED delete they
                    // are all still there, so the mode — and the selection naming them — has to be too.
                    exitRegexBulkMode();
                  },
                },
              );
            },
          }}
          label={`More actions for ${scriptCount(count)}`}
          triggerSize="icon"
        >
          <MenuItem onClick={(): void => setPlacementOpen(true)}>
            <Icon icon={SlidersHorizontal} size="sm" />
            Change where they run
          </MenuItem>
          <MenuItem
            onClick={(): void => {
              setGlobal.mutate(
                { scriptIds, global: true },
                {
                  onSuccess: (outcome: RegexBulkOutcome): void => {
                    report("now run in every chat")(outcome);
                    onClear();
                  },
                },
              );
            }}
          >
            <Icon icon={Globe} size="sm" />
            Run in every chat
          </MenuItem>
          <MenuItem
            onClick={(): void => {
              setGlobal.mutate(
                { scriptIds, global: false },
                {
                  onSuccess: (outcome: RegexBulkOutcome): void => {
                    report("no longer run in every chat")(outcome);
                    onClear();
                  },
                },
              );
            }}
          >
            <Icon icon={Ban} size="sm" />
            Stop running everywhere
          </MenuItem>
        </RowActionsMenu>
      </SelectionBar>
      <RegexBulkPlacementDialog count={count} onApply={applyPlacement} onOpenChange={setPlacementOpen} open={placementOpen} />
    </>
  );
}
