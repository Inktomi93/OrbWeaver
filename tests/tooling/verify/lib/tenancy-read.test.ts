import { Project, SyntaxKind } from "ts-morph";
import { isDrizzleWriteStatement, upsertConfigOf, whereArgOf } from "../../../../tooling/src/verify/lib/tenancy-read.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("static bracket chains retain their WHERE and conflict-update scoping inputs", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    "/tenancy-read/probe.ts",
    'db.update(table)["set"]({ value: 1 })["where"](eq(table.ownerId, callerId));\n' +
      'db.insert(table)["values"]({ value: 1 })["onConflictDoUpdate"]({ target: table.id, set: { value: 2 }, setWhere: eq(table.ownerId, callerId) });\n' +
      "cache.delete(table);\n",
  );
  const calls = file.getDescendantsOfKind(SyntaxKind.CallExpression);
  const update = calls.find((call) => call.getExpression().getText() === "db.update");
  const insert = calls.find((call) => call.getExpression().getText() === "db.insert");
  const cacheDelete = calls.find((call) => call.getExpression().getText() === "cache.delete");
  if (update === undefined || insert === undefined || cacheDelete === undefined) {
    throw new Error("the authored write anchors must exist");
  }

  expect(isDrizzleWriteStatement(update)).toBe(true);
  expect(whereArgOf(update)?.getText()).toBe("eq(table.ownerId, callerId)");
  expect(isDrizzleWriteStatement(insert)).toBe(true);
  expect(upsertConfigOf(insert)?.getText()).toBe("{ target: table.id, set: { value: 2 }, setWhere: eq(table.ownerId, callerId) }");
  expect(isDrizzleWriteStatement(cacheDelete)).toBe(false);
  expect(whereArgOf(cacheDelete)).toBeUndefined();
  expect(upsertConfigOf(cacheDelete)).toBeUndefined();
});
