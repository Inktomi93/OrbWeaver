// persistence/cast — proves the ONE kind-polymorphic CAST producer loader (D137, Chat-Macro-Resolution.md
// §1) against a real libSQL db. Ports the coverage assertions of the two per-kind loaders it replaces
// (macro-names.int.test.ts + roster-avatars.int.test.ts — assertions intact, re-pointed): member-gated
// coverage (participants' seat/active-persona ids UNION a loaded set of message rows' stamps), dedup
// across the two sources, the `assets` LEFT JOIN (an entity with no avatar resolves `avatarHash: null`,
// never dropped), the removed-character portrait floor, the empty-input no-query floor, and the
// multi-human member-not-owner gating.
//
// The EQUIVALENCE block at the bottom is the §8.2 red-first pin for the leg-D1→D2 swap: the cast
// projections must reproduce the old builders' maps byte-for-byte over the same seeded rows. It is
// deleted WITH the old loaders in leg D2 (its comparison subjects stop existing); the coverage
// assertions above it are the permanent suite.

import type { CastEntry } from "@orb/contracts/chat";
import {
  buildCastAvatarMaps,
  buildCastNameContext,
  buildCharacterAvatarMap,
  buildCharacterNameMap,
  buildPersonaAvatarMap,
  buildPersonaNameMap,
} from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveRowMacros } from "@orb/kit/macro";
import { beforeEach, describe } from "vitest";
import { loadChatCastProducer } from "../../../../../packages/server/src/domain/chat/persistence/cast.ts";
import { loadChatMacroNameProducer } from "../../../../../packages/server/src/domain/chat/persistence/macro-names.ts";
import { loadCharacterAvatarProducer, loadPersonaAvatarProducer } from "../../../../../packages/server/src/domain/chat/persistence/roster-avatars.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedCharacter, seedChat, seedPersona, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function entryOf(cast: readonly CastEntry[], id: string): CastEntry | undefined {
  return cast.find((e) => e.id === id);
}

describe("persistence/cast — loadChatCastProducer (§1 member-gated coverage, both kinds)", () => {
  test("covers a participant's seated character + active persona, each entry carrying its kind", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    await seedChat(db, "a");
    const charAvatar = await seedAsset(db, owner, "aria_avatar", { hash: "hash_aria" });
    const charId = await seedCharacter(db, owner, "aria", { avatarAssetId: charAvatar });
    const personaId = await seedPersona(db, owner, "nyx");

    const cast = await loadChatCastProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(entryOf(cast, charId)).toEqual({ kind: "character", id: charId, name: "aria", avatarHash: "hash_aria" });
    expect(entryOf(cast, personaId)).toEqual({ kind: "persona", id: personaId, name: "nyx", description: "nyx description", avatarHash: null });
    expect(cast).toHaveLength(2);
  });

  test("covers a message-stamped id NOT on any participant (a since-switched persona)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const activePersona = await seedPersona(db, owner, "zara");
    const oldAvatar = await seedAsset(db, owner, "mara_avatar", { hash: "hash_mara" });
    const oldPersona = await seedPersona(db, owner, "mara", { avatarAssetId: oldAvatar });

    const cast = await loadChatCastProducer(db, {
      participants: [{ characterId: null, activePersonaId: activePersona }],
      messages: [{ characterId: null, personaId: oldPersona }],
    });
    // Both the participant's CURRENT active persona and the message's HISTORICAL stamp resolve.
    expect(new Set(cast.map((e) => e.id))).toEqual(new Set([activePersona, oldPersona]));
    expect(entryOf(cast, oldPersona)?.avatarHash).toBe("hash_mara");
  });

  test("covers a message-stamped characterId NOT on any participant (a REMOVED character's portrait floor)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const avatar = await seedAsset(db, owner, "removed_avatar", { hash: "hash_removed" });
    const removed = await seedCharacter(db, owner, "removed", { avatarAssetId: avatar });

    // No participant carries this character — she was removed; only her stored message row references her.
    const cast = await loadChatCastProducer(db, {
      participants: [],
      messages: [{ characterId: removed, personaId: null }],
    });
    expect(cast).toEqual([{ kind: "character", id: removed, name: "removed", avatarHash: "hash_removed" }]);
  });

  test("an entity with NO avatar resolves avatarHash: null (never dropped from the cast)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const charId = await seedCharacter(db, owner, "bare_char");
    const personaId = await seedPersona(db, owner, "bare_persona");

    const cast = await loadChatCastProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(entryOf(cast, charId)?.avatarHash).toBeNull();
    expect(entryOf(cast, personaId)?.avatarHash).toBeNull();
    expect(cast).toHaveLength(2);
  });

  test("dedupes an id referenced by BOTH a participant and a message row (one query, one entry)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const charId = await seedCharacter(db, owner, "kai");

    const cast = await loadChatCastProducer(db, {
      participants: [{ characterId: charId, activePersonaId: null }],
      messages: [
        { characterId: charId, personaId: null },
        { characterId: charId, personaId: null },
      ],
    });
    expect(cast).toHaveLength(1);
  });

  test("null participants/messages ids are skipped; no ids ⇒ empty cast, no query", async () => {
    const cast = await loadChatCastProducer(db, {
      participants: [{ characterId: null, activePersonaId: null }],
      messages: [{ characterId: null, personaId: null }],
    });
    expect(cast).toEqual([]);
  });

  test("both args omitted ⇒ empty cast (the getChat-with-no-roster floor)", async () => {
    expect(await loadChatCastProducer(db, {})).toEqual([]);
  });
});

