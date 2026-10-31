// The globalSetup installed in every Vitest project and every Playwright run: the run owns its OS temp
// folder, so test folders and browser profiles go with it. Workers are spawned after global setup and inherit it.
import { acquireRunTempRoot } from "../process/run-temp-root.ts";

export default function runTempRootSetup(): () => void {
  return acquireRunTempRoot().release;
}
