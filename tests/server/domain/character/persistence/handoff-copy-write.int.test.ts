// `createCopyHandoffCards` — the character-owned card copy the host-handoff property offer executes. The op
// crosses OWNERS by construction (a gift the departing host offered and the nominee accepted), so its two
// gates are the whole test: the source read carries `fromOwnerId` in its WHERE, and the provenance stamp is
// the find-before-mint key that makes a retried accept converge instead of minting a second library.

import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { assets, characters } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { CopyAssetToOwner } from "../../../../../packages/server/src/domain/character/index.ts";
import { createCopyHandoffCards, handoffProvenance } from "../../../../../packages/server/src/domain/character/index.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const CHAT = castId<ChatId>("chat_transfer");
/** The find-before-mint provenance READ — the statement both accepts must clear before either writes, and
 *  the one this race is about. It is held rather than the INSERT because the insert rides `db.batch`, and
 *  the hold harness intercepts `execute` only (see `tests/support/db.ts#holdingClient`). */
const PROVENANCE_READ = /"imported_from" in/iu;

async function seedCard(
  db: Db,
  ownerId: UserId,
  key: string,
  over: {
    readonly avatarAssetId?: AssetId;
    readonly trustHtml?: boolean;
    readonly interactiveHtml?: boolean;
    readonly handle?: CharacterHandle;
    readonly backgroundOverride?: ThemeBackground;
  } = {},
): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    ownerId,
    handle: over.handle ?? castId<CharacterHandle>(key),
    name: key,
    description: `${key} body`,
    contentHash: key,
    tokenSize: 0,
    trustHtml: over.trustHtml ?? false,
    interactiveHtml: over.interactiveHtml ?? false,
    avatarAssetId: over.avatarAssetId ?? null,
    ...(over.backgroundOverride === undefined ? {} : { backgroundOverride: over.backgroundOverride }),
    createdAt: AT,
  });
  return id;
}

/** A carried background pointing at an OWNED asset row — the only background kind that names ownership. */
function assetBackground(assetId: AssetId): ThemeBackground {
  return { kind: "asset", assetId, assetHash: "bg-hash", mime: "image/png", externalUrl: "", provenanceUrl: "" };
}

/** A CAS asset row the `avatar_asset_id` FK can point at. */
async function seedAsset(db: Db, ownerId: UserId, key: string): Promise<AssetId> {
  const id = castId<AssetId>(`asset_${key}`);
  await db.insert(assets).values({ id, ownerId, hash: key, kind: "avatar", mime: "image/png", size: 1, uploadedAt: AT });
  return id;
}

/** The op with a deterministic minter + a recording picture re-own. */
function copier(db: Db, copyAsset: CopyAssetToOwner = () => Promise.resolve(null), idNamespace = ""): ReturnType<typeof createCopyHandoffCards> {
  let n = 0;
  return createCopyHandoffCards({
    db,
    bumpStatsCanonVersion,
    now: () => AT,
    newCharacterId: (): CharacterId => {
      n += 1;
      return castId<CharacterId>(`character_copy_${idNamespace}${n}`);
    },
    copyAsset,
  });
}

test("copies the departing host's card under the recipient, provenance-stamped, policies carried", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria", { trustHtml: true, interactiveHtml: true });

  const result = await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect(result).toEqual([{ sourceCharacterId: source, characterId: castId<CharacterId>("character_copy_1"), minted: true }]);
  const [copy] = await db.select().from(characters).where(eq(characters.ownerId, nominee.id));
  expect(copy?.name).toBe("aria");
  expect(copy?.description).toBe("aria body");
  // The render/theme POLICY is a property of the card, not of its owner — a card the old host marked
  // `trustHtml` must not silently change posture because it changed hands.
  expect(copy?.trustHtml).toBe(true);
  // …BUT NOT the interactive-card opt-in. This assertion is the INVERSE of the one leg 1 shipped, and the
  // flip is the #111 leg-3 security pass's ruling (which the leg-1 comment explicitly deferred to it):
  // `trustHtml` widens what markup renders and the renderer still sanitizes it, while `interactive` is the
  // ladder's only rung that EXECUTES model-authored code and carries a WebRTC beacon no CSP can close. A
  // consent that big does not cross an OWNER BOUNDARY silently — the nominee gets a trusted-but-static copy
  // and re-opts-in on a card they now own. (`duplicate` still carries it: same owner, no boundary crossed.)
  expect(copy?.interactiveHtml).toBeNull();
  // The provenance stamp IS the idempotency key (and is why `duplicate`'s provenance-CLEARING is wrong here).
  expect(copy?.importedFrom).toBe(handoffProvenance(CHAT, source));
  expect(copy?.importHash).toBeNull();
  // The original is untouched.
  expect((await db.select().from(characters).where(eq(characters.id, source)))[0]?.ownerId).toBe(oldHost.id);
});

