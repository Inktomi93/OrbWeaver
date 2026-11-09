// Background housekeeping the person did not start, and the log line each writes when it fails (client-architecture-state-and-gates.md §11).
// A zero-import leaf: the mutation factory logs the line, the bug-report ring records which job it was, and a spec's node side
// reads the line it waits for.

export const BACKGROUND_JOBS = ["huskReap", "tempChatSweep", "uiCrashReport"] as const;
export type BackgroundJob = (typeof BACKGROUND_JOBS)[number];

export const BACKGROUND_JOB_LOGS = {
  huskReap: "The unused-chat reap failed; the daily sweep clears the room.",
  tempChatSweep: "The expired temporary-chat sweep failed; the next Home visit sweeps again.",
  uiCrashReport: "The plugin page crash report failed; this crash does not count toward the auto-disable strikes.",
} as const satisfies Record<BackgroundJob, string>;

/** The job whose failure log line `value` is exactly, or `null`. Only an exact line matches, so no other text maps to a job. */
export function backgroundJobOfLog(value: unknown): BackgroundJob | null {
  return BACKGROUND_JOBS.find((job) => BACKGROUND_JOB_LOGS[job] === value) ?? null;
}
