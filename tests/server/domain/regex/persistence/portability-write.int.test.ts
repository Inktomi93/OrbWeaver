// persistence/portability-write — the card LIFT, the card RE-EMBED, and the backup-bundle export/import
// pair (D121-E §3.4). These four ops are what make a card portable BOTH ways once scripts stopped being a
// column, and the properties below are the ones the old embed-by-value shape could not have had.
//
// THE BEHAVIORAL ROUND-TRIPS pinned here:
//   • CARD, same install: export a character → its scripts re-embed by value AND as references → re-import
//     re-links the references, minting ZERO duplicate rows.
//   • CARD, foreign install: no references resolve, so the by-value payload lifts into fresh rows, and a
//     SECOND foreign import content-dedups against the library instead of cloning again.
//   • BUNDLE, fresh tenant: export the owner's library → import on a DIFFERENT owner → rows exist, the
//     GLOBAL attachment rides, and re-importing the same bundle writes nothing.

import type { RegexScriptCard } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import { characterRegexScripts, globalRegexScripts, regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  createExportCardScripts,
  createExportRegexScripts,
  createImportCardScripts,
  createImportRegexScript,
} from "../../../../../packages/server/src/domain/regex/persistence/portability-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { behavior, makeHarness, principal, seedCharacter, seedScript, seedUser } from "../_support.ts";

const FROZEN = 1_700_000_000_000;

/** A deterministic id minter (the determinism seam — never an ambient `mintTypeId`). */
function minter(prefix: string): () => RegexScriptId {
  let n = 0;
  return (): RegexScriptId => {
    n += 1;
    return castId<RegexScriptId>(`regex_script_${prefix}${n}`);
  };
}

function ctxOf(db: Db, prefix: string): { db: Db; now: () => number; newScriptId: () => RegexScriptId } {
  return { db, now: (): number => FROZEN, newScriptId: minter(prefix) };
}

/** An ST card-wire script (a foreign client-minted id, exactly as a card carries one). */
function cardScript(id: string, name: string, findRegex: string): RegexScriptCard {
  return { id, name, enabled: true, ...behavior({ findRegex, replaceString: "x" }) };
}

describe("card LIFT", () => {
  test("a FOREIGN card mints rows and attaches them in CARD order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);

    const result = await createImportCardScripts(ctxOf(db, "l"))({
      ownerId: owner,
      characterId,
      scripts: [cardScript("st-1", "first", "a"), cardScript("st-2", "second", "b")],
      carried: [],
    });

    expect(result).toEqual({ created: 2, reused: 0 });
    const attached = await db.select().from(characterRegexScripts).where(eq(characterRegexScripts.characterId, characterId));
    // Position IS the card's script order, so the character's execution order matches the card's.
    expect(attached.sort((a, b) => a.position - b.position).map((r) => r.position)).toEqual([0, 1]);
    expect((await db.select().from(regexScripts)).map((r) => r.name).sort()).toEqual(["first", "second"]);
  });

  test("CARRIED REFERENCES WIN: a same-install re-import attaches the existing rows, minting ZERO", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const existing = await seedScript(db, { ownerId: owner, name: "already mine", behavior: behavior({ findRegex: "a" }) });

    const result = await createImportCardScripts(ctxOf(db, "l"))({
      ownerId: owner,
      characterId,
      // The card carries BOTH channels — the reference AND the by-value copy of the same script.
      scripts: [cardScript("st-1", "already mine", "a")],
      carried: [existing],
    });

    expect(result).toEqual({ created: 0, reused: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(1);
    expect((await db.select().from(characterRegexScripts)).map((r) => r.regexScriptId)).toEqual([existing]);
  });

  test("a reference wins even when the row was EDITED after export — the stale by-value copy is NOT re-minted", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    // The LIVE row has been edited since the card was exported: same name, DIFFERENT body.
    const edited = await seedScript(db, { ownerId: owner, name: "tweaked", behavior: behavior({ findRegex: "new-pattern" }) });

    const result = await createImportCardScripts(ctxOf(db, "l"))({
      ownerId: owner,
      characterId,
      // The card still carries the OLD body by value…
      scripts: [cardScript("st-1", "tweaked", "old-pattern")],
      // …alongside the reference to the row that has since moved on.
      carried: [edited],
    });

    // Content dedup alone would MISS here (the bodies differ) and mint a second, stale row — the exact
    // duplication the reference channel exists to prevent. Any resolved reference therefore skips the
    // by-value payload wholesale.
    expect(result).toEqual({ created: 0, reused: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(1);
    const [row] = await db.select().from(regexScripts);
    expect(row?.behavior.findRegex).toBe("new-pattern");
  });

  test("a carried reference to a FOREIGN row is ignored (it never comes back from the owner-scoped read)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const characterId = await seedCharacter(db, owner);
    const theirs = await seedScript(db, { ownerId: stranger, name: "theirs" });

    const result = await createImportCardScripts(ctxOf(db, "l"))({ ownerId: owner, characterId, scripts: [], carried: [theirs] });

    // The reference channel can never launder a foreign script onto this owner's character.
    expect(result).toEqual({ created: 0, reused: 0 });
    expect(await db.select().from(characterRegexScripts)).toHaveLength(0);
  });

  test("CONTENT DEDUP: a second FOREIGN card carrying the same body reuses the row instead of cloning", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await seedCharacter(db, owner, "one");
    const second = await seedCharacter(db, owner, "two");
    const lift = createImportCardScripts(ctxOf(db, "l"));

    await lift({ ownerId: owner, characterId: first, scripts: [cardScript("st-a", "shared", "a")], carried: [] });
    // A DIFFERENT foreign id, same name + same body — re-importing card packs is the norm, and always-new
    // would breed hundreds of identical rows.
    const again = await lift({ ownerId: owner, characterId: second, scripts: [cardScript("st-b", "shared", "a")], carried: [] });

    expect(again).toEqual({ created: 0, reused: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(1);
    // Both characters point at the ONE row — which is exactly what makes the resolver's dedup meaningful.
    expect(await db.select().from(characterRegexScripts)).toHaveLength(2);
  });
});

describe("card RE-EMBED", () => {
  test("walks the junction back out in position order and carries the reference list", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: b });

    const out = await createExportCardScripts({ db })({ ownerId: owner, characterId });

    expect(out.scripts.map((s) => s.name)).toEqual(["a", "b"]);
    // The reference list is the same-install re-link channel (the PD-144 twin).
    expect(out.carried).toEqual([a, b]);
  });

  test("ROUND-TRIP, same install: export → lift re-links, zero duplicate rows, order preserved", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await seedCharacter(db, owner, "source");
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a", behavior: behavior({ findRegex: "a" }) });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b", behavior: behavior({ findRegex: "b" }) });
    await svc.attachToCharacter({ principal: principal(owner), characterId: source, scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId: source, scriptId: b });

    // EXPORT the card …
    const exported = await createExportCardScripts({ db })({ ownerId: owner, characterId: source });
    // … and IMPORT it back as a new character on the SAME install.
    const target = await seedCharacter(db, owner, "target");
    const result = await createImportCardScripts(ctxOf(db, "rt"))({
      ownerId: owner,
      characterId: target,
      scripts: exported.scripts,
      carried: exported.carried,
    });

    expect(result).toEqual({ created: 0, reused: 2 });
    expect(await db.select().from(regexScripts)).toHaveLength(2);
    const rows = await db.select().from(characterRegexScripts).where(eq(characterRegexScripts.characterId, target));
    expect(rows.sort((x, y) => x.position - y.position).map((r) => r.regexScriptId)).toEqual([a, b]);
  });
});