// ── Multi-human: the producer is MEMBER-gated (any id the chat references), never OWNER-scoped (task #59
// S6 parity, ported): `loadChatCastProducer` takes no caller/owner argument at all; a persona owned by a
// DIFFERENT user than the chat's host still resolves (name + avatar — the same co-participant visibility
// floor), and each row's own stamp resolves independently through the shared atom.
describe("persistence/cast — multi-human coverage is member-gated, not owner-gated (§1)", () => {
  test("a persona owned by a DIFFERENT user than the chat's host still resolves, name and avatar alike", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostAvatar = await seedAsset(db, host, "host_avatar", { hash: "hash_host" });
    const hostPersona = await seedPersona(db, host, "host_pov", { avatarAssetId: hostAvatar });
    const memberAvatar = await seedAsset(db, member, "member_avatar", { hash: "hash_member" });
    const memberPersona = await seedPersona(db, member, "member_pov", { avatarAssetId: memberAvatar });
    await seedChat(db, "a");

    const cast = await loadChatCastProducer(db, {
      participants: [
        { characterId: null, activePersonaId: hostPersona },
        { characterId: null, activePersonaId: memberPersona },
      ],
    });

    // Both resolve — the loader has no notion of "whose chat this is"; it resolves whatever ids the
    // membership layer already collected. A member's OWN persona is not gated behind the host's ownership.
    expect(new Set(cast.map((e) => e.name))).toEqual(new Set(["host_pov", "member_pov"]));
    expect(new Set(cast.map((e) => e.avatarHash))).toEqual(new Set(["hash_host", "hash_member"]));
  });

  test("rows stamped with DIFFERENT participants' personaIds each resolve {{user}} to THEIR OWN persona", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostPersona = await seedPersona(db, host, "nova");
    const memberPersona = await seedPersona(db, member, "juno");
    await seedChat(db, "a");

    // The producer covers cross-participant names via the message-stamped half of §1's coverage union.
    const cast = await loadChatCastProducer(db, {
      messages: [
        { characterId: null, personaId: hostPersona },
        { characterId: null, personaId: memberPersona },
      ],
    });
    const { characterNamesById, personaNamesById } = buildCastNameContext(cast);

    // Each row's OWN stamp resolves independently through the shared atom (Chat-Macro-Resolution.md §2) —
    // the host's row is never retargeted to the member's persona or vice versa.
    expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: hostPersona }, { characterNamesById, personaNamesById })).toBe("nova waves");
    expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: memberPersona }, { characterNamesById, personaNamesById })).toBe("juno waves");
  });
});

// ── §8.2 EQUIVALENCE (leg-D1 red-first pin; DELETED with the old loaders in leg D2) ───────────────────
// The cast projections must reproduce the OLD three-loader/four-builder pipeline's maps exactly, over one
// seeded fixture covering every coverage arm at once: seated character + active persona + a since-switched
// persona stamp + a removed character stamp + a bare (avatar-less) entity.
describe("persistence/cast — equivalence with the replaced per-kind loaders (§8.2, transitional)", () => {
  test("buildCastNameContext(cast) and buildCastAvatarMaps(cast) equal the old builders' maps", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    await seedChat(db, "a");
    const charAvatar = await seedAsset(db, owner, "aria_avatar", { hash: "hash_aria" });
    const seatedChar = await seedCharacter(db, owner, "aria", { avatarAssetId: charAvatar });
    const removedAvatar = await seedAsset(db, owner, "removed_avatar", { hash: "hash_removed" });
    const removedChar = await seedCharacter(db, owner, "removed", { avatarAssetId: removedAvatar });
    const bareChar = await seedCharacter(db, owner, "bare");
    const activePersona = await seedPersona(db, owner, "zara");
    const oldAvatar = await seedAsset(db, owner, "mara_avatar", { hash: "hash_mara" });
    const oldPersona = await seedPersona(db, owner, "mara", { avatarAssetId: oldAvatar });

    const args = {
      participants: [{ characterId: seatedChar, activePersonaId: activePersona }],
      messages: [
        { characterId: removedChar, personaId: oldPersona },
        { characterId: bareChar, personaId: null },
      ],
    };

    const cast = await loadChatCastProducer(db, args);
    const names = buildCastNameContext(cast);
    const avatars = buildCastAvatarMaps(cast);

    const oldNames = await loadChatMacroNameProducer(db, args);
    const oldPersonaAvatars = await loadPersonaAvatarProducer(db, args);
    const oldCharacterAvatars = await loadCharacterAvatarProducer(db, args);

    expect(names.characterNamesById).toEqual(buildCharacterNameMap(oldNames.characterNames));
    expect(names.personaNamesById).toEqual(buildPersonaNameMap(oldNames.personaNames));
    expect(avatars.personaAvatarsById).toEqual(buildPersonaAvatarMap(oldPersonaAvatars));
    expect(avatars.characterAvatarsById).toEqual(buildCharacterAvatarMap(oldCharacterAvatars));
  });
});