test("a card the claimed source owner does NOT own is silently absent (naming an id is not a license)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const stranger = await seedUser(db, { handle: castId("stranger") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const mine = await seedCard(db, oldHost.id, "aria");
  const foreign = await seedCard(db, stranger.id, "foreign");

  const result = await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [mine, foreign] });

  // Only the departing host's own card came back — the caller's seat for the other falls to the D64 drop.
  expect(result.map((r) => r.sourceCharacterId)).toEqual([mine]);
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(1);
});

test("a RETRIED accept finds the existing copy by provenance — zero duplicates, `minted:false`", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = copier(db);

  const first = await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });
  const second = await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect(second).toEqual([{ sourceCharacterId: source, characterId: first[0]?.characterId, minted: false }]);
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(1);
});

test("the provenance key is CHAT-scoped — the same card gifted through two rooms yields two copies", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = copier(db);

  await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });
  await copy({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: castId<ChatId>("chat_other"), characterIds: [source] });

  // Two independent gifts of the same card are two independent copies — the alternative would silently make
  // one room's later edits show up in the other's cast.
  expect(await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).toHaveLength(2);
});

test("a handle already taken in the recipient's library is uniquified, never a constraint throw", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria");
  // The recipient already has an UNRELATED card sitting on that handle.
  await seedCard(db, nominee.id, "nominee_own", { handle: castId<CharacterHandle>("aria") });

  await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  const handles = (await db.select().from(characters).where(eq(characters.ownerId, nominee.id))).map((c) => c.handle).sort();
  expect(handles).toEqual(["aria", "aria-2"]);
});

