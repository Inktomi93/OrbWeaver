// What a person reads before a library-wide paid model run starts: how many calls it makes and on which Utility
// model, or that no Utility model is ready to take them, with the door to fix that. `use-model-run-confirm.ts` opens it.

import type { ReactElement } from "react";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { modelRunCostSentence, useUtilityModel } from "./use-utility-model.ts";
import { UtilityModelDoor } from "./utility-model-door.tsx";

/** The run waiting on a yes, with the calls it makes. */
interface PendingModelRun {
  readonly calls: number;
  /** A schedule's confirm: the count is per run, and the run repeats on its cadence. */
  readonly recurring?: boolean;
  readonly title: string;
  readonly confirmLabel: string;
  readonly run: () => Promise<void>;
}

export interface ModelRunConfirmDialogProps {
  /** `null` keeps the dialog closed. */
  readonly pending: PendingModelRun | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Set when the confirm opens over another open dialog, so its backdrop still renders. */
  readonly nested?: boolean | undefined;
}

export function ModelRunConfirmDialog({ pending, onOpenChange, nested }: ModelRunConfirmDialogProps): ReactElement | null {
  const utility = useUtilityModel();
  if (pending === null) {
    return null;
  }
  return (
    <ConfirmDialog
      body={utility.kind === "unset" || utility.kind === "blocked" ? <UtilityModelDoor /> : undefined}
      confirmIntent="primary"
      confirmLabel={pending.confirmLabel}
      description={modelRunCostSentence(pending.calls, utility, pending.recurring === true)}
      onConfirm={pending.run}
      onOpenChange={onOpenChange}
      open={true}
      title={pending.title}
      {...(nested === true ? { forceRender: true } : {})}
    />
  );
}
