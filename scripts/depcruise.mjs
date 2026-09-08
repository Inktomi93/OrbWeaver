// Native dependency-cruiser keeps its rules; the shared world vocabulary supplies helper entry roots.
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { HELPER_WORLD_DIRS } from "@orb/tooling/_shared/project-worlds";

const root = fileURLToPath(new URL("../", import.meta.url));
const helpers = Object.values(HELPER_WORLD_DIRS).filter((dir) => existsSync(join(root, dir)));
const result = runNicedSync(join(root, "node_modules/.bin/depcruise"), ["packages", "tooling", ...helpers, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? EXIT.toolError;
