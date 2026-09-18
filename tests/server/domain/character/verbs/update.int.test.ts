// verb: update — edit-in-place. Load-bearing: a content edit recomputes contentHash + emits
// character.updated; `null` CLEARS a nullable field while `undefined` (omitted) keeps it; an empty edit
// neither writes nor emits; not-owned throws.

import { utimes } from "node:fs/promises";
import type { MaterializeBackgroundOp, ThemeBackground } from "@orb/contracts/theme";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { AssetNotFoundError, CharacterNotFoundError, CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal as assetsPrincipal, makeHarness as makeAssetsHarness, pngBytes } from "../../assets/_support.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

const CHARACTER_UPDATE = /^update "characters"/i;
const ASSET_DELETE = /^delete from "assets"/i;
const TWO_HOURS_MS = 2 * 3_600_000;

async function oldBlob(h: Awaited<ReturnType<typeof makeAssetsHarness>>, ownerId: Parameters<typeof assetsPrincipal>[0], hash: string): Promise<void> {
  const seconds = (FROZEN_AT_MS - TWO_HOURS_MS) / 1000;
  await utimes(h.ctx.cas.blobPath(ownerId, hash), seconds, seconds);
}

describe("update", () => {
  test("a content edit changes contentHash and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "before" },
    });
    h.events.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { description: "after" },
    });

    expect(updated.description).toBe("after");
    expect(updated.contentHash).not.toBe(created.contentHash);
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id, contentChanged: true }]);
  });

  test("null clears a nullable field; omitted fields are kept", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: {
        handle: castId<CharacterHandle>("nyx"),
        name: "Nyx",
        description: "d",
        personality: "stoic",
        scenario: "a tavern",
      },
    });

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { personality: null },
    });

    expect(updated.personality).toBeNull();
    expect(updated.scenario).toBe("a tavern");
  });

  test("an empty edit neither writes nor emits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    h.events.length = 0;
    h.audits.length = 0;

    const same = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: {},
    });
    expect(same.contentHash).toBe(created.contentHash);
    expect(h.events).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  test("a starred-flag edit changes no card content and emits a no-content-change event", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { starred: true },
    });

    expect(updated.starred).toBe(true);
    expect(updated.contentHash).toBe(created.contentHash);
    // The emit stamps contentChanged=false → the embeddings indexer skips re-embedding a star toggle.
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id, contentChanged: false }]);
  });

  test("updating another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    await expect(svc.update({ principal: principal(other), characterId: created.id, input: { name: "Hax" } })).rejects.toBeInstanceOf(CharacterNotFoundError);
  });

  test("a FOREIGN avatar asset throws AssetNotFoundError (D21 cross-root belt — nothing written)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedAsset(db, { id: "asset_foreign", ownerId: other });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    await expect(
      svc.update({
        principal: principal(owner),
        characterId: created.id,
        input: { avatarAssetId: foreign },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.avatarAssetId).toBeNull();
    expect(h.events).toHaveLength(0);
  });

  test("a FOREIGN backgroundOverride asset throws AssetNotFoundError (BG-C ownership belt — nothing written)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedAsset(db, { id: "asset_foreignbg", ownerId: other });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });
    h.events.length = 0;

    await expect(
      svc.update({
        principal: principal(owner),
        characterId: created.id,
        input: { backgroundOverride: { kind: "asset", externalUrl: "", assetId: foreign, assetHash: "h", mime: "image/png", provenanceUrl: "" } },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.backgroundOverride).toBeNull();
    expect(h.events).toHaveLength(0);
  });

  test("a backgroundOverride with a non-asset kind carrying an assetId persists CLEAN — asset fields emptied (no GC-root smuggle)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    // A foreign id smuggled under kind:"none" — canonicalization empties it BEFORE the ownership belt, so the
    // write SUCCEEDS with a clean shape (assetId "") and never GC-roots the foreign id via background_override.
    const foreign = await seedAsset(db, { id: "asset_foreignsmuggle", ownerId: other });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { backgroundOverride: { kind: "none", externalUrl: "", assetId: foreign, assetHash: "h", mime: "image/png", provenanceUrl: "" } },
    });

    expect(updated.backgroundOverride).toEqual({ kind: "none", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" });
    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.backgroundOverride?.assetId).toBe("");
  });

  test("an EXTERNAL backgroundOverride is MATERIALIZED into an owned asset (F-P0-2): persists kind:asset + provenanceUrl", async () => {
    const db = await freshDb();
    const owner0 = await seedUser(db, { handle: castId<Handle>("owner") });
    // The materialize op (compose) fetches → magic-belts → stores under the caller; the freshly-stored asset is
    // the owner's OWN, so `ensureBackgroundOverrideOwned` passes. The stub returns a pre-seeded owned asset.
    const storedAssetId = await seedAsset(db, { id: "asset_cardbgmaterialized1", ownerId: owner0 });
    const h = makeHarness(db, {
      materializeBackground: () => Promise.resolve({ ok: true, asset: { assetId: storedAssetId, assetHash: "hash_cardbg", mime: "image/png" } }),
    });
    const svc = createCharacterService(h.ctx);
    const created = await svc.create({ principal: principal(owner0), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });

    const url = "https://cdn.example/card-bg.jpg";
    const updated = await svc.update({
      principal: principal(owner0),
      characterId: created.id,
      input: { backgroundOverride: { kind: "external", externalUrl: url, assetId: "", assetHash: "", mime: "", provenanceUrl: "" } },
    });

    expect(updated.backgroundOverride).toEqual({
      kind: "asset",
      externalUrl: "",
      assetId: storedAssetId,
      assetHash: "hash_cardbg",
      mime: "image/png",
      provenanceUrl: url,
    });
  });

  test("an EXTERNAL backgroundOverride the op refuses throws background_unavailable — no write", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { materializeBackground: () => Promise.resolve({ ok: false, reason: "unreachable" }) });
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } });
    h.events.length = 0;

    const err = await svc
      .update({
        principal: principal(owner),
        characterId: created.id,
        input: {
          backgroundOverride: {
            kind: "external",
            externalUrl: "https://cdn.example/gone.jpg",
            assetId: "",
            assetHash: "",
            mime: "",
            provenanceUrl: "",
          },
        },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CharacterOperationError);
    expect((err as CharacterOperationError).code).toBe("background_unavailable");
    expect(h.events).toHaveLength(0);
  });

  // ── #1455: AUTHORIZE, THEN FETCH ─────────────────────────────────────────────────────────────────
  // `resolveBackgroundOverride` invokes `ctx.materializeBackground` for any `kind:"external"` override,
  // and it used to run BEFORE `loadOwnedCharacterRow`. So a caller naming a characterId they do not own
  // (or one that does not exist) still drove a remote fetch, image processing, a CAS write and an assets
  // row — SSRF-sensitive outbound work plus cost and a durable side effect — on the way to a
  // `CharacterNotFoundError`. Both inputs are ordinary caller-supplied values. A RECORDING materializer
  // is the pin: it must never be reached. (The materialize op keeps running before
  // `ensureBackgroundOverrideOwned`, which is what lets the freshly-stored own asset pass it.)
  describe("#1455 — external background materialization runs only AFTER the character is authorized", () => {
    /** A materializer that RECORDS instead of fetching — reaching it at all is the finding. */
    function recorder(): { calls: string[]; op: MaterializeBackgroundOp } {
      const calls: string[] = [];
      return {
        calls,
        op: (_principal, url) => {
          calls.push(url);
          return Promise.resolve({ ok: true, asset: { assetId: castId("asset_never"), assetHash: "never", mime: "image/png" } });
        },
      };
    }

    function externalInput(url: string): { backgroundOverride: ThemeBackground } {
      return {
        backgroundOverride: { kind: "external", externalUrl: url, assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
      };
    }

    test("SECURITY: a FOREIGN characterId never reaches the materializer", async () => {
      const db = await freshDb();
      const rec = recorder();
      const h = makeHarness(db, { materializeBackground: rec.op });
      const svc = createCharacterService(h.ctx);
      const owner = await seedUser(db, { handle: castId<Handle>("owner") });
      const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
      const theirs = await svc.create({
        principal: principal(owner),
        input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
      });

      await expect(
        svc.update({ principal: principal(stranger), characterId: theirs.id, input: externalInput("https://cdn.example/ssrf.jpg") }),
      ).rejects.toBeInstanceOf(CharacterNotFoundError);
      expect(rec.calls).toEqual([]);
    });

    test("SECURITY: a MISSING characterId never reaches the materializer", async () => {
      const db = await freshDb();
      const rec = recorder();
      const h = makeHarness(db, { materializeBackground: rec.op });
      const svc = createCharacterService(h.ctx);
      const owner = await seedUser(db, { handle: castId<Handle>("owner") });

      await expect(
        svc.update({ principal: principal(owner), characterId: castId("character_nope"), input: externalInput("https://cdn.example/ssrf.jpg") }),
      ).rejects.toBeInstanceOf(CharacterNotFoundError);
      expect(rec.calls).toEqual([]);
    });

    test("the OWNER's own card still materializes (the reorder is a gate, not a removal)", async () => {
      const db = await freshDb();
      const rec = recorder();
      const h = makeHarness(db, { materializeBackground: rec.op });
      const svc = createCharacterService(h.ctx);
      const owner = await seedUser(db, { handle: castId<Handle>("owner") });
      const stored = await seedAsset(db, { id: "asset_never", ownerId: owner });
      const created = await svc.create({
        principal: principal(owner),
        input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
      });

      const url = "https://cdn.example/mine.jpg";
      const updated = await svc.update({ principal: principal(owner), characterId: created.id, input: externalInput(url) });

      expect(rec.calls).toEqual([url]);
      expect(updated.backgroundOverride?.kind).toBe("asset");
      expect(updated.backgroundOverride?.assetId).toBe(stored);
      expect(updated.backgroundOverride?.provenanceUrl).toBe(url);
    });
  });

  test("GC-first: a held real card update loses with background_unavailable and never persists a dangling JSON ref", async () => {
    const { db, hold } = await freshHeldDb();
    const assetsHarness = await makeAssetsHarness(db);
    onTestFinished(assetsHarness.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetsSvc = createAssetsService(assetsHarness.ctx);
    const stored = await assetsSvc.store({ principal: assetsPrincipal(owner), bytes: pngBytes(71), kind: "background", mime: "image/png" });
    await oldBlob(assetsHarness, owner, stored.hash);
    const characterSvc = createCharacterService(makeHarness(db).ctx);
    const created = await characterSvc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const updateHold = hold(CHARACTER_UPDATE);
    const updating = characterSvc.update({
      principal: principal(owner),
      characterId: created.id,
      input: {
        backgroundOverride: {
          kind: "asset",
          externalUrl: "",
          assetId: stored.assetId,
          assetHash: stored.hash,
          mime: "image/png",
          provenanceUrl: "",
        },
      },
    });
    await updateHold.reached;
    expect((await assetsSvc.collectGarbage({})).reclaimed).toBe(1);
    updateHold.release();

    await expect(updating).rejects.toMatchObject({ code: "background_unavailable" });
    expect((await characterSvc.get({ principal: principal(owner), characterId: created.id })).backgroundOverride).toBeNull();
  });

  test("writer-first: a real card update committed while GC DELETE is held keeps the asset and JSON ref", async () => {
    const { db, hold } = await freshHeldDb();
    const assetsHarness = await makeAssetsHarness(db);
    onTestFinished(assetsHarness.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetsSvc = createAssetsService(assetsHarness.ctx);
    const stored = await assetsSvc.store({ principal: assetsPrincipal(owner), bytes: pngBytes(72), kind: "background", mime: "image/png" });
    await oldBlob(assetsHarness, owner, stored.hash);
    const characterSvc = createCharacterService(makeHarness(db).ctx);
    const created = await characterSvc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const deleteHold = hold(ASSET_DELETE);
    const collecting = assetsSvc.collectGarbage({});
    await deleteHold.reached;
    await characterSvc.update({
      principal: principal(owner),
      characterId: created.id,
      input: {
        backgroundOverride: {
          kind: "asset",
          externalUrl: "",
          assetId: stored.assetId,
          assetHash: stored.hash,
          mime: "image/png",
          provenanceUrl: "",
        },
      },
    });
    deleteHold.release();

    expect((await collecting).reclaimed).toBe(0);
    expect((await characterSvc.get({ principal: principal(owner), characterId: created.id })).backgroundOverride?.assetId).toBe(stored.assetId);
  });

  test("applies a handle rename (FINAL-Character §2 identity column) and audits only `handle`", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    h.audits.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { handle: castId<CharacterHandle>("nyx-prime") },
    });

    expect(updated.handle).toBe("nyx-prime");
    // A pure rename doesn't touch card content → the hash is unchanged (handle is not embedded).
    expect(updated.contentHash).toBe(created.contentHash);
    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.handle).toBe("nyx-prime");
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.metadata).toEqual({ fields: ["handle"] });
  });

  test("audits ONLY the fields that actually changed (a provided-but-identical value is not logged)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "before", personality: "stoic" },
    });
    h.audits.length = 0;

    // description changes; name + handle are re-sent identical (must NOT appear in the audit).
    await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { description: "after", name: "Nyx", handle: castId<CharacterHandle>("nyx") },
    });

    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.metadata).toEqual({ fields: ["description"] });
  });

  test("refuses a reserved `__group__*` handle (mirror of the `__agent__` refusal) — nothing written", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    await expect(
      svc.update({
        principal: principal(owner),
        characterId: created.id,
        input: { handle: castId<CharacterHandle>("__group__chat_1") },
      }),
    ).rejects.toBeInstanceOf(CharacterOperationError);
    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.handle).toBe("nyx");
    expect(h.events).toHaveLength(0);
  });

  test("a colliding handle rename surfaces the typed handle_conflict — the other card is untouched", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    const mara = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("mara"), name: "Mara", description: "d" },
    });

    await expect(svc.update({ principal: principal(owner), characterId: mara.id, input: { handle: castId<CharacterHandle>("nyx") } })).rejects.toMatchObject({
      code: "handle_conflict",
    });
    const reread = await svc.get({ principal: principal(owner), characterId: mara.id });
    expect(reread.handle).toBe("mara");
  });

  test("D44 §12.1/§12.5 — themeOverride round-trips (set, then null clears it)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" },
    });
    expect(created.themeOverride).toBeNull();

    const withOverride = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { themeOverride: { accent: "oklch(0.7 0.14 250)" } },
    });
    expect(withOverride.themeOverride).toEqual({ accent: "oklch(0.7 0.14 250)" });

    const cleared = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { themeOverride: null },
    });
    expect(cleared.themeOverride).toBeNull();
  });
});
