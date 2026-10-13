// Native dependency-cruiser keeps its rules; the shared world vocabulary supplies helper entry roots.
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { readAuthoredRepositoryInventory } from "@orb/tooling/floor/compiler/authored-repository";
import { selectImportEntries } from "@orb/tooling/floor/compiler/import-population";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const root = fileURLToPath(new URL("../", import.meta.url));
const entries = selectImportEntries(readAuthoredRepositoryInventory(root).paths).filter((path) => existsSync(join(root, path)));
if (entries.length === 0) {
  throw new Error("Native import inventory has no authored entry.");
}
const result = runNicedSync(join(root, "node_modules/.bin/depcruise"), [...entries, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exitCode = result.status ?? EXIT.toolError;
