// foundation/observability/debug/inspect/config — the CONFIG probes against a real libSQL :memory: db.
//
// The load-bearing property here is the RENDER-POLICY RESOLUTION, not the column echo. `trustHtml` is a
// tri-state where `null` means "inherit the deployment tier", so the stored column alone cannot answer "does
// this character's card render as immersive chrome or as sanitized markdown" — the question the probe exists
// to settle. These tests pin the resolution across all three stored states against both deployment floors,
// and pin the ASYMMETRY between the two axes (`trustHtml` resolves `override ?? deployment`;
// `forbidExternalMedia` is tighten-only, so a stored `false` can never widen a blocking deployment).
//
// The remaining cases pin the two shapes an operator would otherwise misread as a probe failure: a chat with
// no rpg game (`rpg: null` ≠ broken) and a character id that does not exist (`null` ≠ empty row).

import type { RenderPolicy } from "@orb/contracts/chat";
import { characters, chats, users } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { characterDetailRow, characterPolicySweep, chatConfigRow, rpgGameForChat } from "@orb/server/foundation/observability/debug";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_config_probe");
const OPEN_FLOOR: RenderPolicy = { trustHtml: false, forbidExternalMedia: false };
const BLOCKING_FLOOR: RenderPolicy = { trustHtml: false, forbidExternalMedia: true };
const TRUSTING_FLOOR: RenderPolicy = { trustHtml: true, forbidExternalMedia: false };

async function seedOwner(db: Awaited<ReturnType<typeof freshDb>>): Promise<void> {
  await db.insert(users).values({ id: OWNER, handle: castId<Handle>("configprobe") });
}

