// Native dependency-cruiser keeps its rules; the shared world vocabulary supplies helper entry roots.
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { IMPORT_ENTRY_ROOTS } from "@orb/tooling/floor/compiler/import-population";
import { isWorldHelperPath } from "@orb/tooling/floor/compiler/project-worlds";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const root = fileURLToPath(new URL("../", import.meta.url));
const entries = IMPORT_ENTRY_ROOTS.filter((dir) => !isWorldHelperPath(dir) || existsSync(join(root, dir)));
const result = runNicedSync(join(root, "node_modules/.bin/depcruise"), [...entries, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? EXIT.toolError;
