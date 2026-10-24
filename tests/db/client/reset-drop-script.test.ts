// @subject packages/db/src/client/index.ts

import { expect, test } from "@orb/testkit/node";
import { buildResetDropScript } from "#db/client/index.ts";

test("reset DDL drops dependencies before tables inside one transaction", () => {
  const script = buildResetDropScript([
    { type: "table", name: "records" },
    { type: "index", name: "records_index" },
    { type: "trigger", name: "records_trigger" },
    { type: "view", name: "records_view" },
  ]);

  expect(script).toBe(
    [
      "BEGIN;",
      'DROP trigger IF EXISTS "records_trigger";',
      'DROP view IF EXISTS "records_view";',
      'DROP index IF EXISTS "records_index";',
      'DROP table IF EXISTS "records";',
      "COMMIT;",
    ].join("\n"),
  );
});

test("embedded identifier quotes are doubled", () => {
  expect(buildResetDropScript([{ type: "table", name: 'name"with"quotes' }])).toBe('BEGIN;\nDROP table IF EXISTS "name""with""quotes";\nCOMMIT;');
});

test("an empty object list emits no transaction", () => {
  expect(buildResetDropScript([])).toBe("");
});
