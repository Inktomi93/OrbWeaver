// An edit finds its key in the file in any letter case and keeps the file's spelling, because the server reads a name
// in any case and refuses two spellings of one: an edit that appended a second spelling would stop the next boot.
// @subject packages/kit/src/env-file/index.ts
import { applyEnvEdits, DELETE_ENV_LINE } from "@orb/kit/env-file";
import { expect, test } from "@orb/testkit/node";

const KEY = "ORB_SAMPLE_KNOB";
const HEADER = "# sample";

test("an edit rewrites or deletes the file's own lower-case spelling of its key and appends no second spelling", () => {
  // Control: a file without the key gets the key appended in the edit's spelling.
  expect(applyEnvEdits("OTHER=1\n", [{ key: KEY, value: "2" }], HEADER)).toBe(`OTHER=1\n${KEY}=2\n`);

  const lower = KEY.toLowerCase();
  expect(applyEnvEdits(`export ${lower} = "1" # kept\n`, [{ key: KEY, value: "2" }], HEADER)).toBe(`export ${lower} = 2 # kept\n`);
  expect(applyEnvEdits(`OTHER=1\n${lower}=1\n`, [{ key: KEY, value: DELETE_ENV_LINE }], HEADER)).toBe("OTHER=1\n");
});