test("the avatar is RE-OWNED through the injected op, never carried by id", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const hostAvatar = await seedAsset(db, oldHost.id, "host_avatar");
  const reowned = await seedAsset(db, nominee.id, "nominee_avatar");
  const source = await seedCard(db, oldHost.id, "aria", { avatarAssetId: hostAvatar });
  const asked: { fromOwnerId: string; toOwnerId: string; assetId: AssetId; kind: string }[] = [];

  await copier(db, (args) => {
    asked.push(args);
    return Promise.resolve(reowned);
  })({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // BOTH owners arrive explicitly (the injected-op caller gate), and the copy points at the RECIPIENT's asset
  // — carrying the source id would be a pointer into a library they cannot read plus a GC root on the
  // departed host's blob (`assets` is per-owner with a `(owner_id, hash)` dedup, D21).
  expect(asked).toEqual([{ fromOwnerId: oldHost.id, toOwnerId: nominee.id, assetId: hostAvatar, kind: "avatar" }]);
  expect((await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0]?.avatarAssetId).toBe(reowned);
});

test("an avatar that cannot be re-owned lands the copy FACELESS rather than borrowing the source's asset", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const source = await seedCard(db, oldHost.id, "aria", { avatarAssetId: await seedAsset(db, oldHost.id, "gone") });

  await copier(db, () => Promise.resolve(null))({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  expect((await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0]?.avatarAssetId).toBeNull();
});

test("the refinery signals do NOT cross the owner boundary — the copy clears them (§3.D ruling)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("refhost") });
  const nominee = await seedUser(db, { handle: castId("refnominee") });
  const source = await seedCard(db, oldHost.id, "refina");
  // The old host's private critique lands on the SOURCE row (what R1's analyze stamp produces).
  await db
    .update(characters)
    .set({
      refinery: {
        score: 7,
        analysis: {
          preserved: [],
          lost: [],
          gained: [],
          soulScore: 7,
          soulAssessment: "private judgement",
          verdict: "ACCEPT",
          issues: [],
          recommendations: [],
        },
      },
    })
    .where(eq(characters.id, source));

  await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // The copy is CLEAN (derived data the new owner regenerates in one run; every other cross-boundary
  // path clears it — serde nulls the card wire; only same-owner duplicate carries it)…
  const copy = (await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0];
  expect(copy?.refinery).toBeNull();
  // …and the SOURCE keeps its signals (the clear is on the copy, never a mutation of the gift).
  const kept = (await db.select().from(characters).where(eq(characters.id, source)))[0];
  expect(kept?.refinery?.score).toBe(7);
});

test("the carried BACKGROUND asset is RE-OWNED through the same port, never carried by id (#1426)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("bghost") });
  const nominee = await seedUser(db, { handle: castId("bgnominee") });
  const hostBackground = await seedAsset(db, oldHost.id, "host_background");
  const reowned = await seedAsset(db, nominee.id, "nominee_background");
  const source = await seedCard(db, oldHost.id, "bgaria", { backgroundOverride: assetBackground(hostBackground) });
  const asked: { assetId: AssetId; kind: string }[] = [];

  await copier(db, ({ assetId, kind }) => {
    asked.push({ assetId, kind });
    return Promise.resolve(reowned);
  })({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // The background is the avatar's twin: `assets` is per-owner, so the source's id on the nominee's card is a
  // pointer into a library they cannot read AND a GC root on the departed host's blob. It is re-owned under
  // the BACKGROUND asset kind (the CAS index is per-kind), and only the id moves — the hash/mime describe
  // bytes that did not change.
  expect(asked).toEqual([{ assetId: hostBackground, kind: "background" }]);
  const copy = (await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0];
  expect(copy?.backgroundOverride?.assetId).toBe(reowned);
  expect(copy?.backgroundOverride?.assetHash).toBe("bg-hash");
  // …and the card the nominee now owns is one their OWN edit verb would accept (the BG-C ownership belt).
  const ownsBackground = await db
    .select()
    .from(assets)
    .where(eq(assets.id, castId<AssetId>(copy?.backgroundOverride?.assetId ?? "")));
  expect(ownsBackground[0]?.ownerId).toBe(nominee.id);
});

test("a background that cannot be re-owned degrades to NO background, never a foreign pointer (#1426)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("bghost2") });
  const nominee = await seedUser(db, { handle: castId("bgnominee2") });
  const source = await seedCard(db, oldHost.id, "bgaria2", { backgroundOverride: assetBackground(await seedAsset(db, oldHost.id, "gone_bg")) });

  await copier(db, () => Promise.resolve(null))({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // The avatar's honest degrade, applied to the twin: the copy lands without that picture rather than
  // borrowing a stranger's blob, and the canonical shape empties the asset reference with the kind.
  const copy = (await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0];
  expect(copy?.backgroundOverride?.kind).toBe("none");
  expect(copy?.backgroundOverride?.assetId).toBe("");
});

test("a kind:none background travels verbatim — it names no owner to transfer (#1426)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("seedhost") });
  const nominee = await seedUser(db, { handle: castId("seednominee") });
  // The non-asset arm of #1426. It used to be spelled `kind:"seeded"` (a bundled catalog plate); that kind
  // retired 2026-09-18 and a bundled plate is now an ordinary owned `asset`, so the surviving
  // owner-less kind — and the one this claim is actually about — is `none`.
  const seeded: ThemeBackground = { kind: "none", assetId: "", assetHash: "", mime: "", externalUrl: "", provenanceUrl: "" };
  const source = await seedCard(db, oldHost.id, "seedaria", { backgroundOverride: seeded });
  let asked = 0;

  await copier(db, () => {
    asked += 1;
    return Promise.resolve(null);
  })({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] });

  // A catalog slug is readable by every user, so re-owning it would be a copy of nothing.
  expect(asked).toBe(0);
  expect((await db.select().from(characters).where(eq(characters.ownerId, nominee.id)))[0]?.backgroundOverride).toEqual(seeded);
});

test("two CONCURRENT accepts of one offer mint ONE copy — the loser converges on it (#1432)", async () => {
  const { db, hold } = await freshHeldDb();
  const oldHost = await seedUser(db, { handle: castId("racehost") });
  const nominee = await seedUser(db, { handle: castId("racenominee") });
  const source = await seedCard(db, oldHost.id, "racearia");
  // Two independent copier instances = two independent requests; both mint their own fresh id, exactly as
  // two accept calls in flight would. The hold releases BOTH provenance reads together, so each sees "no
  // copy yet" and proceeds to mint — the interleaving a find-before-mint read cannot fence, because a read
  // is not a claim.
  const reads = hold(PROVENANCE_READ, 2);
  const accepts = [
    copier(db, undefined, "a")({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] }),
    copier(db, undefined, "b")({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [source] }),
  ];

  await reads.reached;
  reads.release();
  const settled = await Promise.all(accepts);

  // ONE library row, and BOTH accepts name it — the loser's answer is the same one a sequential re-accept
  // gives (`minted:false` is the audit distinction, never control flow). Two rows here would be two
  // libraries for one gift, with the room re-pointed at whichever landed last.
  const rows = await db.select().from(characters).where(eq(characters.ownerId, nominee.id));
  expect(rows).toHaveLength(1);
  const landed = rows[0]?.id;
  expect(settled.map((result) => result[0]?.characterId)).toEqual([landed, landed]);
  expect(settled.flatMap((result) => result.map((copy) => copy.minted)).filter(Boolean)).toHaveLength(1);
});

