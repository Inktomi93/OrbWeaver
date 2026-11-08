// The stage lines shutdown logs, in the order it reaches them. `pnpm stack down` reads them to classify a drain, so
// only `complete` may read as an end; every other line is progress.

export const SHUTDOWN_MESSAGES = {
  draining: "shutdown: draining",
  httpDrained: "shutdown: http drained",
  closingServices: "shutdown: closing the service graph",
  dbHousekeeping: "shutdown: db housekeeping",
  complete: "shutdown: complete",
} as const;
