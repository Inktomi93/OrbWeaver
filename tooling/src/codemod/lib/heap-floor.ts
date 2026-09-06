// The heap floor refusal (#1775). A whole-project ts-morph run loads ~6k source files WITH the type
// graph; under node's own ~4GB self-cap it dies at exit 134 six minutes in, with a V8 abort for an
// error message. The workspace already states the floor — `pnpm-workspace.yaml`'s
// `nodeOptions: --max-old-space-size=16384` — but it only reaches `pnpm run` / `pnpm exec` children:
// a bare `node scripts/codemods/<name>.ts` (the spelling the kit's own recipe used to print) carries
// nothing. A loud refusal at second zero beats a six-minute OOM.

import { getHeapStatistics } from "node:v8";
import { CodemodError } from "./errors.ts";

/** The workspace heap floor in MiB. COUPLED SITE: `pnpm-workspace.yaml`'s `nodeOptions`
 *  `--max-old-space-size` value — `tests/tooling/codemod/lib/heap-floor.test.ts` re-derives it from
 *  that file and reds when the two drift. */
export const WORKSPACE_HEAP_FLOOR_MB = 16_384;

/** The sanctioned way to run a codemod script so it inherits the floor. */
export const CODEMOD_RUN_SPELLING = "pnpm codemod:run scripts/codemods/<name>.ts";

const BYTES_PER_MIB = 1_048_576;

/**
 * Refuse to start when this process's heap ceiling is below the workspace floor.
 *
 * `readHeapLimitBytes` is a parameter rather than a hidden global read so the refusal itself is
 * testable without spawning a differently-provisioned node.
 */
export function assertHeapFloor(readHeapLimitBytes: () => number = () => getHeapStatistics().heap_size_limit): void {
  const limitBytes = readHeapLimitBytes();
  if (limitBytes >= WORKSPACE_HEAP_FLOOR_MB * BYTES_PER_MIB) {
    return;
  }
  throw new CodemodError(
    `Heap ceiling is ${Math.round(limitBytes / BYTES_PER_MIB)} MiB — below the ${WORKSPACE_HEAP_FLOOR_MB} MiB workspace floor.`,
    `A whole-project ts-morph run needs the floor and dies at node's ~4GB self-cap (exit 134) minutes in. ` +
      `Run it as: ${CODEMOD_RUN_SPELLING} [--apply]. A bare \`node …\` and \`npx\` never carry the floor; ` +
      "`pnpm run` / `pnpm exec` children do (pnpm-workspace.yaml `nodeOptions`).",
  );
}
