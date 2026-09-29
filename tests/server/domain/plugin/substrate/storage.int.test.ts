// substrate: buildPluginStorage — the composed `storage.kv` host op (01 §2 / 02 §3). Wraps persistence/plugin-kv
// with the HOST-SIDE 256-key cap the DDL can't express, keyed by BOTH pluginId AND ownerId. Proves at the composed
// layer (over the real DB): the round-trip, the 256-key cap (new key refused, existing overwrite always allowed),
// and the cross-plugin isolation through the OP (not just the query floor) — plugin A's keys are invisible to B.

import { pluginManifestSchema } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildPluginStorage, PLUGIN_KV_MAX_KEYS } from "../../../../../packages/server/src/domain/plugin/index.ts";
import { getKv } from "../../../../../packages/server/src/domain/plugin/persistence/plugin-kv.ts";
import { insertPlugin } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const AT = 1000;
const now = (): number => AT;
const CAP_ERROR_RE = /256 keys/u;

async function seedPlugin(db: Db, ownerId: UserId, id: string, slug: string): Promise<PluginId> {
  const pluginId = castId<PluginId>(id);
  const assetId = castId<AssetId>(`asset_${id}`);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "plugin", mime: "application/zip", size: 10, hash: `hash-${id}`, uploadedAt: AT });
  await insertPlugin(db, {
    id: pluginId,
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: pluginManifestSchema.parse({ id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: "x", capabilities: [] }),
    bundleAssetId: assetId,
    grantedCapabilities: [],
    status: "disabled",
    origin: "upload",
    sourceUrl: null,
    sourceCommit: null,
    installedAt: AT,
    updatedAt: AT,
  });
  return pluginId;
}

test("set → get → list → delete round-trips through the composed op", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  expect(await storage.get(plugin, owner, "k")).toBeNull();
  await storage.set(plugin, owner, "cfg:a", "1");
  await storage.set(plugin, owner, "cfg:b", "2");
  expect(await storage.get(plugin, owner, "cfg:a")).toBe("1");
  expect(await storage.list(plugin, owner, "cfg:")).toEqual(["cfg:a", "cfg:b"]);
  await storage.delete(plugin, owner, "cfg:a");
  expect(await storage.get(plugin, owner, "cfg:a")).toBeNull();
});

// ── `compareAndSet` (#1442) — the ATOMIC arm ────────────────────────────────────────────────────────────────
// HONEST LABEL: these are NEW-API pins, not red-first defect proofs. The op did not exist before this change,
// so nothing here could be run against the old source; the defect it defends against is proven reachable by
// CODE rather than by a red — `domain/plugin/verbs/ui-host-call.ts` calls the bridge with no resident and no
// invoke queue, and `storage.set` is UI-proxyable, so a Tier-C `ui.js` writer (or a second browser tab) is a
// concurrent writer of these exact rows. A plugin's own SERVER handlers are NOT (`infra/plugin-host/port.ts`
// serializes every invoke on one resident), which is why the guest-tier concurrency test could not be reddened.
//
// The interleaving below is written out by hand rather than raced, deliberately: a real race is
// nondeterministic and would flake, while "A read, someone else wrote, A's write must refuse" is the exact
// sequence the predicate exists to reject and it can be stated exactly.

test("compareAndSet REFUSES a write whose basis moved, and hands back the value that beat it", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  await storage.set(plugin, owner, "count", "1");
  // A reads…
  const basis = await storage.get(plugin, owner, "count");
  // …an UNSERIALIZED writer (a Tier-C surface, another tab) lands in between…
  await storage.set(plugin, owner, "count", "7");
  // …and A's write is refused rather than silently discarding it.
  const refused = await storage.compareAndSet(plugin, owner, { key: "count", expected: basis, next: "2" });
  expect(refused).toEqual({ applied: false, current: "7" });
  expect(await storage.get(plugin, owner, "count")).toBe("7");

  // `current` is the caller's next `expected`, so the retry costs no extra read — this IS the guest loop.
  expect(await storage.compareAndSet(plugin, owner, { key: "count", expected: refused.current, next: "8" })).toEqual({
    applied: true,
    current: "8",
  });
  expect(await storage.get(plugin, owner, "count")).toBe("8");
});

test("compareAndSet's CREATE arm: `expected: null` mints the key once, and the second claimant is refused", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  expect(await storage.compareAndSet(plugin, owner, { key: "seq", expected: null, next: "1" })).toEqual({ applied: true, current: "1" });
  // "The key must not exist" is a real precondition, not an upsert: the second create-claim loses.
  expect(await storage.compareAndSet(plugin, owner, { key: "seq", expected: null, next: "1" })).toEqual({ applied: false, current: "1" });
  expect(await storage.get(plugin, owner, "seq")).toBe("1");
});

