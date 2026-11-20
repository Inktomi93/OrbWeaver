// The parse reads every name it knows in any letter case, on every platform: Windows holds `database_url` as the
// database URL, and the boot scrub already drops it in any case. Two spellings of one name, which only a
// case-sensitive platform or a `.env` file can hold, refuse the boot by name and never print a value.
// @subject packages/server/src/foundation/env/record/index.ts
import { AUTH_FALLBACK_KEY } from "@orb/contracts/identity";
import { DATABASE_URL_KEY } from "@orb/server/foundation/data-layout";
import type { Env } from "@orb/server/foundation/env/record";
import { parseEnv } from "@orb/server/foundation/env/record";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { expect, test } from "@orb/testkit/node";

const DATABASE = "file:/srv/orb/case.db";
const CREDENTIAL = "planted-case-credential";
const OTHER_DATABASE = `libsql://db.example.test?authToken=${CREDENTIAL}`;
const SECRET_PATH = "/run/secrets/orb-database-url";
const LOWER = DATABASE_URL_KEY.toLowerCase();

function parseWith(source: Readonly<Record<string, string>>, envFileKeys: ReadonlySet<string> = new Set()): Env {
  return parseEnv({
    source: { ["NODE_ENV"]: "test", ...source },
    envFileKeys,
    host: { containerMarker: false, hostname: "orb-test-machine" },
    readFile: (path) => (path === SECRET_PATH ? `${OTHER_DATABASE}\n` : ""),
  });
}

function refusalOf(parse: () => unknown): EnvRefusedError {
  try {
    parse();
  } catch (error) {
    if (error instanceof EnvRefusedError) {
      return error;
    }
    throw error;
  }
  throw new Error("the parse was not refused");
}

test("a lower-case database name and a lower-case secret-file name are read as the schema's own", () => {
  // Control: the default is some other database, so a read-back of DATABASE is the lower-case name's doing.
  expect(parseWith({}).DATABASE_URL).not.toBe(DATABASE);
  expect(parseWith({ [DATABASE_URL_KEY]: DATABASE }).DATABASE_URL).toBe(DATABASE);

  expect(parseWith({ [LOWER]: DATABASE }).DATABASE_URL).toBe(DATABASE);
  expect(parseWith({ [`${LOWER}_file`]: SECRET_PATH }).DATABASE_URL).toBe(OTHER_DATABASE);
});

test("two spellings of one name in the environment refuse the parse, naming both and printing no value", () => {
  const refusal = refusalOf(() => parseWith({ [DATABASE_URL_KEY]: DATABASE, [LOWER]: OTHER_DATABASE }));

  expect(refusal.message).toContain(`${DATABASE_URL_KEY} and ${LOWER}`);
  expect(refusal.message).not.toContain(DATABASE);
  expect(refusal.message).not.toContain(CREDENTIAL);
});

test("a .env that declares one name in two spellings, or a launch-only key in lower case, refuses the parse", () => {
  // Control: one spelling of an ordinary name in the file is no refusal.
  expect(parseWith({}, new Set([LOWER])).DATABASE_URL).toBe(parseWith({}).DATABASE_URL);

  expect(refusalOf(() => parseWith({}, new Set([DATABASE_URL_KEY, LOWER]))).message).toContain(`${DATABASE_URL_KEY} and ${LOWER}`);
  expect(refusalOf(() => parseWith({}, new Set([AUTH_FALLBACK_KEY.toLowerCase()]))).message).toContain(`${AUTH_FALLBACK_KEY} must not be set in .env`);
});
