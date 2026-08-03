// persistence/queries — the owner-scoped reads + the read-seam parse. Load-bearing: a CORRUPT behavior blob
// degrades to the INERT script (empty pattern, no placements) rather than nulling the row, so a broken body
// never removes a name from the owner's library — they can still see it and fix it.

import { regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { describe } from "vitest";
import { listOwnedScripts, loadOwnedScript, loadOwnedScriptsByIds, toRow } from "../../../../../packages/server/src/domain/regex/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { behavior, seedScript, seedUser } from "../_support.ts";

describe("regex persistence queries", () => {
  test("toRow parses the blob at the read seam and flattens it onto the promoted columns", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = await seedScript(db, { ownerId: owner, name: "n", behavior: behavior({ findRegex: "x", replaceString: "y" }) });
    const [record] = await db.select().from(regexScripts).where(eq(regexScripts.id, id));
    expect(record).toBeDefined();

    const row = toRow(record as NonNullable<typeof record>);
    expect(row).toMatchObject({ id, name: "n", enabled: true, findRegex: "x", replaceString: "y" });
  });

  test("a CORRUPT behavior blob degrades to the INERT script, keeping the row visible", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const id = castId<RegexScriptId>("regex_script_corrupt");
    // Seed a VALID row, then corrupt its blob through raw SQL — the defect this pins is a runtime fact
    // (bytes on disk that no longer match the schema), so it is written the way it would really happen
    // rather than fabricated past the type system.
    await seedScript(db, { ownerId: owner, id, name: "broken but mine" });
    await db.run(sql`update regex_scripts set behavior = '{"findRegex":42,"placement":"nope"}' where id = ${id}`);

    const [record] = await db.select().from(regexScripts).where(eq(regexScripts.id, id));
    expect(record).toBeDefined();
    const row = toRow(record as NonNullable<typeof record>);
    // The NAME survives (the user can find and fix it) …
    expect(row.name).toBe("broken but mine");
    // … and the behavior is inert: no placements ⇒ every leg skips it, so it can never mis-transform text.
    expect(row.placement).toEqual([]);
    expect(row.findRegex).toBe("");
  });

  test("loadOwnedScript is owner-scoped in the WHERE (not filtered after the fact)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const id = await seedScript(db, { ownerId: owner, name: "mine" });

    expect(await loadOwnedScript(db, owner, id)).toBeDefined();
    expect(await loadOwnedScript(db, stranger, id)).toBeUndefined();
  });

  test("loadOwnedScriptsByIds returns ONLY the caller's — a foreign id simply does not come back", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    // This IS the carried-reference gate: the lift can only attach what comes back from here.
    const rows = await loadOwnedScriptsByIds(db, owner, [mine, theirs]);
    expect(rows.map((r) => r.id)).toEqual([mine]);
  });

  test("loadOwnedScriptsByIds short-circuits an empty id list", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    expect(await loadOwnedScriptsByIds(db, owner, [])).toEqual([]);
  });

  test("listOwnedScripts is newest-first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "old", createdAt: 1 });
    await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "new", createdAt: 2 });

    expect((await listOwnedScripts(db, owner)).map((r) => r.name)).toEqual(["new", "old"]);
  });
});
