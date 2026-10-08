// Native dependency-cruiser keeps its rules; the shared world vocabulary supplies helper entry roots.
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { IMPORT_ENTRY_ROOTS } from "@orb/tooling/_shared/import-population";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { isWorldHelperPath } from "@orb/tooling/_shared/project-worlds";

const root = fileURLToPath(new URL("../", import.meta.url));
const entries = IMPORT_ENTRY_ROOTS.filter((dir) => !isWorldHelperPath(dir) || existsSync(join(root, dir)));
const result = runNicedSync(join(root, "node_modules/.bin/depcruise"), [...entries, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? EXIT.toolError;
