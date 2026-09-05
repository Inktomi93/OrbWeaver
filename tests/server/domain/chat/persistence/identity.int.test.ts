// persistence/identity — proves the ONE kind-polymorphic IDENTITY producer loader (D137, Chat-Macro-Resolution.md
// §1) against a real libSQL db. Ports the coverage assertions of the two per-kind loaders it replaced
// (macro-names.int.test.ts + roster-avatars.int.test.ts — assertions intact, re-pointed; see the
// test-baseline `deletions` ledger): member-gated coverage (participants' seat/active-persona ids UNION a
// loaded set of message rows' stamps), dedup across the two sources, the `assets` LEFT JOIN (an entity
// with no avatar resolves `avatarHash: null`, never dropped), the removed-character portrait floor, the
// empty-input no-query floor, and the multi-human member-not-owner gating.
//
// (Leg D1 additionally carried a transitional §8.2 equivalence block proving the identity projections
// reproduce the old builders' maps byte-for-byte; it died with the old loaders in leg D2 — the git
// history of this file holds the receipt.)

import type { ChatIdentity } from "@orb/contracts/chat";
import { buildIdentityNameContext } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveRowMacros } from "@orb/kit/macro";
import { beforeEach, describe } from "vitest";
import { loadChatIdentityProducer } from "../../../../../packages/server/src/domain/chat/persistence/identity.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedAsset, seedCharacter, seedChat, seedPersona, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function entryOf(identities: readonly ChatIdentity[], id: string): ChatIdentity | undefined {
  return identities.find((e) => e.id === id);
}

describe("persistence/identity — loadChatIdentityProducer (§1 member-gated coverage, both kinds)", () => {
  test("covers a participant's seated character + active persona, each entry carrying its kind", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    await seedChat(db, "a");
    const charAvatar = await seedAsset(db, owner, "aria_avatar", { hash: "hash_aria" });
    const charId = await seedCharacter(db, owner, "aria", { avatarAssetId: charAvatar });
    const personaId = await seedPersona(db, owner, "nyx");

    const identities = await loadChatIdentityProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(entryOf(identities, charId)).toEqual({ kind: "character", id: charId, name: "aria", avatarHash: "hash_aria" });
    expect(entryOf(identities, personaId)).toEqual({ kind: "persona", id: personaId, name: "nyx", description: "nyx description", avatarHash: null });
    expect(identities).toHaveLength(2);
  });

  test("covers a message-stamped id NOT on any participant (a since-switched persona)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const activePersona = await seedPersona(db, owner, "zara");
    const oldAvatar = await seedAsset(db, owner, "mara_avatar", { hash: "hash_mara" });
    const oldPersona = await seedPersona(db, owner, "mara", { avatarAssetId: oldAvatar });

    const identities = await loadChatIdentityProducer(db, {
      participants: [{ characterId: null, activePersonaId: activePersona }],
      messages: [{ characterId: null, personaId: oldPersona }],
    });
    // Both the participant's CURRENT active persona and the message's HISTORICAL stamp resolve.
    expect(new Set(identities.map((e) => e.id))).toEqual(new Set([activePersona, oldPersona]));
    expect(entryOf(identities, oldPersona)?.avatarHash).toBe("hash_mara");
  });

  test("covers a message-stamped characterId NOT on any participant (a REMOVED character's portrait floor)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const avatar = await seedAsset(db, owner, "removed_avatar", { hash: "hash_removed" });
    const removed = await seedCharacter(db, owner, "removed", { avatarAssetId: avatar });

    // No participant carries this character — she was removed; only her stored message row references her.
    const identities = await loadChatIdentityProducer(db, {
      participants: [],
      messages: [{ characterId: removed, personaId: null }],
    });
    expect(identities).toEqual([{ kind: "character", id: removed, name: "removed", avatarHash: "hash_removed" }]);
  });

  test("an entity with NO avatar resolves avatarHash: null (never dropped from the identity set)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const charId = await seedCharacter(db, owner, "bare_char");
    const personaId = await seedPersona(db, owner, "bare_persona");

    const identities = await loadChatIdentityProducer(db, {
      participants: [{ characterId: charId, activePersonaId: personaId }],
    });
    expect(entryOf(identities, charId)?.avatarHash).toBeNull();
    expect(entryOf(identities, personaId)?.avatarHash).toBeNull();
    expect(identities).toHaveLength(2);
  });

  test("dedupes an id referenced by BOTH a participant and a message row (one query, one entry)", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const charId = await seedCharacter(db, owner, "kai");

    const identities = await loadChatIdentityProducer(db, {
      participants: [{ characterId: charId, activePersonaId: null }],
      messages: [
        { characterId: charId, personaId: null },
        { characterId: charId, personaId: null },
      ],
    });
    expect(identities).toHaveLength(1);
  });

  test("null participants/messages ids are skipped; no ids ⇒ an empty identity set, no query", async () => {
    const identities = await loadChatIdentityProducer(db, {
      participants: [{ characterId: null, activePersonaId: null }],
      messages: [{ characterId: null, personaId: null }],
    });
    expect(identities).toEqual([]);
  });

  test("both args omitted ⇒ an empty identity set (the getChat-with-no-roster floor)", async () => {
    expect(await loadChatIdentityProducer(db, {})).toEqual([]);
  });
});

