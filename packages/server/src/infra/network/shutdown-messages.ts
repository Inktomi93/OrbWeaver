// The lines a shutdown logs: lifecycle's stages in the order it reaches them, and the HTTP drain's forced close.
// `pnpm stack down` reads them to classify a drain, so only `complete` and `drainDeadline` may read as an end.

export const SHUTDOWN_MESSAGES = {
  draining: "shutdown: draining",
  httpDrained: "shutdown: http drained",
  closingServices: "shutdown: closing the service graph",
  dbHousekeeping: "shutdown: db housekeeping",
  complete: "shutdown: complete",
  drainDeadline: "shutdown: drain deadline hit — force-closing remaining connections (long-lived streams do not end on their own)",
} as const;
