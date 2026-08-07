// The regex library's BULK bar (REGX2) — the selection-scoped verbs for the scripts checked in bulk mode.
//
// It lives in a COMPONENT, not the surface, so its interior AlertDialog is legal (surface-purity: a surface
// renders no outer Dialog/Sheet/Drawer; a component owning its own interior confirm is fine — the
// `character-bulk-bar` precedent, whose anatomy this mirrors: one grammar for "act on the things I checked"
// across the whole app).
//
// THE FOUR VERBS A SELECTION CAN MEAN HERE: on/off (the row's own `enabled`), in/out of every chat (the one
// scope this library owns), and delete. Placement is NOT among them and that is a RULING, not an omission —
// the display/prompt tier flags and the `historyDepth` scope are DERIVED from a placement set at ONE write
// boundary (`../lib/derive-tier-flags.ts`, the owner-ratified X-1/X-2 finding), so a bulk placement edit
// would need that derivation on the server and there must not be two homes for it.
//
// THE LAYOUT IS MEASURED, NOT CHOSEN. This bar's host is the config roster's 330px LIST column — narrower
// than the ~337px panel whose clipped trailing Delete is written into `character-bulk-bar`'s own header, and
// that bar carries THREE verbs. Two earlier shapes were verified BROKEN on the real 330px mount: five inline
// verbs put "Run everywhere" through the pane edge mid-word and pushed two verbs AND the clear button
// entirely off-screen (three of six controls unreachable); three inline verbs plus a kebab still ran the
// clear button 22px past the edge. What fits is TWO inline verbs plus one overflow — so the frequent pair
// stays inline and everything else, including the destructive verb, rides the kebab. That is not a demotion:
// it is the same place the ROW's kebab already homes Delete, so the library has one grammar, and
// `RowActionsMenu`'s `destructive` slot carries the AlertDialog confirm (§13.8 R4) with the count and the
// CASCADE named — deleting a script detaches it from every preset, character and room, which is the
// consequence a reader cannot see from the roster.

import type { RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Ban, Globe, Icon } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import { SelectionBar } from "@orb/ui/selection-bar";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { RowActionsMenu } from "#components";
import type { Trpc } from "#data";
import { useInvalidation } from "#data";
import { notify } from "#lib";
import { exitRegexBulkMode } from "#state";
import { useBulkRemoveRegexScripts, useBulkSetRegexEnabled, useBulkSetRegexGlobal } from "../hooks/use-regex-library.ts";

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
  const remove = useBulkRemoveRegexScripts({ trpc, invalidation });
  const scriptIds = ids.map((id) => castId<RegexScriptId>(id));
  const count = ids.length;

  const report =
    (verb: string) =>
    ({ affected }: RegexBulkOutcome): void => {
      notify.success(bulkToast(verb, affected));
    };

  return (
    <SelectionBar count={count} onClear={onClear}>
      <Button
        intent="secondary"
        onClick={(): void => {
          void setEnabled.mutateAsync({ scriptIds, enabled: true }).then(report("switched on"));
          onClear();
        }}
        size="sm"
      >
        Enable
      </Button>
      <Button
        intent="secondary"
        onClick={(): void => {
          void setEnabled.mutateAsync({ scriptIds, enabled: false }).then(report("switched off"));
          onClear();
        }}
        size="sm"
      >
        Disable
      </Button>
      {/* The menu's accessible name and its destructive copy both carry the COUNT: a bar-level menu acts on
          a selection the reader can no longer see once the popup covers the rows. The GLOBAL pair is named
          the way the row's own switch names it ("runs in every chat") — one vocabulary for one junction, so
          the bar and the row can never read as different features. */}
      <RowActionsMenu
        destructive={{
          title: `Delete ${scriptCount(count)}?`,
          description: "Deleting these removes them from every preset, character, and room they're attached to. This can't be undone.",
          onConfirm: (): void => {
            void remove.mutateAsync({ scriptIds }).then(report("deleted"));
            // Leave bulk mode entirely: the rows the mode was operating on are gone, so a still-armed mode
            // over an emptier list is a surface pointing at nothing.
            exitRegexBulkMode();
          },
        }}
        label={`More actions for ${scriptCount(count)}`}
        triggerSize="icon"
      >
        <MenuItem
          onClick={(): void => {
            void setGlobal.mutateAsync({ scriptIds, global: true }).then(report("now run in every chat"));
            onClear();
          }}
        >
          <Icon icon={Globe} size="sm" />
          Run in every chat
        </MenuItem>
        <MenuItem
          onClick={(): void => {
            void setGlobal.mutateAsync({ scriptIds, global: false }).then(report("no longer run in every chat"));
            onClear();
          }}
        >
          <Icon icon={Ban} size="sm" />
          Stop running everywhere
        </MenuItem>
      </RowActionsMenu>
    </SelectionBar>
  );
}
