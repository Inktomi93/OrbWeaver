// The two-human fixture's env recipe: its own port pair from the registry, its own data root and run dir
// under the repo, the local sign-in mode, no `.env`, no provider key from the caller's shell, and the seed
// contract the seed tool reads.
import { join } from "node:path";
import { AUTH_MODE_KEY, OWNER_HANDLES_KEY } from "@orb/contracts/identity";
import { ENV_NO_FILE_KEY, secretFileEnvName } from "@orb/kit/env-file";
import { CREDENTIALS_KEY_ENV, SESSION_SECRET_ENV } from "@orb/server/foundation/data-layout";
import { LOCAL_INITIAL_PASSWORD_ENV } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/tooling";
import { ASSETS_DIR_KEY, DATABASE_URL_KEY } from "../../../../packages/server/src/foundation/data-layout/contract.ts";
import { FIXTURE_PORTS } from "../../../../tooling/src/floor/host/ports.ts";
import { PROVIDER_KEY_NAMES } from "../../../../tooling/src/floor/process/operator-keys.ts";
import { FIXTURE_CREDENTIALS, FIXTURE_DIR_REL, fixtureEnv, fixtureIdentityEnv } from "../../../../tooling/src/stack/index.ts";

test("the recipe isolates ports, data and the run dir, and skips the operator's .env", () => {
  const env = fixtureEnv("/repo", {});
  expect(env["PORT"]).toBe(String(FIXTURE_PORTS.server));
  expect(env["VITE_PORT"]).toBe(String(FIXTURE_PORTS.vite));
  expect(env["VITE_API_TARGET"]).toBe(`http://127.0.0.1:${String(FIXTURE_PORTS.server)}`);
  expect(env["STACK_RUN_DIR"]).toBe(join("/repo", FIXTURE_DIR_REL, "stack"));
  expect(env[AUTH_MODE_KEY]).toBe("local");
  expect(env["DATA_DIR"]).toBe("./.cache/multi-user-fixture");
  expect(env[DATABASE_URL_KEY]).toBe("file:./.cache/multi-user-fixture/orb.db");
  expect(env[ENV_NO_FILE_KEY]).toBe("1");
  expect(env[OWNER_HANDLES_KEY]).toBe("owner");
});

test("the seed contract names the credentials the roster seeds, so snap and the seed cannot drift", () => {
  const env = fixtureEnv("/repo", {});
  const [owner, member] = FIXTURE_CREDENTIALS;
  expect(env["SEED_BASE_URL"]).toBe(`http://127.0.0.1:${String(FIXTURE_PORTS.server)}`);
  expect(env["FIXTURE_OWNER_HANDLE"]).toBe(owner?.handle);
  expect(env["FIXTURE_OWNER_PASSWORD"]).toBe(owner?.password);
  expect(env[LOCAL_INITIAL_PASSWORD_ENV]).toBe(owner?.password);
  expect(env["FIXTURE_MEMBER_HANDLE"]).toBe(member?.handle);
  expect(env["FIXTURE_MEMBER_PASSWORD"]).toBe(member?.password);
});

test("FIXTURE_PORT and FIXTURE_VITE_PORT move the pair, and the seed and proxy targets follow", () => {
  const env = fixtureEnv(
    "/repo",
    Object.fromEntries([
      ["FIXTURE_PORT", "9300"],
      ["FIXTURE_VITE_PORT", "9301"],
    ]),
  );
  expect(env["PORT"]).toBe("9300");
  expect(env["VITE_PORT"]).toBe("9301");
  expect(env["VITE_API_TARGET"]).toBe("http://127.0.0.1:9300");
  expect(env["SEED_BASE_URL"]).toBe("http://127.0.0.1:9300");
});

// The fixture server seals `OPENROUTER_API_KEY` as its owner's credential at boot, under the fixture's public key, and
// its parse reads the key in any letter case and from its `<NAME>_FILE` path.
test("the recipe keeps the caller's ambient env and the fixture's own secrets, and drops every provider key spelling", () => {
  const planted = PROVIDER_KEY_NAMES.flatMap((name) => [name, secretFileEnvName(name), name.toLowerCase()]);
  const entries: [string, string][] = [...planted.map((name): [string, string] => [name, "fixture-plan-planted-key"]), ["FIXTURE_PLAN_KEPT", "kept"]];
  const ambient = Object.fromEntries(entries);

  const env = fixtureEnv("/repo", ambient);

  expect(env["FIXTURE_PLAN_KEPT"]).toBe("kept");
  expect(env[CREDENTIALS_KEY_ENV]).toBe(fixtureIdentityEnv(FIXTURE_PORTS.server)[CREDENTIALS_KEY_ENV]);
  expect(env[SESSION_SECRET_ENV]).toBe(fixtureIdentityEnv(FIXTURE_PORTS.server)[SESSION_SECRET_ENV]);
  expect(planted.filter((name) => Object.hasOwn(env, name))).toEqual([]);
});

test("the identity half carries sign-in and seed keys only, so a snap stage keeps its own band and data root", () => {
  const identity = fixtureIdentityEnv(8908);
  expect(identity[AUTH_MODE_KEY]).toBe("local");
  expect(identity["SEED_BASE_URL"]).toBe("http://127.0.0.1:8908");
  for (const key of ["PORT", "VITE_PORT", "VITE_API_TARGET", "STACK_RUN_DIR", "DATA_DIR", DATABASE_URL_KEY, ASSETS_DIR_KEY]) {
    expect(identity).not.toHaveProperty(key);
  }
});