// #1571 — THIS IS A FENCE, NOT A RED-FIRST DEFECT PROOF, and the label is deliberate: c096e260c added this
// pin alongside the #1560/#1445 basis-fence work, but that commit's code changes never touched the
// handoff-copy write path itself (`provenance-resolved, mint-the-rest` was already how a retry behaved) —
// only `card.ts`'s update predicate and `apply-fields.ts`/`iterate.ts` moved. The pin therefore does not
// fail against the pre-c096e260c source; it REGRESSION-FENCES the retry-converges property the #1432 work
// established so a future edit to the copier's provenance resolution cannot silently break it.
test("a mid-set failure leaves the landed copies claimable — the RETRY converges and mints the rest (#1432)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("partialhost") });
  const nominee = await seedUser(db, { handle: castId("partialnominee") });
  const first = await seedCard(db, oldHost.id, "aria", { avatarAssetId: await seedAsset(db, oldHost.id, "aria_face") });
  const second = await seedCard(db, oldHost.id, "brix");
  const reowned = await seedAsset(db, nominee.id, "nominee_face");

  // ONE card's mint dies (the re-own op throws — a store hiccup, a gone blob) while its sibling commits.
  // The batch is per-card by construction, so there is no rollback to want: the accept fails, and what the
  // crash contract owes is that the RETRY converges rather than minting a second library.
  // Only the card WITH an avatar reaches the re-own op, so this fails exactly one of the two mints.
  const failing = copier(db, () => Promise.reject(new Error("the asset store hiccuped")));
  await expect(failing({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId: CHAT, characterIds: [first, second] })).rejects.toThrow(/hiccuped/u);
  const landed = await db.select().from(characters).where(eq(characters.ownerId, nominee.id));
  expect(landed).toHaveLength(1);
  expect(landed[0]?.importedFrom).toBe(handoffProvenance(CHAT, second));

  const retried = await copier(
    db,
    () => Promise.resolve(reowned),
    "retry_",
  )({
    fromOwnerId: oldHost.id,
    toOwnerId: nominee.id,
    chatId: CHAT,
    characterIds: [first, second],
  });

  // Two entries, one library: the already-landed card is RESOLVED by its provenance key (`minted:false` —
  // the audit distinction), the failed one is minted now. A duplicate here would re-point the room at a
  // second copy and orphan the first.
  const rows = await db.select().from(characters).where(eq(characters.ownerId, nominee.id));
  expect(rows).toHaveLength(2);
  expect(retried.filter((copy) => copy.minted)).toHaveLength(1);
  expect(retried.map((copy) => copy.sourceCharacterId).toSorted()).toEqual([first, second].toSorted());
});
