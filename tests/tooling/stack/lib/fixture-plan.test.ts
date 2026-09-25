// The two-human fixture's env recipe: its own port pair from the registry, its own data root and run dir
// under the repo, the local sign-in mode, no `.env`, and the seed contract the seed tool reads.
import { join } from "node:path";
import { FIXTURE_PORTS } from "../../../../tooling/src/_shared/ports.ts";
import { FIXTURE_CREDENTIALS, FIXTURE_DIR_REL, fixtureEnv } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the recipe isolates ports, data and the run dir, and skips the operator's .env", () => {
  const env = fixtureEnv("/repo", {});
  expect(env["PORT"]).toBe(String(FIXTURE_PORTS.server));
  expect(env["VITE_PORT"]).toBe(String(FIXTURE_PORTS.vite));
  expect(env["VITE_API_TARGET"]).toBe(`http://127.0.0.1:${String(FIXTURE_PORTS.server)}`);
  expect(env["STACK_RUN_DIR"]).toBe(join("/repo", FIXTURE_DIR_REL, "stack"));
  expect(env["AUTH_MODE"]).toBe("local");
  expect(env["DATA_DIR"]).toBe("./.cache/multi-user-fixture");
  expect(env["DATABASE_URL"]).toBe("file:./.cache/multi-user-fixture/orb.db");
  expect(env["ORB_ENV_NO_FILE"]).toBe("1");
  expect(env["OWNER_HANDLES"]).toBe("owner");
});

test("the seed contract names the credentials the roster seeds, so snap and the seed cannot drift", () => {
  const env = fixtureEnv("/repo", {});
  const [owner, member] = FIXTURE_CREDENTIALS;
  expect(env["SEED_BASE_URL"]).toBe(`http://127.0.0.1:${String(FIXTURE_PORTS.server)}`);
  expect(env["FIXTURE_OWNER_HANDLE"]).toBe(owner?.handle);
  expect(env["FIXTURE_OWNER_PASSWORD"]).toBe(owner?.password);
  expect(env["LOCAL_INITIAL_PASSWORD"]).toBe(owner?.password);
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
