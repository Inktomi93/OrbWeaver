// A root logger at the test record's level, for a case that builds a production piece without a server harness.

import type { Logger } from "@orb/server/foundation/observability";
import { createLogger } from "@orb/server/foundation/observability";
import { createTestEnv } from "./env.ts";

/** The logger a test root would build from its record: silent unless the case asks otherwise. */
export function createTestLogger(): Logger {
  return createLogger(createTestEnv().LOG_LEVEL, null);
}
