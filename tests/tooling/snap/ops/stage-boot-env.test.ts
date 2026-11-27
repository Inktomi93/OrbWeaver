// @subject tooling/src/snap/ops/stage.ts
// A stage's boot env never carries a provider key from the caller's shell: the server stores `OPENROUTER_API_KEY` as a
// credential at boot, so an exported key would land on a stage that did not ask for one. `--stage-connection` delivers
// a key as a credential call's body, never through this env.
import { expect, test } from "@orb/testkit/tooling";
import { stageBandPorts } from "../../../../tooling/src/floor/host/ports.ts";
import { withProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { STAGE_CONNECTION_KEY_NAMES } from "../../../../tooling/src/snap/contract/stage-connection.ts";
import { STAGE_INHERITED_ENV_KEYS, stagePaths } from "../../../../tooling/src/snap/lib/stage-plan.ts";
import { stageBootEnv } from "../../../../tooling/src/snap/ops/stage.ts";

const ROOT = "/stage-boot-env/repo";
const SHA = "a".repeat(40);
const PLANTED = "stage-boot-env-planted-key-3c91d7";
const KEPT = "stage-boot-env-kept-value";
const KEPT_NAME = "STAGE_BOOT_ENV_KEPT";

/** Plant every provider key name in the process env at once, as a shell that exports them all would. */
async function withEveryProviderKey<T>(run: () => Promise<T>): Promise<T> {
  const plant = async (names: readonly string[]): Promise<T> => {
    const [name, ...rest] = names;
    return name === undefined ? await run() : await withProcessEnv(name, PLANTED, () => plant(rest));
  };
  return await plant(STAGE_CONNECTION_KEY_NAMES);
}

test("no provider key name from the caller's shell reaches a stage boot, and the stage's own keys still do", async () => {
  const ports = stageBandPorts(0);
  const inherited = Object.fromEntries(STAGE_INHERITED_ENV_KEYS.map((name) => [name, `${name}-value`]));
  const env = await withProcessEnv(KEPT_NAME, KEPT, () => withEveryProviderKey(() => Promise.resolve(stageBootEnv(stagePaths(ROOT, SHA), ports, inherited))));

  // The control: ambient values and the stage's inherited DB-bound keys do come through, so the absence below is a filter and not an empty env.
  expect(env[KEPT_NAME]).toBe(KEPT);
  for (const name of STAGE_INHERITED_ENV_KEYS) {
    expect(env[name]).toBe(`${name}-value`);
  }
  expect(STAGE_CONNECTION_KEY_NAMES.filter((name) => env[name] !== undefined)).toEqual([]);
  expect(JSON.stringify(env)).not.toContain(PLANTED);
});