/** Seed one character with the given render-policy tri-states. */
async function seedCharacter(
  db: Awaited<ReturnType<typeof freshDb>>,
  suffix: string,
  trustHtml: boolean | null,
  forbidExternalMedia: boolean | null,
): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${suffix}`);
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(`handle-${suffix}`),
    ownerId: OWNER,
    name: `Character ${suffix}`,
    contentHash: `hash-${suffix}`,
    trustHtml,
    forbidExternalMedia,
  });
  return id;
}

test("a stored trustHtml of null INHERITS the deployment tier — the resolution the raw column cannot express", async () => {
  const db = await freshDb();
  await seedOwner(db);
  const id = await seedCharacter(db, "inherit", null, null);

  // Same row, two deployments, two opposite verdicts. This is precisely why the probe reports `resolved`
  // rather than leaving a reader to interpret `trustHtml: null`.
  const onUntrusting = await characterDetailRow(db, id, OPEN_FLOOR);
  expect(onUntrusting?.renderPolicy.stored.trustHtml).toBeNull();
  expect(onUntrusting?.renderPolicy.resolved?.trustHtml).toBe(false);
  expect(onUntrusting?.renderPolicy.cardTier).toBe("tierB");

  const onTrusting = await characterDetailRow(db, id, TRUSTING_FLOOR);
  expect(onTrusting?.renderPolicy.stored.trustHtml).toBeNull();
  expect(onTrusting?.renderPolicy.resolved?.trustHtml).toBe(true);
  expect(onTrusting?.renderPolicy.cardTier).toBe("tierA");
});

test("an explicit stored trustHtml OVERRIDES the deployment tier in BOTH directions", async () => {
  const db = await freshDb();
  await seedOwner(db);
  const forcedOn = await seedCharacter(db, "forced-on", true, null);
  const forcedOff = await seedCharacter(db, "forced-off", false, null);

  // Escalation up from an untrusting deployment — the designed opt-in path (D44 §12.0).
  expect((await characterDetailRow(db, forcedOn, OPEN_FLOOR))?.renderPolicy.cardTier).toBe("tierA");
  // …and DOWN from a trusting one: a card may always refuse the escalation it was granted.
  expect((await characterDetailRow(db, forcedOff, TRUSTING_FLOOR))?.renderPolicy.cardTier).toBe("tierB");
});

test("forbidExternalMedia is TIGHTEN-ONLY — a stored false cannot widen a blocking deployment", async () => {
  const db = await freshDb();
  await seedOwner(db);
  const allowing = await seedCharacter(db, "allow-media", null, false);

  // The axis asymmetry: were this resolved like trustHtml (`override ?? deployment`) the answer would be
  // `false`, and the control would render an element the app-document CSP then eats — a dead opt-in that
  // looks live. The deployment ceiling wins.
  const detail = await characterDetailRow(db, allowing, BLOCKING_FLOOR);
  expect(detail?.renderPolicy.stored.forbidExternalMedia).toBe(false);
  expect(detail?.renderPolicy.resolved?.forbidExternalMedia).toBe(true);
});

test("with NO deployment floor injected the verdict is null, never a guess", async () => {
  const db = await freshDb();
  await seedOwner(db);
  const id = await seedCharacter(db, "no-floor", null, null);

  // An absent answer beats a wrong one on the surface whose whole job is removing inference.
  const detail = await characterDetailRow(db, id, null);
  expect(detail?.renderPolicy.stored.trustHtml).toBeNull();
  expect(detail?.renderPolicy.deployment).toBeNull();
  expect(detail?.renderPolicy.resolved).toBeNull();
  expect(detail?.renderPolicy.cardTier).toBeNull();
});

test("the policy sweep resolves every character in one read", async () => {
  const db = await freshDb();
  await seedOwner(db);
  await seedCharacter(db, "sweep-trusted", true, null);
  await seedCharacter(db, "sweep-default", null, null);

  const sweep = await characterPolicySweep(db, OPEN_FLOOR);
  const tiers = new Map(sweep.map((r) => [r.id, r.renderPolicy.cardTier]));
  expect(tiers.get(castId<CharacterId>("character_sweep-trusted"))).toBe("tierA");
  expect(tiers.get(castId<CharacterId>("character_sweep-default"))).toBe("tierB");
});

test("the sweep carries ownerId + handle — the SAME handle under two owners is legal, not a duplicate", async () => {
  // The regression pin for a real misreading: the default-character pack is seeded PER USER, and
  // `characters_owner_handle_unique` is on `(ownerId, handle)` — so on an N-user deployment every default
  // appears N times under one handle. A sweep without the owner column made that look like a broken seeder,
  // and it was filed as a bug before the owners were checked. The tenant column is what makes it readable.
  const db = await freshDb();
  await seedOwner(db);
  const second = castId<UserId>("user_config_probe_2");
  await db.insert(users).values({ id: second, handle: castId<Handle>("configprobe2") });

  await seedCharacter(db, "shared", null, null);
  await db.insert(characters).values({
    id: castId<CharacterId>("character_shared_two"),
    // Deliberately the SAME handle as the first owner's card — the unique index permits it across owners.
    handle: castId<CharacterHandle>("handle-shared"),
    ownerId: second,
    name: "Character shared",
    contentHash: "hash-shared-2",
    trustHtml: null,
    forbidExternalMedia: null,
  });

  const sweep = await characterPolicySweep(db, OPEN_FLOOR);
  const shared = sweep.filter((r) => r.handle === "handle-shared");
  expect(shared).toHaveLength(2);
  // Same handle, DIFFERENT owners — the fact that distinguishes "seeded per user" from "seeded twice".
  expect(new Set(shared.map((r) => r.ownerId)).size).toBe(2);
});

test("a chat with no rpg game reports rpg null — an answer, not a probe failure", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_no_game");
  await db.insert(chats).values({ id: chatId, title: "plain room" });

  expect(await chatConfigRow(db, chatId)).not.toBeNull();
  expect(await rpgGameForChat(db, chatId)).toBeNull();
});

test("an unknown character id reports null rather than an empty row", async () => {
  const db = await freshDb();
  expect(await characterDetailRow(db, castId<CharacterId>("character_missing"), OPEN_FLOOR)).toBeNull();
  expect(await chatConfigRow(db, castId<ChatId>("chat_missing"))).toBeNull();
});
