// Weekly checker proofs use the unchanged CT harness over the complementary native test directory.
import { join } from "node:path";
import { TOOLING_TEST_ROOT } from "@orb/tooling/_shared/test-population";
import { ctConfig } from "./playwright-ct.config.ts";

export default { ...ctConfig(), testDir: join(import.meta.dirname, TOOLING_TEST_ROOT) };
