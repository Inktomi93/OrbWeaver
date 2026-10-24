// A parsed env record for a test root, through the production parse, so a value production refuses is refused here.
// The posture is a test build with background corpus indexing off and the logger silent; a test record has no `.env` file.

import type { Env, EnvKey } from "@orb/server/foundation/env/record";
import { parseEnv } from "@orb/server/foundation/env/record";

const TEST_ENV_POSTURE: Partial<Record<EnvKey, string>> = { ["NODE_ENV"]: "test", ["CORPUS_AUTOINDEX"]: "false", ["LOG_LEVEL"]: "silent" };

/** The test posture with `input` laid over it, parsed as boot parses the process. */
export function createTestEnv(input: Partial<Record<EnvKey, string>> = {}): Env {
  return parseEnv({ ...TEST_ENV_POSTURE, ...input }, new Set());
}
