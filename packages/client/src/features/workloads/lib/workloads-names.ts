// The names the Jobs, Schedules, export and tuning sections print. A zero-import leaf, so a spec's node side reads them
// without loading the component graph.

/** The kind picker of the run and the schedule dialogs. */
export const WORKLOAD_JOB_FIELD_NAME = "Job";

/** The run dialog's dependency picker. */
export const WORKLOAD_RUN_AFTER_NAME = "Run after these complete";

/** The asset-index rebuild's kind picker. */
export const WORKLOAD_REBUILD_KIND_NAME = "What to rebuild";

/** The Jobs section's status tabs. */
export const WORKLOAD_FILTER_TABS_NAME = "Filter jobs";

/** The badge on a run or schedule that spans every user's data. */
export const WORKLOAD_BULK_BADGE = "Bulk";

/** The badge on a run queued for a later time. */
export const WORKLOAD_SCHEDULED_BADGE = "Scheduled";

/** The badge on a run held behind another. */
export const WORKLOAD_WAITING_BADGE = "Waiting";

/** The badge on a run whose saved settings this version cannot read. */
export const WORKLOAD_UNREADABLE_BADGE = "Unreadable";

/** The cancel confirmation's title, its confirm and its keep button. */
export const WORKLOAD_CANCEL_TITLE = "Cancel this job?";
export const WORKLOAD_CANCEL_CONFIRM_NAME = "Cancel job";
export const WORKLOAD_KEEP_RUNNING_NAME = "Keep running";

/** A run row's cancel button, named for the job it stops. */
export function cancelWorkloadName(kindLabel: string): string {
  return `Cancel: ${kindLabel}`;
}

/** A run row's retry button, named for the job it starts again. */
export function retryWorkloadName(kindLabel: string): string {
  return `Retry: ${kindLabel}`;
}

/** The part of a run row's subtitle that names another user's run. */
export function workloadOwnerLabel(ownerHandle: string): string {
  return `for ${ownerHandle}`;
}

/** The create dialog's title. */
export const SCHEDULE_CREATE_TITLE = "Create a schedule";

/** The create dialog's submit, and the paid-run confirm it raises. */
export const SCHEDULE_CREATE_NAME = "Create schedule";

/** The edit dialog's submit, and the paid-run confirm it raises. */
export const SCHEDULE_SAVE_NAME = "Save schedule";

/** What the create dialog says when the create is refused. */
export const SCHEDULE_CREATE_FAILED = "Couldn't create the schedule. Try again.";

/** The edit dialog's title, and what it says when the update is refused. */
export const SCHEDULE_EDIT_TITLE = "Edit schedule";
export const SCHEDULE_UPDATE_FAILED = "Couldn't update the schedule. Try again.";

/** The schedule dialogs' cadence picker. */
export const SCHEDULE_CADENCE_FIELD_NAME = "Runs";

/** The door to the create dialog; the header copy adds an ellipsis, the empty state's does not. */
export const SCHEDULE_NEW_NAME = "New schedule";

/** The schedule delete confirmation's confirm. */
export const SCHEDULE_DELETE_CONFIRM_NAME = "Delete schedule";

/** The export section's kind checklist. */
export const EXPORT_INCLUDE_LEGEND = "Include";

/** The export section's download. */
export const EXPORT_DOWNLOAD_NAME = "Download my library";

/** The tuning section's duplicate threshold field. */
export const DUPLICATE_THRESHOLD_NAME = "Duplicate threshold";
