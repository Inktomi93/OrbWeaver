// persistence/roster-avatars — proves the persona AVATAR-chrome producer loader (the sibling to
// macro-names.ts's NAME producer, §1: kept separate because that producer is names-only) against a real
// libSQL db: member-gated coverage (participants' active personas UNION a loaded set of message rows'
// stamps — the SAME `collectMacroIds` algorithm macro-names uses), the `assets` LEFT JOIN (a persona with
// no avatar resolves `avatarHash: null`, never dropping the row), and the empty-input no-query floor.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { loadCharacterAvatarProducer, loadPersonaAvatarProducer } from "../../../../../packages/server/src/domain/chat/persistence/roster-avatars";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { seedAsset, seedCharacter, seedPersona, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("persistence/roster-avatars — loadPersonaAvatarProducer (§1 sibling, member-gated coverage)", () => {
  test("covers a participant's active persona, joined to its avatar hash", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const avatar = await seedAsset(db, owner, "aria_avatar", { hash: "hash_aria" });
    const personaId = await seedPersona(db, owner, "aria", { avatarAssetId: avatar });

    const producer = await loadPersonaAvatarProducer(db, {
      participants: [{ characterId: null, activePersonaId: personaId }],
    });
    expect(producer).toEqual([{ id: personaId, avatarHash: "hash_aria" }]);
  });

  test("a persona with NO avatar resolves avatarHash: null (never dropped from the array)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const personaId = await seedPersona(db, owner, "bare");

    const producer = await loadPersonaAvatarProducer(db, {
      participants: [{ characterId: null, activePersonaId: personaId }],
    });
    expect(producer).toEqual([{ id: personaId, avatarHash: null }]);
  });

  test("covers a message-stamped id NOT on any participant (a since-switched persona)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const activeAvatar = await seedAsset(db, owner, "zara_avatar", { hash: "hash_zara" });
    const activePersona = await seedPersona(db, owner, "zara", { avatarAssetId: activeAvatar });
    const oldAvatar = await seedAsset(db, owner, "mara_avatar", { hash: "hash_mara" });
    const oldPersona = await seedPersona(db, owner, "mara", { avatarAssetId: oldAvatar });

    const producer = await loadPersonaAvatarProducer(db, {
      participants: [{ characterId: null, activePersonaId: activePersona }],
      messages: [{ characterId: null, personaId: oldPersona }],
    });
    expect(new Set(producer.map((p) => p.id))).toEqual(new Set([activePersona, oldPersona]));
    expect(producer.find((p) => p.id === oldPersona)?.avatarHash).toBe("hash_mara");
  });

  test("dedupes an id referenced by BOTH a participant and a message row (one entry)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const personaId = await seedPersona(db, owner, "kai");

    const producer = await loadPersonaAvatarProducer(db, {
      participants: [{ characterId: null, activePersonaId: personaId }],
      messages: [
        { characterId: null, personaId },
        { characterId: null, personaId },
      ],
    });
    expect(producer).toHaveLength(1);
  });

  test("null participants/messages ids are skipped; no ids ⇒ empty array, no query", async () => {
    const producer = await loadPersonaAvatarProducer(db, {
      participants: [{ characterId: null, activePersonaId: null }],
      messages: [{ characterId: null, personaId: null }],
    });
    expect(producer).toEqual([]);
  });

  test("both args omitted ⇒ empty array (the getChat-with-no-roster floor)", async () => {
    expect(await loadPersonaAvatarProducer(db, {})).toEqual([]);
  });
});

// Multi-human parity with macro-names.ts (§1): member-gated, never owner-gated — a persona owned by a
// DIFFERENT user than the chat's host still resolves its avatar (the same co-participant visibility floor
// as the name).
describe("persistence/roster-avatars — multi-human coverage is member-gated, not owner-gated (§1)", () => {
  test("a persona owned by a DIFFERENT user than the chat's host still resolves its avatar", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostAvatar = await seedAsset(db, host, "host_avatar", { hash: "hash_host" });
    const hostPersona = await seedPersona(db, host, "host_pov", { avatarAssetId: hostAvatar });
    const memberAvatar = await seedAsset(db, member, "member_avatar", { hash: "hash_member" });
    const memberPersona = await seedPersona(db, member, "member_pov", {
      avatarAssetId: memberAvatar,
    });

    const producer = await loadPersonaAvatarProducer(db, {
      participants: [
        { characterId: null, activePersonaId: hostPersona },
        { characterId: null, activePersonaId: memberPersona },
      ],
    });
    expect(new Set(producer.map((p) => p.avatarHash))).toEqual(new Set(["hash_host", "hash_member"]));
  });
});

// loadCharacterAvatarProducer — the assistant-row twin, the transcript-integrity floor: a character
// REMOVED from the room (no participant row) whose message is still in the transcript must still resolve
// its portrait. Same coverage algorithm + LEFT-JOIN semantics as the persona sibling above.
describe("persistence/roster-avatars — loadCharacterAvatarProducer (removal-integrity floor)", () => {
  test("covers a participant character, joined to its avatar hash", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const avatar = await seedAsset(db, owner, "aria_avatar", { hash: "hash_aria" });
    const characterId = await seedCharacter(db, owner, "aria", { avatarAssetId: avatar });

    const producer = await loadCharacterAvatarProducer(db, {
      participants: [{ characterId, activePersonaId: null }],
    });
    expect(producer).toEqual([{ id: characterId, avatarHash: "hash_aria" }]);
  });

  test("covers a message-stamped characterId NOT on any participant (a REMOVED character's historical row)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const avatar = await seedAsset(db, owner, "removed_avatar", { hash: "hash_removed" });
    const removed = await seedCharacter(db, owner, "removed", { avatarAssetId: avatar });

    // No participant carries this character — she was removed; only her stored message row references her.
    const producer = await loadCharacterAvatarProducer(db, {
      participants: [],
      messages: [{ characterId: removed, personaId: null }],
    });
    expect(producer).toEqual([{ id: removed, avatarHash: "hash_removed" }]);
  });

  test("a character with NO avatar resolves avatarHash: null (never dropped from the array)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const characterId = await seedCharacter(db, owner, "bare");

    const producer = await loadCharacterAvatarProducer(db, {
      participants: [{ characterId, activePersonaId: null }],
    });
    expect(producer).toEqual([{ id: characterId, avatarHash: null }]);
  });

  test("both args omitted ⇒ empty array (the getChat-with-no-cast floor)", async () => {
    expect(await loadCharacterAvatarProducer(db, {})).toEqual([]);
  });
});
