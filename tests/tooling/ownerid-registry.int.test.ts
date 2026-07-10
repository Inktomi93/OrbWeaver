// Self-test for the DORMANT `ownerid-registry` gate (scripts/check/gates/ownerid-registry.ts — D23/D30/
// D21 ownership-stamp rule; held out of ALL_CHECKS pending doc reconciliation). Drives the Check directly
// over in-memory ts-morph projects (never the real tree), proving: an unlisted-table ownerId fires, an
// allowlisted-table ownerId passes, and BOTH ratchet arms hold via an injected allowlist (the stale-entry
// arm — a listed table with no ownerId column present).
import { createOwnerIdRegistry } from "../../scripts/check/gates/ownerid-registry.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const SCHEMA = "packages/db/src/schema/thing.ts";

/** A schema module declaring one `sqliteTable` with the given columns body. */
function table(sqlName: string, cols: string): string {
  return `export const t = sqliteTable("${sqlName}", { ${cols} });\n`;
}

test("fires on an ownerId stamped on a table NOT in the allowlist", () => {
  const gate = createOwnerIdRegistry({ characters: "test" });
  // `characters` present (satisfies the allowlist → no stale arm); `chats` is the unlisted stamp.
  const src =
    table("characters", 'ownerId: text("owner_id")') + table("chats", 'ownerId: text("owner_id")');
  const v = gate.run(ctxFor({ [SCHEMA]: src }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D23");
});

test("passes an ownerId on an allowlisted table", () => {
  const gate = createOwnerIdRegistry({ characters: "test" });
  expect(gate.run(ctxFor({ [SCHEMA]: table("characters", 'ownerId: text("owner_id")') }))).toEqual(
    [],
  );
});

test("ignores a table with no ownerId column", () => {
  const gate = createOwnerIdRegistry({ characters: "test" });
  expect(gate.run(ctxFor({ [SCHEMA]: table("chats", 'id: text("id").primaryKey()') }))).toEqual([]);
});

test("ratchet stale-arm: a listed table with no ownerId present anywhere is RED", () => {
  const gate = createOwnerIdRegistry({ characters: "test", personas: "test" });
  // `characters` has ownerId (seen), `personas` is listed but absent → stale.
  const v = gate.run(ctxFor({ [SCHEMA]: table("characters", 'ownerId: text("owner_id")') }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("stale");
});

test("vacuous on a tree with no ownerId tables (never flags stale)", () => {
  const gate = createOwnerIdRegistry({ characters: "test" });
  expect(gate.run(ctxFor({ [SCHEMA]: table("chats", 'id: text("id").primaryKey()') }))).toEqual([]);
});