// ── Multi-human: the producer is MEMBER-gated (any id the chat references), never OWNER-scoped (task #59
// S6 parity, ported): `loadChatIdentityProducer` takes no caller/owner argument at all; a persona owned by a
// DIFFERENT user than the chat's host still resolves (name + avatar — the same co-participant visibility
// floor), and each row's own stamp resolves independently through the shared atom.
describe("persistence/identity — multi-human coverage is member-gated, not owner-gated (§1)", () => {
  test("a persona owned by a DIFFERENT user than the chat's host still resolves, name and avatar alike", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostAvatar = await seedAsset(db, host, "host_avatar", { hash: "hash_host" });
    const hostPersona = await seedPersona(db, host, "host_pov", { avatarAssetId: hostAvatar });
    const memberAvatar = await seedAsset(db, member, "member_avatar", { hash: "hash_member" });
    const memberPersona = await seedPersona(db, member, "member_pov", { avatarAssetId: memberAvatar });
    await seedChat(db, "a");

    const identities = await loadChatIdentityProducer(db, {
      participants: [
        { characterId: null, activePersonaId: hostPersona },
        { characterId: null, activePersonaId: memberPersona },
      ],
    });

    // Both resolve — the loader has no notion of "whose chat this is"; it resolves whatever ids the
    // membership layer already collected. A member's OWN persona is not gated behind the host's ownership.
    expect(new Set(identities.map((e) => e.name))).toEqual(new Set(["host_pov", "member_pov"]));
    expect(new Set(identities.map((e) => e.avatarHash))).toEqual(new Set(["hash_host", "hash_member"]));
  });

  test("rows stamped with DIFFERENT participants' personaIds each resolve {{user}} to THEIR OWN persona", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const hostPersona = await seedPersona(db, host, "nova");
    const memberPersona = await seedPersona(db, member, "juno");
    await seedChat(db, "a");

    // The producer covers cross-participant names via the message-stamped half of §1's coverage union.
    const identities = await loadChatIdentityProducer(db, {
      messages: [
        { characterId: null, personaId: hostPersona },
        { characterId: null, personaId: memberPersona },
      ],
    });
    const { characterNamesById, personaNamesById } = buildIdentityNameContext(identities);

    // Each row's OWN stamp resolves independently through the shared atom (Chat-Macro-Resolution.md §2) —
    // the host's row is never retargeted to the member's persona or vice versa.
    expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: hostPersona }, { characterNamesById, personaNamesById })).toBe("nova waves");
    expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: memberPersona }, { characterNamesById, personaNamesById })).toBe("juno waves");
  });
});
