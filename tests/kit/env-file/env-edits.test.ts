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

// A line inside a quoted value that spans lines is the value's text, not an assignment: editing or deleting it corrupts
// the value its owner reads back.
test("a line inside a multi-line quoted value is never edited or deleted as an assignment", () => {
  for (const quote of ['"', "'", "`"]) {
    const held = `NOTE=${quote}first\n${KEY}=x\n  export ${KEY}=y\nlast${quote} # kept\n`;
    // The key has no assignment of its own, so a set appends it and a delete changes nothing.
    expect(applyEnvEdits(held, [{ key: KEY, value: "2" }], HEADER)).toBe(`${held}${KEY}=2\n`);
    expect(applyEnvEdits(held, [{ key: KEY, value: DELETE_ENV_LINE }], HEADER)).toBe(held);
    expect(applyEnvEdits(held, [{ key: KEY, value: null }], HEADER)).toBe(held);
    // Control: a real assignment after the closing quote is edited and deleted.
    expect(applyEnvEdits(`${held}${KEY}=1\n`, [{ key: KEY, value: "2" }], HEADER)).toBe(`${held}${KEY}=2\n`);
    expect(applyEnvEdits(`${held}${KEY}=1\n`, [{ key: KEY, value: DELETE_ENV_LINE }], HEADER)).toBe(held);
  }
});

test("an edited key whose own value spans lines is replaced or removed whole, and a null edit leaves it", () => {
  const spanning = `${KEY}="one\nOTHER=two\nthree" # kept\nAFTER=1\n`;
  expect(applyEnvEdits(`BEFORE=1\n${spanning}`, [{ key: KEY, value: "2" }], HEADER)).toBe(`BEFORE=1\n${KEY}=2 # kept\nAFTER=1\n`);
  expect(applyEnvEdits(`BEFORE=1\n${spanning}`, [{ key: KEY, value: DELETE_ENV_LINE }], HEADER)).toBe("BEFORE=1\nAFTER=1\n");
  // `null` keeps the lines and still counts the key as present, so nothing is appended.
  expect(applyEnvEdits(spanning, [{ key: KEY, value: null }], HEADER)).toBe(spanning);
  // The inner line names another key, which an edit of that key must not touch while it sits inside this value.
  expect(applyEnvEdits(spanning, [{ key: "OTHER", value: "9" }], HEADER)).toBe(`${spanning}OTHER=9\n`);
});

test("a multi-line quoted value keeps its CRLF line endings outside the edit and a quote that never closes ends at its own line", () => {
  const crlf = `NOTE="a\r\n${KEY}=x\r\nb"\r\n${KEY}=1\r\n`;
  expect(applyEnvEdits(crlf, [{ key: KEY, value: "2" }], HEADER)).toBe(`NOTE="a\r\n${KEY}=x\r\nb"\r\n${KEY}=2\r\n`);
  expect(applyEnvEdits(`${KEY}="2\r\nOTHER=1\r\nlast"\r\n`, [{ key: KEY, value: "3" }], HEADER)).toBe(`${KEY}=3\r\n`);
  // The server's parse reads an unclosed quote as a one-line value, so the lines after it stay assignments.
  expect(applyEnvEdits(`NOTE="open\n${KEY}=1\n`, [{ key: KEY, value: "2" }], HEADER)).toBe(`NOTE="open\n${KEY}=2\n`);
});
