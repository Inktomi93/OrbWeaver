// Library calls cannot safely restart a caller that may already have performed work.
// Require an intentional heap or the workspace floor before constructing whole-program compiler state.

import { getHeapStatistics } from "node:v8";
import { hasNodeHeapConfiguration, workspaceNodeHeapFloorMiB } from "../../floor/process/node-heap.ts";
import { CodemodError } from "./errors.ts";

/** Default capacity for callers that supplied no explicit native heap limit. */
export const WORKSPACE_HEAP_FLOOR_MB = workspaceNodeHeapFloorMiB();

/** The sanctioned way to run a codemod script so it inherits the floor. */
export const CODEMOD_RUN_SPELLING = "pnpm codemod:run scripts/codemods/<name>.ts";

const BYTES_PER_MIB = 1_048_576;

/**
 * Refuse an unconfigured process below the workspace floor; preserve deliberate native overrides.
 *
 * `readHeapLimitBytes` is a parameter rather than a hidden global read so the refusal itself is
 * testable without spawning a differently-provisioned node.
 */
export function assertHeapFloor(readHeapLimitBytes: () => number = () => getHeapStatistics().heap_size_limit): void {
  if (hasNodeHeapConfiguration()) {
    return;
  }
  const limitBytes = readHeapLimitBytes();
  if (limitBytes >= WORKSPACE_HEAP_FLOOR_MB * BYTES_PER_MIB) {
    return;
  }
  throw new CodemodError(
    `Heap ceiling is ${Math.round(limitBytes / BYTES_PER_MIB)} MiB — below the ${WORKSPACE_HEAP_FLOOR_MB} MiB workspace floor.`,
    `Run it as: ${CODEMOD_RUN_SPELLING} [--apply], or set an explicit Node heap limit. ` +
      "The library cannot restart a caller after its earlier work; owned CLI entrypoints establish the workspace default before operations.",
  );
}
