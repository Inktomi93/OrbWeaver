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
import { characterRegexScripts, globalRegexScripts, presetRegexScripts, regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  createExportCardScripts,
  createExportRegexScript,
  createExportRegexScripts,
  createImportCardScripts,
  createImportGlobalScripts,
  createImportPresetScripts,
  createImportRegexScript,
} from "../../../../../packages/server/src/domain/regex/persistence/portability-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { behavior, makeHarness, principal, seedCharacter, seedPreset, seedScript, seedUser } from "../_support.ts";

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

// ── the ST-profile lifts (the silent-gap sweep, 2026-08-15) — the card lift's two twins ─────────────────
// PRESET: ST's presetManager stores the regex extension's preset-scoped scripts ON the preset
// (`extensions.regex_scripts` — 15 real scripts on the corpus's Marinara preset, previously ignored with no
// report line). GLOBAL: `extension_settings.regex` ("run on every chat") = orb's `global_regex_scripts`.

describe("PRESET lift", () => {
  test("mints rows and attaches them to the preset in file order; a re-run dedups to zero new rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const presetId = await seedPreset(db, owner);
    const lift = createImportPresetScripts(ctxOf(db, "p"));

    const first = await lift({ ownerId: owner, presetId, scripts: [cardScript("st-1", "first", "a"), cardScript("st-2", "second", "b")] });
    expect(first).toEqual({ created: 2, reused: 0 });
    const attached = await db.select().from(presetRegexScripts).where(eq(presetRegexScripts.presetId, presetId));
    expect(attached.sort((a, b) => a.position - b.position).map((r) => r.position)).toEqual([0, 1]);

    // The idempotent re-run: content-dedup attaches the existing rows, mints nothing, duplicates nothing.
    const again = await createImportPresetScripts(ctxOf(db, "q"))({
      ownerId: owner,
      presetId,
      scripts: [cardScript("st-1", "first", "a"), cardScript("st-2", "second", "b")],
    });
    expect(again).toEqual({ created: 0, reused: 2 });
    expect(await db.select().from(regexScripts)).toHaveLength(2);
    expect(await db.select().from(presetRegexScripts).where(eq(presetRegexScripts.presetId, presetId))).toHaveLength(2);
  });

  test("a preset script content-dedups against a library row a CARD lift already minted (one library, every scope)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const presetId = await seedPreset(db, owner);

    await createImportCardScripts(ctxOf(db, "c"))({ ownerId: owner, characterId, scripts: [cardScript("st-1", "shared", "a")], carried: [] });
    const result = await createImportPresetScripts(ctxOf(db, "p"))({ ownerId: owner, presetId, scripts: [cardScript("st-9", "shared", "a")] });

    expect(result).toEqual({ created: 0, reused: 1 });
    const rows = await db.select().from(regexScripts);
    expect(rows).toHaveLength(1);
    // ONE row, attached at BOTH scopes — the D121-E library property the embed-by-value shape could not have.
    expect(await db.select().from(characterRegexScripts)).toHaveLength(1);
    expect(await db.select().from(presetRegexScripts)).toHaveLength(1);
  });
});

describe("GLOBAL lift", () => {
  test("mints rows with the global attachment; a re-run re-asserts the attachment and mints nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const lift = createImportGlobalScripts(ctxOf(db, "g"));

    const first = await lift({ ownerId: owner, scripts: [cardScript("st-1", "everywhere", "a")] });
    expect(first).toEqual({ created: 1, reused: 0 });
    expect(await db.select().from(globalRegexScripts)).toHaveLength(1);

    const again = await createImportGlobalScripts(ctxOf(db, "h"))({ ownerId: owner, scripts: [cardScript("st-1", "everywhere", "a")] });
    expect(again).toEqual({ created: 0, reused: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(1);
    expect(await db.select().from(globalRegexScripts)).toHaveLength(1);
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

// ── THE SINGLE-ENTITY DOOR (REGX2 · D121-D `band=Import · kebab=Export`) ─────────────────────────────
//
// The owner's REGX2 ruling ENDED the exemption that had kept regex bundle-only ("no evidenced demand for
// sharing one script standalone" — `tooling/src/verify/gates/lifecycle-portability.ts`). What the ruling did NOT
// end is the law that table encodes: a single-entity door is a THIN ARM over the family's bundle verbs,
// never a second serialization path. So the properties pinned here are structural, not cosmetic — the door's
// bytes are the BUNDLE's bytes, and its import IS the bundle's import.

describe("the single-script export door", () => {
  test("hands back the SAME bytes the bundle carries for that script", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, id: "regex_script_x", name: "x", behavior: behavior({ findRegex: "x" }) });

    const [bundled] = await createExportRegexScripts({ db })({ ownerId: owner });
    const door = await createExportRegexScript({ db })({ ownerId: owner, scriptId });

    expect(door).not.toBeNull();
    // Filename AND bytes: a divergence in either is a second serialization path, which is exactly what the
    // thin-arm clause forbids.
    expect(door?.filename).toBe(bundled?.filename);
    expect(door === null ? null : new TextDecoder().decode(door.bytes)).toBe(bundled === undefined ? null : new TextDecoder().decode(bundled.bytes));
  });

  test("carries the GLOBAL attachment, exactly as the bundle half does", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, id: "regex_script_g", name: "everywhere" });
    await svc.attachGlobal({ principal: principal(owner), scriptId });

    const door = await createExportRegexScript({ db })({ ownerId: owner, scriptId });
    // The portable file is FLAT (`schemaKind`/`schemaVersion` beside the payload's own fields), and `global`
    // is the one attachment that rides in it — a property OF the script, unlike the three FK-bound scopes.
    expect(JSON.parse(new TextDecoder().decode(door?.bytes ?? new Uint8Array()))).toMatchObject({ name: "everywhere", global: true });
  });

  test("a FOREIGN or absent script is one answer: null", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    expect(await createExportRegexScript({ db })({ ownerId: owner, scriptId: theirs })).toBeNull();
    expect(await createExportRegexScript({ db })({ ownerId: owner, scriptId: castId<RegexScriptId>("regex_script_nothere") })).toBeNull();
  });

  test("the exported file imports back through the BUNDLE's own verb — one round trip, two doors", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, id: "regex_script_x", name: "shared", behavior: behavior({ findRegex: "q" }) });
    const file = await createExportRegexScript({ db })({ ownerId: owner, scriptId });
    expect(file).not.toBeNull();

    const target = await seedUser(db, { handle: castId<Handle>("target") });
    const importOne = createImportRegexScript(ctxOf(db, "d"));
    expect(await importOne({ ownerId: target, bytes: (file as NonNullable<typeof file>).bytes })).toEqual({ created: true });

    const [landed] = await db.select().from(regexScripts).where(eq(regexScripts.ownerId, target));
    expect(landed?.name).toBe("shared");
    // …and the SAME dedup rule the bundle uses applies to a hand-shared file.
    expect(await importOne({ ownerId: target, bytes: (file as NonNullable<typeof file>).bytes })).toEqual({ created: false });
  });
});

