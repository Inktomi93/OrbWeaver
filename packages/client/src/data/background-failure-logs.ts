// The log lines of background housekeeping the person did not start (client-architecture-state-and-gates.md §11). A
// mutation's `backgroundFailure` names one, and the global mutation handler writes it with `console.error`; no toast fires.
// A zero-import leaf, so a spec's node side reads the line it waits for.

export const BACKGROUND_FAILURE_LOGS = {
  huskReap: "The unused-chat reap failed; the daily sweep clears the room.",
  tempChatSweep: "The expired temporary-chat sweep failed; the next Home visit sweeps again.",
  uiCrashReport: "The plugin page crash report failed; this crash does not count toward the auto-disable strikes.",
} as const;
