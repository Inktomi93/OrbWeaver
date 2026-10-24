// A parsed env record for a test root, through the production parse, so a value production refuses is refused here.
// The posture is a test build on a bare-metal machine with a fixed name, background corpus indexing off and the logger
// silent; a test record has no `.env` file, so no case reads the runner's own container markers or host name.

import { readFileSync } from "node:fs";
import type { Env, EnvKey, HostFacts } from "@orb/server/foundation/env/record";
import { parseEnv } from "@orb/server/foundation/env/record";

const TEST_ENV_POSTURE: Partial<Record<EnvKey, string>> = { ["NODE_ENV"]: "test", ["CORPUS_AUTOINDEX"]: "false", ["LOG_LEVEL"]: "silent" };

// The machine a test record states unless the case names another.
const TEST_HOST_FACTS: HostFacts = { containerMarker: false, hostname: "orb-test-machine" };

/** The test posture with `input` laid over it, and `host` over the test machine, parsed as boot parses the process. */
export function createTestEnv(input: Partial<Record<EnvKey, string>> = {}, host: Partial<HostFacts> = {}): Env {
  return parseEnv({
    source: { ...TEST_ENV_POSTURE, ...input },
    envFileKeys: new Set(),
    host: { ...TEST_HOST_FACTS, ...host },
    readFile: (path) => readFileSync(path, "utf8"),
  });
}