// #1414 seam 4: the ATTACHMENT TARGET. These factories are wired at compose and consumed by import, so their
// SIGNATURE is the whole promise the next wiring inherits — "every current caller passes an owned id" is a
// comment, not a placement (constitution §2). The script side was already owner-gated by `loadOwnedScriptsByIds`
// / `listOwnedScripts`; the character and preset sides now run the domain's own `persistence/ownership` gates,
// the same ones the hand-attach verbs have always used.
describe("#1414 — the attachment TARGET is owner-gated, not just the scripts", () => {
  test("SECURITY: the card LIFT refuses a FOREIGN character — no library rows, no junction rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirCharacter = await seedCharacter(db, stranger, "theirs");

    await expect(
      createImportCardScripts(ctxOf(db, "fc"))({ ownerId: owner, characterId: theirCharacter, scripts: [cardScript("st-1", "x", "a")], carried: [] }),
    ).rejects.toThrow();

    // The whole lift is refused BEFORE the batch: no script row minted under the caller, no junction written.
    expect(await db.select().from(regexScripts)).toEqual([]);
    expect(await db.select().from(characterRegexScripts)).toEqual([]);
  });

  test("SECURITY: the PRESET lift refuses a foreign preset AND the shared system preset (null owner)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirPreset = await seedPreset(db, stranger, "theirs");
    // A null-owner preset is the SHARED system default: it matches no caller, so it is un-attachable — which
    // is correct, it is read-only by construction.
    const systemPreset = await seedPreset(db, null, "system");

    await expect(
      createImportPresetScripts(ctxOf(db, "fp"))({ ownerId: owner, presetId: theirPreset, scripts: [cardScript("st-1", "x", "a")] }),
    ).rejects.toThrow();
    await expect(
      createImportPresetScripts(ctxOf(db, "sp"))({ ownerId: owner, presetId: systemPreset, scripts: [cardScript("st-2", "y", "b")] }),
    ).rejects.toThrow();

    expect(await db.select().from(presetRegexScripts)).toEqual([]);
    expect(await db.select().from(regexScripts)).toEqual([]);
  });

  test("SECURITY: the card RE-EMBED reads only the CALLER'S OWN card — a foreign id is an empty export", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirCharacter = await seedCharacter(db, stranger, "theirs");
    // The SCRIPT is the caller's own, so the pre-existing `regexScripts.ownerId` filter cannot be what
    // refuses this — only the character-side predicate can. The old read answered
    // "which of MY scripts hang off THAT card", for any card id in the box.
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    await db.insert(characterRegexScripts).values({ characterId: theirCharacter, regexScriptId: mine, position: 0, createdAt: FROZEN });

    expect(await createExportCardScripts({ db })({ ownerId: owner, characterId: theirCharacter })).toEqual({ scripts: [], carried: [] });
  });

  test("the OWNER's own card still re-embeds (the predicate is a gate, not a removal)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner, "mine");
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    await db.insert(characterRegexScripts).values({ characterId, regexScriptId: mine, position: 0, createdAt: FROZEN });

    const exported = await createExportCardScripts({ db })({ ownerId: owner, characterId });
    expect(exported.carried).toEqual([mine]);
    expect(exported.scripts.map((s) => s.name)).toEqual(["mine"]);
  });
});
