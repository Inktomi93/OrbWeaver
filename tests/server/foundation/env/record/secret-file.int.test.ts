// `<KEY>_FILE` over the real file reader: the line ending a file was saved with is not part of the secret, an empty
// file means unset, and a database URL with stray whitespace is refused rather than opened as a different database.
// @subject packages/server/src/foundation/env/record/index.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_URL_KEY } from "@orb/server/foundation/data-layout";
import type { Env } from "@orb/server/foundation/env/record";
import { parseEnv } from "@orb/server/foundation/env/record";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import { expect, test } from "@orb/testkit/node";

const DATABASE_URL_FILE_KEY = `${DATABASE_URL_KEY}_FILE`;
const SESSION_SECRET_FILE_KEY = "SESSION_SECRET_FILE";
const DATABASE_URL = "file:/srv/orb/crlf.db";
const SESSION_SECRET = "s".repeat(40);
const UTF8_BOM = String.fromCodePoint(0xfe_ff);

function parseWith(source: Readonly<Record<string, string>>): Env {
  return parseEnv({
    source: { ["NODE_ENV"]: "test", ...source },
    envFileKeys: new Set(),
    host: { containerMarker: false, hostname: "orb-test-machine" },
    readFile: (path) => readFileSync(path, "utf8"),
  });
}

function fileHolding(directory: string, name: string, bytes: string): string {
  const path = join(directory, name);
  writeFileSync(path, bytes);
  return path;
}

test("a CRLF secret file loses its line ending for every key, and an empty file means unset", ({ importStagingDir }) => {
  const crlfUrl = fileHolding(importStagingDir, "url", `${DATABASE_URL}\r\n`);
  const crlfSecret = fileHolding(importStagingDir, "secret", `${SESSION_SECRET}\r\n`);
  const parsed = parseWith({ [DATABASE_URL_FILE_KEY]: crlfUrl, [SESSION_SECRET_FILE_KEY]: crlfSecret });
  expect(parsed.DATABASE_URL).toBe(DATABASE_URL);
  expect(parsed.SESSION_SECRET).toBe(SESSION_SECRET);

  const empty = parseWith({ [DATABASE_URL_FILE_KEY]: fileHolding(importStagingDir, "empty", "") });
  expect(empty.DATABASE_URL).toBe(parseWith({}).DATABASE_URL);
});

test("a database URL with surrounding whitespace is refused from a file or the env, and the refusal prints no value", ({ importStagingDir }) => {
  const credential = "planted-url-credential";
  const url = `libsql://db.example.test?authToken=${credential}`;
  const refusals = [
    { [DATABASE_URL_FILE_KEY]: fileHolding(importStagingDir, "space", `${url} \n`) },
    { [DATABASE_URL_FILE_KEY]: fileHolding(importStagingDir, "bom", `${UTF8_BOM}${url}\n`) },
    { [DATABASE_URL_KEY]: ` ${url}` },
  ];
  for (const source of refusals) {
    expect(() => parseWith(source)).toThrow(EnvRefusedError);
    expect(() => parseWith(source)).not.toThrow(credential);
  }
  expect(parseWith({ [DATABASE_URL_KEY]: url }).DATABASE_URL).toBe(url);
});