describe("BUNDLE round-trip (the `regex` portable entity)", () => {
  test("exports one file per owned script, carrying the GLOBAL attachment", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const g = await seedScript(db, { ownerId: owner, id: "regex_script_g", name: "everywhere" });
    await seedScript(db, { ownerId: owner, id: "regex_script_l", name: "local only" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: g });

    const files = await createExportRegexScripts({ db })({ ownerId: owner });

    expect(files).toHaveLength(2);
    const payloads = files.map((f) => JSON.parse(new TextDecoder().decode(f.bytes)) as { name: string; global: boolean });
    expect(payloads.find((p) => p.name === "everywhere")?.global).toBe(true);
    expect(payloads.find((p) => p.name === "local only")?.global).toBe(false);
  });

  test("ROUND-TRIP onto a FRESH TENANT: rows land under the new owner, the global attachment rides", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const source = await seedUser(db, { handle: castId<Handle>("source") });
    const g = await seedScript(db, { ownerId: source, id: "regex_script_g", name: "everywhere", behavior: behavior({ findRegex: "g" }) });
    await seedScript(db, { ownerId: source, id: "regex_script_l", name: "local only", behavior: behavior({ findRegex: "l" }) });
    await svc.attachGlobal({ principal: principal(source), scriptId: g });

    const files = await createExportRegexScripts({ db })({ ownerId: source });

    // A DIFFERENT tenant restores the bundle.
    const restored = await seedUser(db, { handle: castId<Handle>("restored") });
    const importOne = createImportRegexScript(ctxOf(db, "b"));
    // Bundle files are independent of each other (each mints its own row), so the restore is concurrent —
    // which also proves the import op does not rely on being called in any particular order.
    const outcomes = await Promise.all(files.map((file) => importOne({ ownerId: restored, bytes: file.bytes })));
    expect(outcomes).toEqual([{ created: true }, { created: true }]);

    const theirRows = await db.select().from(regexScripts).where(eq(regexScripts.ownerId, restored));
    expect(theirRows.map((r) => r.name).sort()).toEqual(["everywhere", "local only"]);
    // The GLOBAL attachment is a property of the script, so it travels; the other three scopes point at
    // rows the bundle cannot guarantee and are deliberately re-attached by hand.
    const globals = await db.select().from(globalRegexScripts);
    const restoredGlobalIds = new Set(theirRows.filter((r) => r.name === "everywhere").map((r) => r.id));
    expect(globals.some((row) => restoredGlobalIds.has(row.regexScriptId))).toBe(true);
  });

  test("re-importing the SAME bundle writes nothing the second time", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedScript(db, { ownerId: owner, id: "regex_script_x", name: "x", behavior: behavior({ findRegex: "x" }) });
    const files = await createExportRegexScripts({ db })({ ownerId: owner });
    const importOne = createImportRegexScript(ctxOf(db, "b"));

    const target = await seedUser(db, { handle: castId<Handle>("target") });
    const [only] = files;
    expect(only).toBeDefined();
    const bytes = (only as NonNullable<typeof only>).bytes;

    expect(await importOne({ ownerId: target, bytes })).toEqual({ created: true });
    // Idempotent by the SHARED dedup rule — the same one the card lift uses.
    expect(await importOne({ ownerId: target, bytes })).toEqual({ created: false });
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, target))).toHaveLength(1);
  });
});
