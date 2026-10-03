// The confirm turning Memory on passes through: what it costs, which model pays, and what happens to existing chats
// (each builds at its next reply, or all of them now through the Memory backfill job, sized by the server's own
// count of its model calls; an import offers the same choice for its own chats). Memory is off by default, so this
// moment is the place to say it.

import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog, SettingCheckboxRow, UtilityModelDoor, useUtilityModel } from "#components";
import { useGatedQuery, useTRPC } from "#data";
import { MEMORY_COST_SENTENCE } from "#lib";
import { MEMORY_EXISTING_CHATS_NOTE, MEMORY_IMPORTED_CHATS_NOTE } from "../lib/memory-settings-section-nav.ts";

// Counted before Memory is on, when the backfill would be refused, so the count asks to be taken as admitted.
const BACKFILL_ESTIMATE = { input: { kind: "memory-backfill", params: {} }, mode: "singular", assumeAdmitted: true } as const;

/** When summaries can run: an existing chat at its next reply, an imported one when its import's offer is taken. */
const WHEN_CHATS_BUILD = `${MEMORY_EXISTING_CHATS_NOTE} ${MEMORY_IMPORTED_CHATS_NOTE}`;

function utilitySentence(utility: ReturnType<typeof useUtilityModel>): string {
  if (utility.kind === "ready") {
    return `Summaries run on your Utility model, ${utility.label}. ${WHEN_CHATS_BUILD}`;
  }
  if (utility.kind === "unset") {
    return "No Utility model is set yet, so summaries wait until you set one.";
  }
  if (utility.kind === "blocked") {
    return `Your Utility model is set but not running: ${utility.cause}. Summaries wait until it runs.`;
  }
  return WHEN_CHATS_BUILD;
}

export interface MemoryOnConfirmProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Turn Memory on and, when `buildExisting`, start the backfill over every existing chat. */
  readonly onConfirm: (buildExisting: boolean) => Promise<void>;
}

export function MemoryOnConfirm({ open, onOpenChange, onConfirm }: MemoryOnConfirmProps): ReactElement {
  const trpc = useTRPC();
  const utility = useUtilityModel();
  const [buildExisting, setBuildExisting] = useState(false);
  // Read only while the confirm is open, fresh each time: the count is for the decision being made now.
  const estimate = useGatedQuery(open ? BACKFILL_ESTIMATE : null, (input) => ({ ...trpc.workloads.estimateModelCalls.queryOptions(input), staleTime: 0 }));
  const calls = estimate.data?.calls ?? 0;
  const notReady = utility.kind === "unset" || utility.kind === "blocked";
  let body: ReactElement | undefined;
  if (notReady) {
    body = <UtilityModelDoor />;
  } else if (calls > 0) {
    body = (
      <SettingCheckboxRow
        checked={buildExisting}
        description="Runs the Memory backfill job in the background. Leave it off and each chat builds its memory at its next reply instead."
        label={`Also build memory for all my existing chats now (about ${calls} model ${calls === 1 ? "call" : "calls"})`}
        onChange={setBuildExisting}
      />
    );
  }
  return (
    <ConfirmDialog
      body={body}
      confirmIntent="primary"
      confirmLabel="Turn on Memory"
      description={`${MEMORY_COST_SENTENCE} ${utilitySentence(utility)}`}
      onConfirm={(): Promise<void> => onConfirm(buildExisting && calls > 0 && !notReady)}
      onOpenChange={(next): void => {
        // The offer is per decision: a dismissed confirm must not leave a checked box waiting for the next one.
        if (!next) {
          setBuildExisting(false);
        }
        onOpenChange(next);
      }}
      open={open}
      title="Turn on Memory?"
    />
  );
}