test("compareAndSet is OWNER- and PLUGIN-scoped — a foreign key is neither read nor moved", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const alpha = await seedPlugin(db, owner, "plugin_a", "alpha");
  const beta = await seedPlugin(db, owner, "plugin_b", "beta");
  const storage = buildPluginStorage(db, now);

  await storage.set(alpha, owner, "shared", "alpha-value");
  // Beta cannot move alpha's row by naming the same key and the same value: the guard filter makes the row
  // invisible, so beta's compare is against an ABSENT key and its update matches nothing.
  expect(await storage.compareAndSet(beta, owner, { key: "shared", expected: "alpha-value", next: "stolen" })).toEqual({
    applied: false,
    current: null,
  });
  expect(await storage.get(alpha, owner, "shared")).toBe("alpha-value");
  // …and beta's own CREATE claim on the same key name is its own row, leaving alpha's untouched.
  expect(await storage.compareAndSet(beta, owner, { key: "shared", expected: null, next: "beta-value" })).toEqual({
    applied: true,
    current: "beta-value",
  });
  expect(await storage.get(alpha, owner, "shared")).toBe("alpha-value");
  expect(await storage.get(beta, owner, "shared")).toBe("beta-value");
});

test("compareAndSet's CREATE arm honours the 256-key cap; an EXISTING-key claim never consumes a slot", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  for (let i = 0; i < PLUGIN_KV_MAX_KEYS; i += 1) {
    await storage.set(plugin, owner, `k${i}`, "v");
  }
  // A new key past the ceiling is the CAP REFUSAL — a thrown host error, deliberately NOT `applied: false`.
  // Losing a race and hitting the ceiling are different outcomes and a guest must be able to tell them apart.
  await expect(storage.compareAndSet(plugin, owner, { key: "one-too-many", expected: null, next: "v" })).rejects.toThrow(CAP_ERROR_RE);
  // …while an existing key still moves at the ceiling, exactly as `set` does.
  expect(await storage.compareAndSet(plugin, owner, { key: "k0", expected: "v", next: "v2" })).toEqual({ applied: true, current: "v2" });
});

test("the 256-key cap: a NEW key past the ceiling is refused; an EXISTING-key overwrite always proceeds", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  // Fill to the ceiling.
  for (let i = 0; i < PLUGIN_KV_MAX_KEYS; i++) {
    await storage.set(plugin, owner, `k${i}`, "v");
  }
  // A NEW key past the cap is refused (typed error, contained as guest errors-as-data upstream).
  await expect(storage.set(plugin, owner, "one-too-many", "v")).rejects.toThrow(CAP_ERROR_RE);
  // An OVERWRITE of an existing key does NOT consume a slot — always allowed at the ceiling.
  await storage.set(plugin, owner, "k0", "updated");
  expect(await storage.get(plugin, owner, "k0")).toBe("updated");
});

// ── THE CAP IS A PREDICATE ON THE WRITE, NOT A READ BEFORE IT ─────────────────────────────────────────────
// `set` used to ask `getKv` then `countKeys` then `upsertKv` — three statements with two JS `if`-gaps. Two
// concurrent sets for DISTINCT new keys at the ceiling-1 both read 255, both passed, and both inserted: 257
// keys behind a 256-key cap. `storage.set` is UI-proxyable (a Tier-C `ui.js` writer, a second tab), so those
// writers are real and nothing serialises them. The count now rides the INSERT as a subquery predicate —
// the same "the predicate rides the write" rule `compareAndSet` follows one arm over.
test("two concurrent NEW-key writes at the ceiling cannot both land — the count rides the write", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const plugin = await seedPlugin(db, owner, "plugin_a", "alpha");
  const storage = buildPluginStorage(db, now);

  // One slot left.
  for (let i = 0; i < PLUGIN_KV_MAX_KEYS - 1; i += 1) {
    await storage.set(plugin, owner, `k${i}`, "v");
  }

  // A REAL interleaving: two writers, two DISTINCT new keys, one slot. Exactly one may win; the loser is a
  // cap refusal (contained upstream as guest errors-as-data), never a silent 257th row.
  const outcomes = await Promise.allSettled([storage.set(plugin, owner, "race-a", "v"), storage.set(plugin, owner, "race-b", "v")]);

  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find((o) => o.status === "rejected");
  expect(String(rejected?.status === "rejected" ? rejected.reason : "")).toMatch(CAP_ERROR_RE);
  expect(await storage.list(plugin, owner, undefined)).toHaveLength(PLUGIN_KV_MAX_KEYS);
});

test("cross-plugin isolation through the op: plugin A's key is invisible to plugin B (same owner)", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = await seedPlugin(db, owner, "plugin_a", "alpha");
  const b = await seedPlugin(db, owner, "plugin_b", "beta");
  const storage = buildPluginStorage(db, now);

  await storage.set(a, owner, "secret", "a-only");
  expect(await storage.get(b, owner, "secret")).toBeNull();
  expect(await storage.list(b, owner, undefined)).toEqual([]);
  expect(await storage.get(a, owner, "secret")).toBe("a-only");
  // The row IS keyed to A (the guard column is real, not just an app filter).
  expect(await getKv(db, { pluginId: a, ownerId: owner }, "secret")).toBe("a-only");
});
