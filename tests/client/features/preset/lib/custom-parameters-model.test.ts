// The customParameters editor's pure model (D143a) — the row↔record round trip and the PENDING marker that
// makes an unfinished row hold the autosave instead of vanishing from the blob.

import {
  customParameterRecord,
  customParameterRowError,
  customParameterRows,
  newCustomParameterRow,
  parseCustomParameterValue,
  pendingCustomParameterNames,
} from "../../../../../packages/client/src/features/preset/lib/custom-parameters-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const DRY = "dry_multiplier";
const DUPLICATE_RE = /already uses this name/;
const BLANK_NAME_RE = /Give this parameter a name/;
const INVALID_JSON_RE = /Not valid JSON/;

test("rows seed from the stored blob with the value as JSON SOURCE, in the record's own order", () => {
  const rows = customParameterRows(
    Object.fromEntries([
      [DRY, 0.8],
      ["transforms", ["middle-out"]],
    ]),
  );
  expect(rows.map((row) => row.key)).toEqual([DRY, "transforms"]);
  expect(rows.map((row) => row.text)).toEqual(["0.8", '["middle-out"]']);
  // Ids are unique per row — renaming must not remount the cell the author is typing in.
  expect(new Set(rows.map((row) => row.id)).size).toBe(2);
});

test("a clean row list rebuilds the record with parsed values; an EMPTY list unsets the field", () => {
  const rows = [
    { id: "a", key: DRY, text: "0.8" },
    { id: "b", key: "provider", text: '{"order":["x"]}' },
  ];
  expect(customParameterRecord(rows)).toEqual(
    Object.fromEntries([
      [DRY, 0.8],
      ["provider", { order: ["x"] }],
    ]),
  );
  // Not `{}` — an empty editor means the preset carries no escape hatch at all.
  expect(customParameterRecord([])).toBeUndefined();
});

test("an unfinished row commits the PENDING marker, and that is what the form validator refuses", () => {
  const rows = [
    { id: "a", key: DRY, text: "0.8" },
    { id: "b", key: "top_a", text: "{oops" },
  ];
  const record = customParameterRecord(rows);
  expect(record?.[DRY]).toBe(0.8);
  // The slot SURVIVES with an explicit `undefined`: dropping it would delete a parameter mid-edit, and
  // keeping the last good value would let the header read "Saved" over text that parses to nothing.
  expect(record !== undefined && "top_a" in record).toBe(true);
  expect(record?.["top_a"]).toBeUndefined();
  expect(pendingCustomParameterNames(record)).toEqual(["top_a"]);
});

test("a clean blob — and an absent one — leave the validator with nothing to refuse", () => {
  expect(pendingCustomParameterNames(undefined)).toEqual([]);
  expect(pendingCustomParameterNames(Object.fromEntries([[DRY, 0.8]]))).toEqual([]);
});

test("a blank name is a pending row, named for the message", () => {
  expect(pendingCustomParameterNames(customParameterRecord([{ id: "a", key: "", text: "1" }]))).toEqual(["(unnamed)"]);
});

test("row errors: blank name, duplicate name, unparseable value — and BOTH halves of a duplicate", () => {
  const rows = [
    { id: "a", key: "stream", text: "false" },
    { id: "b", key: "stream", text: "true" },
    { id: "c", key: "", text: "1" },
    { id: "d", key: "top_a", text: "0.1" },
    { id: "e", key: "top_k", text: "not json" },
  ];
  expect(customParameterRowError(rows, rows[0] as (typeof rows)[number])).toMatch(DUPLICATE_RE);
  expect(customParameterRowError(rows, rows[1] as (typeof rows)[number])).toMatch(DUPLICATE_RE);
  expect(customParameterRowError(rows, rows[2] as (typeof rows)[number])).toMatch(BLANK_NAME_RE);
  expect(customParameterRowError(rows, rows[3] as (typeof rows)[number])).toBeUndefined();
  expect(customParameterRowError(rows, rows[4] as (typeof rows)[number])).toMatch(INVALID_JSON_RE);
});

test("the value parse takes every JSON scalar and shape, and refuses blank rather than healing it to null", () => {
  expect(parseCustomParameterValue("0.8")).toEqual({ value: 0.8 });
  expect(parseCustomParameterValue("true")).toEqual({ value: true });
  expect(parseCustomParameterValue('"middle-out"')).toEqual({ value: "middle-out" });
  expect(parseCustomParameterValue("null")).toEqual({ value: null });
  expect(parseCustomParameterValue(" [1,2] ")).toEqual({ value: [1, 2] });
  // A bare word is NOT healed to a string: the editor says so instead of sending a value nobody wrote.
  expect(parseCustomParameterValue("middle-out")).toBeUndefined();
  expect(parseCustomParameterValue("   ")).toBeUndefined();
});

test("a new row is born with a name that is unique in the list", () => {
  const first = newCustomParameterRow([]);
  expect(first.key).toBe("new_parameter");
  expect(newCustomParameterRow([first]).key).toBe("new_parameter_2");
});
