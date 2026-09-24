// @orb/kit/env-file — the one `.env` key writer the setup op and the server's restart verb share. It edits only the
// named keys, byte-for-byte elsewhere; `null` leaves a key's lines and DELETE_ENV_LINE removes them.
import { parseEnv } from "node:util";
import type { EnvEdit } from "@orb/kit/env-file";
import { applyEnvEdits, DELETE_ENV_LINE } from "@orb/kit/env-file";
import { expect, test } from "../../support/fixtures.ts";

const HEADER = "# written by a test";

function edits(...pairs: readonly (readonly [string, EnvEdit["value"]])[]): readonly EnvEdit[] {
  return pairs.map(([key, value]) => ({ key, value }));
}

const LOCAL = edits(["PORT", "9100"], ["AUTH_MODE", "local"], ["ALLOWED_HOSTS", null]);

test("a new file is the header and one line per set key, in edit order; a left or deleted key writes nothing", () => {
  const text = applyEnvEdits(null, [...LOCAL, { key: "BIND_HOST", value: DELETE_ENV_LINE }], HEADER);
  expect(text).toBe(`${HEADER}\nPORT=9100\nAUTH_MODE=local\n`);
  expect(Object.keys(parseEnv(text)).sort()).toEqual(["AUTH_MODE", "PORT"]);
});

test("an edit changes only the edited values: every other line, comment, blank, BOM and CRLF ending survives", () => {
  const before = [
    "﻿# my notes about this box",
    "OPENROUTER_API_KEY=sk-or-abc   # the cloud key",
    "",
    "#AUTH_MODE=single-user",
    "export PORT=8788 # moved later",
    'AUTH_MODE="single-user"',
    "LOG_LEVEL=debug",
    "",
  ].join("\r\n");
  const expected = [
    "﻿# my notes about this box",
    "OPENROUTER_API_KEY=sk-or-abc   # the cloud key",
    "",
    "#AUTH_MODE=single-user",
    "export PORT=9100 # moved later",
    "AUTH_MODE=local",
    "LOG_LEVEL=debug",
    "",
  ].join("\r\n");
  expect(applyEnvEdits(before, LOCAL, HEADER)).toBe(expected);
});

test("a set key the file lacks is appended once, in the file's own line ending, after a final newline", () => {
  expect(applyEnvEdits("LOG_LEVEL=debug", LOCAL, HEADER)).toBe("LOG_LEVEL=debug\nPORT=9100\nAUTH_MODE=local\n");
  expect(applyEnvEdits("LOG_LEVEL=debug\r\n", LOCAL, HEADER)).toBe("LOG_LEVEL=debug\r\nPORT=9100\r\nAUTH_MODE=local\r\n");
  expect(applyEnvEdits("#PORT=1\n", LOCAL, HEADER)).toBe("#PORT=1\nPORT=9100\nAUTH_MODE=local\n");
  expect(applyEnvEdits("", LOCAL, HEADER)).toBe("PORT=9100\nAUTH_MODE=local\n");
});

test("every assignment of an edited key is rewritten, and the same edits applied twice give the same bytes", () => {
  expect(applyEnvEdits("PORT=1\nPORT=2\n", LOCAL, HEADER)).toBe("PORT=9100\nPORT=9100\nAUTH_MODE=local\n");
  const once = applyEnvEdits("# kept\nPORT=1\nX=y\n", LOCAL, HEADER);
  expect(applyEnvEdits(once, LOCAL, HEADER)).toBe(once);
  const fresh = applyEnvEdits(null, LOCAL, HEADER);
  expect(applyEnvEdits(fresh, LOCAL, HEADER)).toBe(fresh);
});

test("null leaves a key's lines as they are, inline comment and all, and never appends it", () => {
  const named = edits(["PORT", "9100"], ["AUTH_MODE", "local"], ["ALLOWED_HOSTS", "orb.lan"]);
  expect(applyEnvEdits("# mine\nALLOWED_HOSTS=old.lan # kept comment\n", named, HEADER)).toBe(
    "# mine\nALLOWED_HOSTS=orb.lan # kept comment\nPORT=9100\nAUTH_MODE=local\n",
  );
  expect(applyEnvEdits("ALLOWED_HOSTS=old.lan\n", LOCAL, HEADER)).toBe("ALLOWED_HOSTS=old.lan\nPORT=9100\nAUTH_MODE=local\n");
});

test("the delete value removes every BIND_HOST line with its ending, while null leaves the same file's line", () => {
  const before = "PORT=8788\nBIND_HOST=127.0.0.1\nexport BIND_HOST = '127.0.0.1' # loopback\nLOG_LEVEL=debug\n";
  expect(applyEnvEdits(before, edits(["BIND_HOST", DELETE_ENV_LINE]), HEADER)).toBe("PORT=8788\nLOG_LEVEL=debug\n");
  expect(applyEnvEdits("A=1\r\nBIND_HOST=127.0.0.1\r\nB=2\r\n", edits(["BIND_HOST", DELETE_ENV_LINE]), HEADER)).toBe("A=1\r\nB=2\r\n");
  expect(applyEnvEdits("A=1\nBIND_HOST=127.0.0.1", edits(["BIND_HOST", DELETE_ENV_LINE]), HEADER)).toBe("A=1");
  // Control: the same file under `null` is untouched, and a commented-out line is the operator's note, never a value.
  expect(applyEnvEdits(before, edits(["BIND_HOST", null]), HEADER)).toBe(before);
  expect(applyEnvEdits("#BIND_HOST=0.0.0.0\n", edits(["BIND_HOST", DELETE_ENV_LINE]), HEADER)).toBe("#BIND_HOST=0.0.0.0\n");
  // A delete of a key the file lacks appends nothing.
  expect(applyEnvEdits("PORT=1\n", edits(["BIND_HOST", DELETE_ENV_LINE]), HEADER)).toBe("PORT=1\n");
});

test("a key is matched literally and whole: a longer name that starts with it is a different key", () => {
  expect(applyEnvEdits("PORT_X=1\nPORT=2\n", edits(["PORT", "3"]), HEADER)).toBe("PORT_X=1\nPORT=3\n");
});
