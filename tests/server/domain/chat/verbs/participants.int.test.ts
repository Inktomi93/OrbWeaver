// The roster / group-config / room-override / membership-lifecycle verbs (chat.md Part III §1/§9/§11). Proves
// against a real libSQL db: the host-authority gate (member denied with `not_host`), the persistence effect,
// the emitted `chatUpdated` bus event, and the kick `kicked` notification — with the REAL admin `can()`. The
// verbs are reached through the grouped-file BUNDLE (`createParticipants(ctx, { emit, claimChat: noClaim })`).

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, ChatMetadata, DurableChatBusEvent, RoomOverrides } from "@orb/contracts/chat";
import { roomOverridesSchema } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import {
  assets,
  auditLogs,
  characterStats,
  characters,
  chatEvents,
  chatHandoffResumptions,
  chatParticipants,
  chats,
  messages,
  messageVariants,
  statsCanonVersions,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatEventId, ChatId, ChatParticipantId, DocumentId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { deleteAssetRowIfUnreferenced } from "../../../../../packages/server/src/domain/assets/persistence/asset-refs.ts";
import { createChatBus } from "../../../../../packages/server/src/domain/chat/bus.ts";
import { ChatNotFoundError, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { getToolRecurseLimit } from "../../../../../packages/server/src/domain/chat/contract/metadata.ts";
import { createParticipants, setParticipantActivePersona } from "../../../../../packages/server/src/domain/chat/verbs/participants.ts";
import { applyStatsDelta, bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { publishChatEvent, subscribeAllChatEvents } from "../../../../../packages/server/src/transport/trpc/chat-events-bus.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, noClaim, seedAsset, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

/** A recording emit-op fake that HONORS the PD-24 contract: it records the event AND commits the producer's
 *  unexecuted co-statements (the op owns the commit — without this the membership transition never lands). */
function recordingEmit(notes: NotificationEvent[]): (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void> {
  return async (event, coStatements) => {
    notes.push(event);
    if (coStatements !== undefined && coStatements.length > 0) {
      await db.batch(batchMany(coStatements as BatchStmt[]));
    }
  };
}

const emit = async (event: ChatBusEvent, claimStatement?: BatchStmt): Promise<void> => {
  if (claimStatement !== undefined) {
    const [claim] = await db.batch(batchMany([claimStatement]));
    if (claim.rowsAffected === 0) {
      return;
    }
  }
  emitted.push(event);
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

const METADATA_WRITERS = [
  "group",
  "room overrides",
  "databank visibility",
  "host display scripts",
  "offer choices",
  "tool recurse limit",
  "regex allow",
] as const;
type MetadataWriter = (typeof METADATA_WRITERS)[number];

function runMetadataWriter(kind: MetadataWriter, roster: ReturnType<typeof createParticipants>, host: UserId, chatId: ChatId): Promise<unknown> {
  switch (kind) {
    case "group":
      return roster.setGroupConfig({ principal: principal(host), chatId, config: { output: "per-speaker", policy: "natural" } });
    case "room overrides":
      return roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "new" } });
    case "databank visibility":
      return roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [] } });
    case "host display scripts":
      return roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true });
    case "offer choices":
      return roster.setOfferChoices({ principal: principal(host), chatId, enabled: true });
    case "tool recurse limit":
      return roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 6 });
    case "regex allow":
      return roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "preset", enabled: false } });
  }
}

/** `greetings` is a REQUIRED array on the real card (`characterCardSchema`) and `addCharacterToChat` reads
 *  `greetings[0]` for the F6 in-window join greeting — a double that omits it is a lying double, so the
 *  default is the honest "card with no greetings" (`[]`), never absent. */
const card = (name: string, greetings: readonly string[] = []): CharacterCard =>
  // FABRICATION-OK: minimal CharacterCard double (turn.int precedent, scenario.ts) — reads only name/avatarAssetId/greetings.
  ({ name, avatarAssetId: null, greetings: greetings.map((text) => ({ text })) }) as unknown as CharacterCard;

/** An owner-scoped `getCard` fake mirroring the REAL one (D28 — `loadOwnedCharacterRow`): the card resolves
 *  only for its OWNER, `null` for a non-owner. The handoff character-drop resolver (D64 / F4) calls this per seated
 *  character to decide which seats the NEW host doesn't own (→ dropped); the harness default is a bare `null`. */
function ownedCard(): (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null> {
  return async ({ ownerId, characterId }) => {
    const [row] = await db.select().from(characters).where(eq(characters.id, characterId));
    return row !== undefined && row.ownerId === ownerId ? card(row.name) : null;
  };
}

describe("chatMetadata writers — concurrent knobs do not erase each other (#1450)", () => {
  /** The room's metadata as stored (the typed column — never a fabricated shape). */
  async function metadataOf(chatId: ChatId): Promise<ChatMetadata> {
    const [row] = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId));
    return row?.metadata ?? {};
  }

  test("two host knobs written concurrently BOTH survive", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "meta-race");
    await seedParticipant(db, { chatId, key: "mr", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    // Both verbs read the row, merge their own key, and write. Under the old whole-blob write each one
    // re-asserted its OWN stale copy of the other's key, so the later commit silently discarded the earlier.
    await Promise.all([
      roster.setOfferChoices({ principal: principal(host), chatId, enabled: true }),
      roster.setReactionsEnabled({ principal: principal(host), chatId, enabled: false }),
    ]);

    const metadata = await metadataOf(chatId);
    expect(metadata.offerChoices).toBe(true);
    expect(metadata.reactionsEnabled).toBe(false);
  });

  test("a knob write does not resurrect a sibling that changed after its own read", async () => {
    const host = await seedUser(db, castId<Handle>("host2"));
    const chatId = await seedChat(db, "meta-stale");
    await seedParticipant(db, { chatId, key: "ms", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setOfferChoices({ principal: principal(host), chatId, enabled: true });
    // A writer whose read of the room happened BEFORE the flip below must not carry the pre-flip value back.
    await Promise.all([
      roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 7 }),
      roster.setOfferChoices({ principal: principal(host), chatId, enabled: false }),
    ]);

    const metadata = await metadataOf(chatId);
    expect(metadata.toolRecurseLimit).toBe(7);
    expect(metadata.offerChoices).toBe(false);
  });

  test("a sibling key survives a write to an ABSENT key (the json_set create arm)", async () => {
    const host = await seedUser(db, castId<Handle>("host3"));
    const chatId = await seedChat(db, "meta-fresh");
    await seedParticipant(db, { chatId, key: "mf", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true });
    await roster.setCharactersCanReact({ principal: principal(host), chatId, enabled: true });

    const metadata = await metadataOf(chatId);
    expect(metadata.hostDisplayScripts).toBe(true);
    expect(metadata.charactersCanReact).toBe(true);
  });
});

// ── #1742 — the room's regex levers ──────────────────────────────────────────────────────────────────
describe("setRegexAllow — the room's regex levers (host-only)", () => {
  /** The room's metadata as STORED (the typed column — never a fabricated shape). */
  async function metadataOf(chatId: ChatId): Promise<ChatMetadata> {
    const [row] = await db.select({ metadata: chats.metadata }).from(chats).where(eq(chats.id, chatId));
    return row?.metadata ?? {};
  }

  test("the MASTER and a TIER are different keys, and writing one leaves the other alone", async () => {
    const host = await seedUser(db, castId<Handle>("rx-host"));
    const chatId = await seedChat(db, "rx-a");
    await seedParticipant(db, { chatId, key: "rxa", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    expect(await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "master", enabled: false } })).toEqual({
      enabled: false,
      tiers: undefined,
    });
    expect(await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "preset", enabled: false } })).toEqual({
      enabled: false,
      tiers: { preset: false },
    });

    const metadata = await metadataOf(chatId);
    expect(metadata.regexEnabled).toBe(false);
    expect(metadata.regexTiers).toEqual({ preset: false });
  });

  test("a second tier MERGES into the stored map — one lever per call never clears its neighbours", async () => {
    const host = await seedUser(db, castId<Handle>("rx-host2"));
    const chatId = await seedChat(db, "rx-b");
    await seedParticipant(db, { chatId, key: "rxb", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "global", enabled: false } });
    await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "chat", enabled: false } });
    // …and switching one back ON is an explicit `true`, not a deletion: absent and true both mean "runs",
    // so the host never has to care which spelling their room ended up with.
    await roster.setRegexAllow({ principal: principal(host), chatId, lever: { kind: "tier", tier: "global", enabled: true } });

    expect((await metadataOf(chatId)).regexTiers).toEqual({ global: true, chat: false });
  });

  test("a non-host is refused and nothing is written", async () => {
    const host = await seedUser(db, castId<Handle>("rx-host3"));
    const member = await seedUser(db, castId<Handle>("rx-member"));
    const chatId = await seedChat(db, "rx-c");
    await seedParticipant(db, { chatId, key: "rxc-h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "rxc-m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await expect(roster.setRegexAllow({ principal: principal(member), chatId, lever: { kind: "master", enabled: false } })).rejects.toThrow();
    expect((await metadataOf(chatId)).regexEnabled).toBeUndefined();
  });
});

describe("setGroupConfig — host-only metadata write", () => {
  test("the host writes a fully-defaulted GroupConfig + emits chatUpdated", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const result = await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });

    expect(result.output).toBe("per-speaker");
    // cardScope only exists on the per-speaker arm — narrow in the expect arg (no conditional-expect).
    expect(result.output === "per-speaker" ? result.cardScope : undefined).toBe("merged");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.group?.output).toBe("per-speaker");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a plain member is refused with not_host", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      .setGroupConfig({
        principal: principal(member),
        chatId,
        config: { output: "per-speaker", policy: "natural" },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });
});

describe("setRoomOverrides — the four-field allowlist", () => {
  test("the host writes the allowed fields", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const result = await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a tavern" },
    });
    expect(result).toEqual({ scenario: "a tavern" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
  });

  test("a stray field is default-denied with forbidden_override", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      .setRoomOverrides({
        principal: principal(host),
        chatId,
        // FABRICATION-OK: the invalid-input probe THIS test asserts is default-denied (a stray field).
        overrides: { scenario: "ok", evil: "system prompt" } as unknown as RoomOverrides,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
  });
});

describe("setChatDocumentVisibility — host-only databank visibility override (D85)", () => {
  test("the host writes the hidden set (set-semantics), persists it, and emits chatUpdated", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    const docA = mintTypeId(ID_PREFIX.document);
    const docB = mintTypeId(ID_PREFIX.document);

    const result = await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA, docB] } });
    expect(result).toEqual({ hidden: [docA, docB] });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.databankVisibility).toEqual({ hidden: [docA, docB] });
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);

    // Set-semantics: a second write REPLACES the whole list (a re-shown doc is not stranded as hidden).
    await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA] } });
    const [row2] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row2?.metadata?.databankVisibility).toEqual({ hidden: [docA] });
  });

  test("the write MERGES into sibling sub-blobs — it never nukes roomOverrides", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });
    const docA = mintTypeId(ID_PREFIX.document);

    await roster.setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: [docA] } });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
    expect(row?.metadata?.databankVisibility).toEqual({ hidden: [docA] });
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setChatDocumentVisibility({ principal: principal(member), chatId, visibility: { hidden: [] } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });

  test("a malformed hidden id is default-denied with forbidden_override (trust-boundary validation)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      // FABRICATION-OK: a malformed (non-TypeID) hidden id is exactly the invalid input the verb must reject.
      .setChatDocumentVisibility({ principal: principal(host), chatId, visibility: { hidden: ["not-a-document-id"] } as unknown as { hidden: DocumentId[] } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
  });
});

describe("setChatBackground — host-only per-chat carried background (BG-C)", () => {
  // A full source-only ThemeBackground from a partial (the wire schema fills these defaults at the transport;
  // the service param type is the full `ThemeBackground`, so the test spells the whole shape).
  const bg = (o: Partial<ThemeBackground>): ThemeBackground => ({
    kind: "none",
    seededId: "",
    externalUrl: "",
    assetId: "",
    assetHash: "",
    mime: "",
    provenanceUrl: "",
    ...o,
  });

  test("an EXTERNAL source is MATERIALIZED server-side into an owned asset (F-P0-2): persists kind:asset + provenanceUrl, emits chatUpdated", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const url = "https://cdn.example/bg.jpg";
    const storedAssetId = await seedAsset(db, host, "external-background");
    const roster = createParticipants(
      makeChatContext(db, {
        // The compose op fetches → magic-belts → stores the URL under the host; the stub returns the stored asset.
        materializeBackground: () => Promise.resolve({ ok: true, asset: { assetId: storedAssetId, assetHash: "hash_ext", mime: "image/png" } }),
        // The freshly-stored asset is the host's OWN, so the ownership gate passes.
        filterOwnedAssetIds: () => Promise.resolve([storedAssetId]),
      }),
      { emit, claimChat: noClaim },
    );

    const result = await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "external", externalUrl: url }) });
    // A raw external URL can never paint (CSP); it is persisted as a same-origin `asset` with the URL as provenance.
    expect(result).toEqual({
      kind: "asset",
      seededId: "",
      externalUrl: "",
      assetId: storedAssetId,
      assetHash: "hash_ext",
      mime: "image/png",
      provenanceUrl: url,
    });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background).toEqual(result);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("an EXTERNAL source whose URL can't be materialized is refused background_unavailable — no write, no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { materializeBackground: () => Promise.resolve({ ok: false, reason: "not-image" }) }), {
      emit,
      claimChat: noClaim,
    });

    const err = await roster
      .setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "external", externalUrl: "https://cdn.example/notimage.txt" }) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background).toBeUndefined();
    expect(emitted).toEqual([]);
  });

  test("kind:none clears the background (replace-semantics) and MERGES into siblings — never nukes roomOverrides", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });

    await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "seeded", seededId: "dusk" }) });
    await roster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "none" }) });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.kind).toBe("none");
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setChatBackground({ principal: principal(member), chatId, background: bg({ kind: "none" }) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });

  test("an asset background referencing an asset the host does NOT own is forbidden_override — no write (cross-user GC-root guard)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The default `filterOwnedAssetIds` stub owns nothing → the asset-ownership gate refuses.
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    const assetId = mintTypeId(ID_PREFIX.asset);

    const err = await roster
      .setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "asset", assetId, assetHash: "h" }) })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
    expect(emitted).toEqual([]);
  });

  test("an asset background the host DOES own is written", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const assetId = await seedAsset(db, host, "ownedbackground");
    const roster = createParticipants(makeChatContext(db, { filterOwnedAssetIds: () => Promise.resolve([assetId]) }), { emit, claimChat: noClaim });

    const result = await roster.setChatBackground({
      principal: principal(host),
      chatId,
      background: bg({ kind: "asset", assetId, assetHash: "hash1", mime: "image/png" }),
    });
    expect(result.kind).toBe("asset");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.assetId).toBe(assetId);
  });

  test("an asset removed after the ownership read cannot be persisted as a dangling JSON reference", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const assetId = await seedAsset(db, host, "removedbackground");
    const roster = createParticipants(makeChatContext(db, { filterOwnedAssetIds: () => Promise.resolve([assetId]) }), { emit, claimChat: noClaim });
    await db.delete(assets).where(eq(assets.id, assetId));

    const err = await roster
      .setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "asset", assetId, assetHash: "hash1", mime: "image/png" }) })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("background_unavailable");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background).toBeUndefined();
    expect(emitted).toEqual([]);
  });

  test.each(METADATA_WRITERS)("a stale %s write cannot resurrect a cleared background after GC", async (writer) => {
    const host = await seedUser(db, castId<Handle>("host"));
    const assetId = await seedAsset(db, host, "siblingreplay");
    const chatId = await seedChat(db, "stale-sibling", { metadata: { background: bg({ kind: "asset", assetId, assetHash: "hash", mime: "image/png" }) } });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    let reachedResolve: (() => void) | undefined;
    let releaseResolve: (() => void) | undefined;
    const reached = new Promise<void>((resolve) => {
      reachedResolve = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    const staleRoster = createParticipants(makeChatContext(db), {
      emit,
      claimChat: async () => {
        reachedResolve?.();
        await release;
      },
    });
    const writing = runMetadataWriter(writer, staleRoster, host, chatId);
    await reached;
    const clearingRoster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    await clearingRoster.setChatBackground({ principal: principal(host), chatId, background: bg({ kind: "none" }) });
    expect(await deleteAssetRowIfUnreferenced(db, host, assetId)).toBe(true);
    releaseResolve?.();

    await expect(writing).rejects.toMatchObject({ code: "background_unavailable" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.kind).toBe("none");
    expect(await db.select().from(assets).where(eq(assets.id, assetId))).toEqual([]);
  });

  test("a non-asset kind carrying a populated assetId persists CLEAN — asset fields emptied, no foreign GC-root smuggle", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The default `filterOwnedAssetIds` stub owns NOTHING, so a real ownership check on this id would refuse.
    // It must NOT be reached: canonicalization empties the asset ref for a non-asset kind BEFORE the ownership
    // gate, so the write SUCCEEDS with a clean shape and the persisted assetId is "" — never GC-rooting the
    // smuggled (potentially foreign) id through `chats.metadata.background.assetId`.
    const foreign = mintTypeId(ID_PREFIX.asset);
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const result = await roster.setChatBackground({
      principal: principal(host),
      chatId,
      background: bg({ kind: "none", assetId: foreign, assetHash: "h", mime: "image/png" }),
    });
    expect(result).toEqual({ kind: "none", seededId: "", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.background?.assetId).toBe("");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });
});

describe("setToolRecurseLimit — host-only per-chat tool-recurse cap", () => {
  test("the host writes the cap, persists it into metadata, and emits chatUpdated", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const result = await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 12 });
    expect(result).toBe(12);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(getToolRecurseLimit(row?.metadata)).toBe(12);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("the write MERGES — a sibling sub-blob (roomOverrides) survives", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: { scenario: "a tavern" } });
    await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 3 });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.roomOverrides).toEqual({ scenario: "a tavern" });
    expect(row?.metadata?.toolRecurseLimit).toBe(3);
  });

  test("an out-of-range value is refused forbidden_override (no write)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setToolRecurseLimit({ principal: principal(host), chatId, limit: 999 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("forbidden_override");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.metadata?.toolRecurseLimit).toBeUndefined();
  });

  test("a plain member is refused with not_host — no write", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setToolRecurseLimit({ principal: principal(member), chatId, limit: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(emitted).toEqual([]);
  });
});

describe("get group config for chat — member read", () => {
  test("an absent group sub-blob resolves to the canonical default", async () => {
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const cfg = await roster.getGroupConfigForChat({ principal: principal(member), chatId });
    expect(cfg.output).toBe("per-speaker");
    expect(cfg.policy).toBe("natural");
  });
});

describe("remove character from chat — the symmetric drop (rpg scene-cast prune consumer, 07 §2.2)", () => {
  test("the host removes a present character seat — leftSeq stamped + chatUpdated emitted", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard() }), { emit, claimChat: noClaim });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    emitted.length = 0; // ignore the add emit

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId });

    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows[0]?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a plain member is refused — no stamp, no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard() }), { emit, claimChat: noClaim });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    emitted.length = 0;

    await expect(roster.removeCharacterFromChat({ principal: principal(member), chatId, characterId })).rejects.toThrow();
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows[0]?.leftSeq).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("removing an absent character is an idempotent no-op — no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard() }), { emit, claimChat: noClaim });

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId: castId<CharacterId>("character_absent") });
    expect(emitted).toEqual([]);
  });

  test("the prune is SURGICAL — a sibling character seat stays present (the distinct post-fork act, D64)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard() }), { emit, claimChat: noClaim });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: aria });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId: aria });

    const present = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
    expect(present.map((r) => r.characterId)).toEqual([brann]);
  });
});

describe("add character to chat — the participant-insert chokepoint", () => {
  test("the host adds a character; the row is inserted + the view resolves the card", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit,
    });

    const view = await roster.addCharacterToChat({
      principal: principal(host),
      chatId,
      characterId,
    });

    expect(view.kind).toBe("character");
    expect(view.characterId).toBe(characterId);
    expect(view.role).toBe("member");
    expect(view.displayName).toBe("Aria");
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows).toHaveLength(1);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("a foreign/unknown character is refused NOT_FOUND — no ghost seat (PD-21)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // The owner-scoped card read: a foreign character resolves null (foreign == missing, leak-free).
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(null) }), {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit,
    });

    await expect(
      roster.addCharacterToChat({
        principal: principal(host),
        chatId,
        characterId: castId<CharacterId>("character_foreign"),
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.kind, "character"));
    expect(rows).toHaveLength(0);
    expect(emitted).toEqual([]);
  });

  test("a double-add is IDEMPOTENT — the second call returns the existing seat, never a duplicate row (F2)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit, claimChat: noClaim });

    const first = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    const second = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });

    // The character half has no (chatId,userId) unique — the present-seat floor is what prevents the dup row.
    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(rows).toHaveLength(1);
  });

  test("after a double-add a knob verb updates the SINGLE row (no multi-row fan-out) (F2)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit, claimChat: noClaim });

    const seat = await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    await roster.setSeatKnobs({ principal: principal(host), chatId, participantId: seat.id, patch: { talkativeness: 0.9 } });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.talkativeness).toBe(0.9);
  });

  // #1147 — A LATER SEAT IS STILL A SEAT. The stats rebuild's per-character census counts every chat a
  // character holds a `chat_participants` row in, so a character seated into a live room owes its own `+1`
  // at the moment of the join; without it the Analytics/leaderboard read stays 0 until a reconcile. The
  // RE-ADD arm is the other half: a removed character keeps its `leftSeq`-stamped row, so a re-add mints a
  // SECOND participant row for a pair the rebuild still counts ONCE — a presence-blind `+1` here would
  // drift the live census ABOVE the rebuild, which is the same defect with the sign flipped.
  test("a character seated into a live room counts the room, and a re-add after a removal does not count it twice", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(
      makeChatContext(db, {
        getCard: () => Promise.resolve(card("Aria")),
        applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
      }),
      { emit, claimChat: noClaim },
    );

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    const afterJoin = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    expect(afterJoin).toMatchObject({ chats: 1, firstChatAt: FROZEN_AT });

    await roster.removeCharacterFromChat({ principal: principal(host), chatId, characterId });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId });
    const afterReAdd = (await db.select().from(characterStats).where(eq(characterStats.characterId, characterId)))[0];
    // Two participant ERAS, one room — the rebuild's `COUNT(DISTINCT cp.chat_id)` says 1 and so must this.
    expect(afterReAdd?.chats).toBe(1);
    const seats = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.characterId, characterId)));
    expect(seats).toHaveLength(2);
  });
});

// F6 (chat-creation-draft-mode-replacement.md §4.8/§5): a character added while the GREETING WINDOW is still
// open greets, preserving the affordance the deleted draft plane had (a panel-added member's greeting row
// appeared before the first send). After the window closes it is today's silent join, byte-identically. The
// window predicate is the one `setSeededGreeting` refuses on — "no user-role canon row".
describe("add character to chat — the F6 in-window join greeting", () => {
  /** The canon slots, oldest-first, as `[seq, role, content]`. */
  async function canonOf(chatId: ChatId): Promise<[number, string, string | null][]> {
    const rows = await db
      .select({ seq: messages.seq, role: messages.role, content: messageVariants.content })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.seq));
    return rows.map((r) => [r.seq, r.role, r.content]);
  }

  test("WINDOW OPEN: the added character's card greeting lands at the canon head + fans messageCommitted", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "aria", characterId: aria, joinSeq: 0 });
    // The founding greeting — an assistant row, so the window is still OPEN (no USER row).
    await seedMessage(db, chatId, 1, { role: "assistant", characterId: aria, content: "Aria's opener" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Brann", ["Brann strides in."])) }), {
      emit,
      claimChat: noClaim,
    });

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    expect(await canonOf(chatId)).toEqual([
      [1, "assistant", "Aria's opener"],
      [2, "assistant", "Brann strides in."],
    ]);
    // The room learns about the row the same way it learns about any other commit.
    expect(emitted.map((e) => e.type)).toEqual(["chatUpdated", "messageCommitted"]);
    expect(emitted[1]).toMatchObject({
      type: "messageCommitted",
      chatId,
      view: { seq: 2, role: "assistant", characterId: brann, content: "Brann strides in." },
    });
  });

  test("FROZEN (a user row exists): the join stays SILENT — today's no-greet late-add semantics", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Brann", ["Brann strides in."])) }), {
      emit,
      claimChat: noClaim,
    });

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    expect(await canonOf(chatId)).toEqual([[1, "user", "hello"]]);
    expect(emitted.map((e) => e.type)).toEqual(["chatUpdated"]);
  });

  test("a card with NO greeting seeds nothing, even in the window", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Brann")) }), { emit, claimChat: noClaim });

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    expect(await canonOf(chatId)).toEqual([]);
    expect(emitted.map((e) => e.type)).toEqual(["chatUpdated"]);
  });

  test("a re-add greets ONCE — the idempotent present-seat return never re-seeds", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Brann", ["Brann strides in."])) }), {
      emit,
      claimChat: noClaim,
    });

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });
    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    expect(await canonOf(chatId)).toEqual([[1, "assistant", "Brann strides in."]]);
  });

  test("the seeded greeting pushes its OWN canonMessageDelta (the claim replay already ran — this row is post-claim)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const brann = await seedCharacter(db, host, "brann");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const deltas: { ownerId: UserId; characterId: CharacterId | null; assistantTurns: number; characterChats: number }[] = [];
    const ctx = makeChatContext(db, {
      getCard: () => Promise.resolve(card("Brann", ["Brann strides in."])),
      applyStatsDelta: (_stmts, _db, delta): void => {
        deltas.push({
          ownerId: delta.ownerId,
          characterId: delta.characterId,
          assistantTurns: delta.assistantTurns ?? 0,
          characterChats: delta.characterChats ?? 0,
        });
      },
    });
    const roster = createParticipants(ctx, { emit, claimChat: noClaim });

    await roster.addCharacterToChat({ principal: principal(host), chatId, characterId: brann });

    // TWO deltas, in join order: the SEAT census (#1147 — this room now counts for Brann) and then the
    // greeting row's own canon fold. Neither subsumes the other: a silent join still owes the first, and a
    // re-add after a removal owes only the second.
    expect(deltas).toEqual([
      { ownerId: host, characterId: brann, assistantTurns: 0, characterChats: 1 },
      { ownerId: host, characterId: brann, assistantTurns: 1, characterChats: 0 },
    ]);
  });
});

describe("setSeatKnobs — the ONE participantId-keyed AI-seat knob write (D80)", () => {
  test("the host mutes a present character seat; the column + view reflect it, chatUpdated emits", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit, claimChat: noClaim });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: { disabled: true } });
    expect(view.disabled).toBe(true);
    expect(view.displayName).toBe("Aria");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.disabled).toBe(true);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("the host sets a character seat's 0–1 talkativeness in the SAME patch shape", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit, claimChat: noClaim });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: { talkativeness: 0.8 } });
    expect(view.talkativeness).toBe(0.8);
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, characterId));
    expect(row?.talkativeness).toBe(0.8);
  });

  test("an empty patch is an idempotent no-op that still returns the current view (applyToChat re-apply floor)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member", disabled: true });
    const roster = createParticipants(makeChatContext(db, { getCard: () => Promise.resolve(card("Aria")) }), { emit, claimChat: noClaim });

    const view = await roster.setSeatKnobs({ principal: principal(host), chatId, participantId, patch: {} });
    expect(view.disabled).toBe(true); // unchanged
    expect(view.characterId).toBe(characterId);
  });

  test("a non-host member is refused with not_host — no mutation", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const characterId = await seedCharacter(db, host, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const participantId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await expect(roster.setSeatKnobs({ principal: principal(member), chatId, participantId, patch: { disabled: true } })).rejects.toMatchObject({
      code: "not_host",
    });
    expect(emitted).toEqual([]);
  });

  test("a participantId that is not a PRESENT AI seat is refused with participant_not_found", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      .setSeatKnobs({ principal: principal(host), chatId, participantId: castId<ChatParticipantId>("chat_participant_ghost"), patch: { disabled: true } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });

  test("a HUMAN seat carries no arbitration knobs — participant_not_found (AI-driven scope is teeth)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const memberSeatId = await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      .setSeatKnobs({ principal: principal(host), chatId, participantId: memberSeatId, patch: { disabled: true } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.disabled).toBe(false);
    expect(emitted).toEqual([]);
  });
});

// The D16 join-history policy SETTER — the write path the confidentiality mechanism spent its life without
// (the column was reachable only by a manual SQL edit). The round-trip against the real read clamp lives in
// read.int.test.ts's D16 block; these are the setter's own gates + persistence.
describe("setMemberHistoryVisibility — the host's per-member join-history write (D16)", () => {
  test("the host restricts a member to from-join: the column flips + chatUpdated is emitted", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinSeq: 4 });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
    // The restriction is a READ policy, not a re-join: the member's join point is untouched.
    expect(row?.joinSeq).toBe(4);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("re-setting the value the row already carries is a no-op (idempotent)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinHistoryVisibility: "from-join" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
  });

  test("a plain MEMBER cannot set it — not even on themselves (the confidentiality policy is the host's)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", joinHistoryVisibility: "from-join" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setMemberHistoryVisibility({ principal: principal(member), chatId, userId: member, visibility: "full" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    // A clamped member cannot self-unclamp — the row is untouched and nothing was announced.
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.joinHistoryVisibility).toBe("from-join");
    expect(emitted).toEqual([]);
  });

  // A CHARACTER seat carries a NULL userId (and no reader floor at all — its joinSeq/leftSeq are the
  // WITNESSING interval, a different axis), so the userId key can never resolve one. Pinned with the
  // character's OWN participant id cast to a UserId: even that hand-forged key finds nothing.
  test("a character seat is unreachable through the userId key", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const characterId = await seedCharacter(db, host, "Aria");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const seatId = await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      // A participant id is forged through castId into the userId slot; no assertion cast is involved here.
      .setMemberHistoryVisibility({ principal: principal(host), chatId, userId: castId<UserId>(seatId), visibility: "from-join" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.id, seatId));
    expect(row?.joinHistoryVisibility).toBe("full");
    expect(emitted).toEqual([]);
  });

  test("a member who has LEFT is not a target (present-only roster)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member", leftSeq: 2 });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster
      .setMemberHistoryVisibility({ principal: principal(host), chatId, userId: member, visibility: "from-join" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
  });
});

describe("kick — host removes a member", () => {
  test("the member's leftSeq is stamped + a kicked notification is delivered", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit, claimChat: noClaim },
    );

    await roster.kick({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, member));
    expect(row?.leftSeq).not.toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([{ type: "kicked", recipientUserId: member, chatId }]);
  });
});

describe("selfLeave — a sole-host self-leave archives the room", () => {
  test("a host leaving with no successor archives (never refused)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.selfLeave({ principal: principal(host), chatId });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.archived).toBe(true);
    const [p] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(p?.leftSeq).not.toBeNull();
  });
});

describe("nominateHostHandoff — host nominates a present member (step 1)", () => {
  test("the host nominates a member: pendingHostUserId is set + the nominee is notified", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit, claimChat: noClaim },
    );

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    // The nomination carries its DISCLOSURE (#1762) — an offer-less nomination gives nothing, and says so.
    expect(notes).toEqual([
      { type: "handoff-nominated", recipientUserId: member, chatId, offer: { characters: 0, worldBooks: 0, regexScripts: 0, gmPreset: false } },
    ]);
  });

  test("a plain member nominating is refused with not_host (no nomination written)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const other = await seedUser(db, castId<Handle>("other"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "o", userId: other, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.nominateHostHandoff({ principal: principal(member), chatId, userId: other }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });

  test("nominating a non-member is rejected leak-free (not found); no nomination written", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: stranger }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatNotFoundError);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([]);
  });
});

describe("acceptHostHandoff — the nominee self-action (step 2)", () => {
  test("completion atomically appends once and clears its marker even when a real live listener throws", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "atomic-handoff");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    let eventNumber = 0;
    const bus = createChatBus({
      db,
      now: () => FROZEN_AT,
      newEventId: () => {
        eventNumber += 1;
        return castId<ChatEventId>(`chat_event_handoff_${eventNumber}`);
      },
    });
    const emitThroughRealBus = async (event: DurableChatBusEvent, claimStatement?: BatchStmt): Promise<boolean> => {
      const logged = claimStatement === undefined ? await bus.emit(event) : await bus.emitAfterClaim(event, claimStatement);
      if (logged === false) {
        return true;
      }
      if (logged === null) {
        return false;
      }
      publishChatEvent(logged);
      return true;
    };
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { emitNotification: recordingEmit(notes) }), {
      emit: emitThroughRealBus,
      claimChat: noClaim,
    });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    const before = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    const unsubscribe = subscribeAllChatEvents(() => {
      throw new Error("listener exploded after durable handoff append");
    });

    try {
      await expect(roster.acceptHostHandoff({ principal: principal(member), chatId })).resolves.toBeUndefined();
    } finally {
      unsubscribe();
    }

    const after = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.type).toBe("chatUpdated");
    expect(await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId))).toHaveLength(0);
  });

  test("two retries that loaded one completion marker append exactly one durable event", async () => {
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "claim-first-handoff");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "host" });
    const sourceCharacterId = mintTypeId(ID_PREFIX.character);
    const characterId = mintTypeId(ID_PREFIX.character);
    await db.insert(chatHandoffResumptions).values({
      chatId,
      acceptedByUserId: member,
      actorRekeys: [{ sourceCharacterId, characterId }],
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    });

    let arrivals = 0;
    let release!: () => void;
    const bothLoaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    // FABRICATION-OK: minimal RPG handoff fixture — only handoffRekeyActors is reached by this retry barrier.
    const rpg = {
      handoffRekeyActors: async (): Promise<void> => {
        arrivals += 1;
        if (arrivals === 2) {
          release();
        }
        await bothLoaded;
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    let eventNumber = 0;
    const bus = createChatBus({
      db,
      now: () => FROZEN_AT,
      newEventId: () => {
        eventNumber += 1;
        return castId<ChatEventId>(`chat_event_claim_first_${eventNumber}`);
      },
    });
    const emitAtomic = async (event: DurableChatBusEvent, claimStatement?: BatchStmt): Promise<boolean> => {
      const logged = claimStatement === undefined ? await bus.emit(event) : await bus.emitAfterClaim(event, claimStatement);
      return logged !== null;
    };
    const roster = createParticipants(makeChatContext(db, { rpg }), { emit: emitAtomic, claimChat: noClaim });

    await Promise.all([roster.acceptHostHandoff({ principal: principal(member), chatId }), roster.acceptHostHandoff({ principal: principal(member), chatId })]);

    expect(arrivals).toBe(2);
    expect(await db.select().from(chatHandoffResumptions).where(eq(chatHandoffResumptions.chatId, chatId))).toHaveLength(0);
    const events = await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ type: "chatUpdated", chatId });
  });

  test("the nominee accepts: roles swap, the nomination clears, the old host is notified", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(
      makeChatContext(db, {
        emitNotification: recordingEmit(notes),
      }),
      { emit, claimChat: noClaim },
    );
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    expect(notes).toEqual([
      {
        type: "handoff-accepted",
        recipientUserId: host,
        chatId,
        newHostHandle: principal(member).handle,
      },
    ]);
  });

  test("a non-nominee accept is refused with not_turn_owner (the self-promotion hole stays closed)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const attacker = await seedUser(db, castId<Handle>("attacker"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "x", userId: attacker, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;

    const err = await roster.acceptHostHandoff({ principal: principal(attacker), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
    // Roles untouched; the nomination still stands for the real nominee; nothing emitted.
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("host");
    expect(rows.find((r) => r.userId === attacker)?.role).toBe("member");
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBe(member);
    expect(emitted).toEqual([]);
  });

  test("accept with no pending nomination is refused with not_turn_owner", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.acceptHostHandoff({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_turn_owner");
  });

  // D64 (F4/PD-21 ruling): host authority MOVES to a non-card-owner — the handoff SUCCEEDS, transferring the
  // room + history but DROPPING the outgoing host's character seats (leaving the humans; the new owner adds
  // their own). Driven at the verb layer with seeded non-owner principals (multi-human membership is unwired).
  test("handoff to a non-owner SUCCEEDS: the outgoing host's characters are dropped, the owner's kept, humans remain", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    // Single-owner characters (D28): aria belongs to the OUTGOING host, bella to the NOMINEE. After the handoff the
    // new host (member) resolves bella but NOT aria → aria's seat drops, bella's stays.
    const aria = await seedCharacter(db, host, "aria");
    const bella = await seedCharacter(db, member, "bella");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "ca", characterId: aria, role: "member" });
    await seedParticipant(db, { chatId, key: "cb", characterId: bella, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(
      makeChatContext(db, {
        getCard: ownedCard(),
        emitNotification: recordingEmit(notes),
        bumpStatsCanonVersion: (batch, opDb, ownerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId),
      }),
      { emit, claimChat: noClaim },
    );
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    emitted.length = 0;
    notes.length = 0;

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    // Host authority transferred; both humans remain present.
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === host)?.leftSeq).toBeNull();
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    expect(rows.find((r) => r.userId === member)?.leftSeq).toBeNull();
    // The outgoing host's character seat is DROPPED (leftSeq stamped); the new host's is KEPT present.
    expect(rows.find((r) => r.characterId === aria)?.leftSeq).not.toBeNull();
    expect(rows.find((r) => r.characterId === bella)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
    // The outgoing owner is fenced once for nomination's recency write and once for the ownership transfer;
    // the incoming owner is fenced by the transfer itself.
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(2);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, member)))[0]?.version).toBe(1);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  // F1 (stickler 2026-08-03) — the rpg heal is an INJECTED op returning UNEXECUTED statements, and its whole
  // point is atomicity: it must ride the accept's own batch, so a crash can never promote a host while leaving
  // the game's GM voice pointed at the previous host's private preset. Chat's half is what this proves — the op
  // is asked about the NOMINEE (the incoming authority, never the caller-as-old-host) and its statements commit
  // with the swap. The rpg-side verdict lives in `tests/server/domain/rpg/chat-ops/handoff-heal.int.test.ts`;
  // the two are joined composed-real in `tests/server/entry/compose/rpg.int.test.ts`.
  test("the injected rpg handoff-heal statements are folded into the swap batch, asked about the NOMINEE", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const asked: { chatId: ChatId; newHostUserId: string; copyGmPreset: boolean; cardCopies: number }[] = [];
    // The returned statement stands in for the rpg write (chat commits it blind); `chats.title` is the observable.
    // FABRICATION-OK: minimal ChatRpgOps stub — the accept reaches ONLY `handoffHealStatements`.
    const rpg = {
      handoffHealStatements: (args: { chatId: ChatId; newHostUserId: UserId; copyGmPreset: boolean; cardCopies: readonly unknown[] }): Promise<unknown[]> => {
        asked.push({ chatId: args.chatId, newHostUserId: args.newHostUserId, copyGmPreset: args.copyGmPreset, cardCopies: args.cardCopies.length });
        return Promise.resolve([db.update(chats).set({ title: "healed" }).where(eq(chats.id, args.chatId))]);
      },
    } as unknown as NonNullable<NonNullable<Parameters<typeof makeChatContext>[1]>["rpg"]>;
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { rpg, emitNotification: recordingEmit(notes) }), { emit, claimChat: noClaim });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    // The no-offer accept passes the offer arms OFF — the byte-identity pin for the pre-offer heal.
    expect(asked).toEqual([{ chatId, newHostUserId: member, copyGmPreset: false, cardCopies: 0 }]);
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.title).toBe("healed");
    expect(chatRow?.pendingHostUserId).toBeNull();
  });

  // F2 (stickler 2026-08-03) — the D51 anchor is the room's stable `{{user}}` POV, and `chats.anchorPersonaId`
  // is resolved under the HOST's principal (owner-scoped `persona.get`). A handoff moves the host, so an anchor
  // the NEW host cannot read becomes a dead id: the POV silently falls through to the speaker's active persona
  // while the knob keeps serving an unreadable id (`ChatDetail.anchorPersonaId`) and `exportChat` still reads
  // its NAME by id. The heal is the `resolveForkGmPreset` twin — null it IN THE SWAP BATCH, conditional on
  // readability, so the null-anchor→active fallback takes over honestly.
  test("an anchor persona the new host cannot read is NULLED in the swap batch", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const anchor = await seedPersona(db, host, "hostpov");
    const chatId = await seedChat(db, "a", { anchorPersonaId: anchor });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit, claimChat: noClaim });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.anchorPersonaId).toBeNull();
    // The heal rides the SAME batch as the swap — never a second write that a crash could skip.
    expect(chatRow?.pendingHostUserId).toBeNull();
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
  });

  test("an anchor persona the NOMINEE owns survives the handoff (the POV is still readable)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    // The room was already anchored on the nominee's own persona (the verb permits any present human's) —
    // the new host resolves it, so healing it would DESTROY a live pin. Conditional, exactly like the fork gate.
    const anchor = await seedPersona(db, member, "memberpov");
    const chatId = await seedChat(db, "a", { anchorPersonaId: anchor });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { emitNotification: recordingEmit(notes) }), { emit, claimChat: noClaim });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.anchorPersonaId).toBe(anchor);
  });

  test("a nominee who owns EVERY seated character keeps every character seat on handoff", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    // The nominee owns the seated character → the new host resolves it, so no seat drops.
    const characterId = await seedCharacter(db, member, "aria");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedParticipant(db, { chatId, key: "c", characterId, role: "member" });
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { getCard: ownedCard(), emitNotification: recordingEmit(notes) }), { emit, claimChat: noClaim });
    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });

    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(rows.find((r) => r.userId === host)?.role).toBe("member");
    expect(rows.find((r) => r.userId === member)?.role).toBe("host");
    // The nominee-owned character seat is retained (present).
    expect(rows.find((r) => r.characterId === characterId)?.leftSeq).toBeNull();
    const [chatRow] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(chatRow?.pendingHostUserId).toBeNull();
  });
});

describe("audit wiring — the membership/config mutations write best-effort audit rows", () => {
  interface RecordedAudit {
    readonly entry: AuditEntry;
    readonly at: number;
  }

  function auditRecorder(rows: RecordedAudit[]): (entry: AuditEntry, at: number) => Promise<void> {
    return (entry, at) => {
      rows.push({ entry, at });
      return Promise.resolve();
    };
  }

  test("kick writes chat.kick with the target AFTER the transition committed", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), {
      emit,
      claimChat: noClaim,
    });

    await roster.kick({ principal: principal(host), chatId, userId: member });

    expect(rows).toEqual([
      {
        entry: {
          actorUserId: host,
          action: "chat.kick",
          entityType: "chat",
          entityId: chatId,
          metadata: { targetUserId: member },
        },
        at: expect.any(Number),
      },
    ]);
  });

  test("an idempotent no-op kick (target not present) writes NO audit row", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const ghost = await seedUser(db, castId<Handle>("ghost"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createParticipants(makeChatContext(db, { audit: auditRecorder(rows) }), { emit, claimChat: noClaim });

    await roster.kick({ principal: principal(host), chatId, userId: ghost });

    expect(rows).toEqual([]);
  });

  test("nominate + accept write the two handoff rows (nominee / previous host)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const notes: NotificationEvent[] = [];
    const roster = createParticipants(makeChatContext(db, { emitNotification: recordingEmit(notes), audit: auditRecorder(rows) }), {
      emit,
      claimChat: noClaim,
    });

    await roster.nominateHostHandoff({ principal: principal(host), chatId, userId: member });
    await roster.acceptHostHandoff({ principal: principal(member), chatId });

    expect(rows.map((r) => r.entry.action)).toEqual(["chat.nominateHostHandoff"]);
    // The OFFER flags ride the nominate row: a no-offer nomination records give-nothing, in the log, at the
    // moment consent was (not) given — the one place a later dispute can read it.
    expect(rows.at(0)?.entry.metadata).toEqual({ nomineeUserId: member, offerCharacters: false, offerGmPreset: false });
    // The heal + copy FLAGS/COUNTS ride the accept row (F1/F2 + the copy) — an un-anchored, non-game room with
    // no offer heals nothing and copies nothing.
    const accepted = (await db.select().from(auditLogs).where(eq(auditLogs.action, "chat.acceptHostHandoff")))[0];
    expect(accepted?.metadata).toEqual({
      previousHostUserId: host,
      healedAnchorPersona: false,
      healedGmPreset: false,
      copiedCards: 0,
      droppedSeats: 0,
    });
    expect(accepted?.actorUserId).toBe(member);
  });

  test("setGroupConfig logs output/policy; setRoomOverrides logs FIELD LABELS only (never bodies)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const rows: RecordedAudit[] = [];
    const roster = createParticipants(makeChatContext(db, { audit: auditRecorder(rows) }), { emit, claimChat: noClaim });

    await roster.setGroupConfig({
      principal: principal(host),
      chatId,
      config: { output: "per-speaker", policy: "natural" },
    });
    await roster.setRoomOverrides({
      principal: principal(host),
      chatId,
      overrides: { scenario: "a SECRET scenario body" },
    });

    expect(rows.at(0)?.entry.action).toBe("chat.setGroupConfig");
    expect(rows.at(0)?.entry.metadata).toEqual({ output: "per-speaker", policy: "natural" });
    expect(rows.at(1)?.entry.action).toBe("chat.setRoomOverrides");
    // The override BODY must never reach the log row — labels only (Part III §9).
    expect(rows.at(1)?.entry.metadata).toEqual({ fields: ["scenario"] });
    expect(JSON.stringify(rows.at(1)?.entry)).not.toContain("SECRET");
  });

  test("a refused write (member calling a host verb) writes NO audit row", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const rows: RecordedAudit[] = [];
    const roster = createParticipants(makeChatContext(db, { audit: auditRecorder(rows) }), { emit, claimChat: noClaim });

    await roster.kick({ principal: principal(member), chatId, userId: host }).catch((e: unknown) => e);

    expect(rows).toEqual([]);
  });
});

describe("setParticipantActivePersona — the chat-domain write persona.setActivePersona calls (PD-120)", () => {
  test("flips a present human's activePersonaId + emits personaSwitched with from/to", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBe(personaId);
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: null, to: personaId }]);
  });

  test("reports the prior persona as `from` on a second switch", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const first = await seedPersona(db, host, "a");
    const second = await seedPersona(db, host, "b");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: first,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: second });

    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: first, to: second }]);
  });

  test("clearing back to null is a valid switch (to: null)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const personaId = await seedPersona(db, host, "a");
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: personaId,
    });

    await setParticipantActivePersona(db, emit, { chatId, targetUserId: host, personaId: null });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, host));
    expect(row?.activePersonaId).toBeNull();
    expect(emitted).toEqual([{ type: "personaSwitched", chatId, from: personaId, to: null }]);
  });

  test("a target that is not a PRESENT participant is refused with participant_not_found — no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const personaId = await seedPersona(db, host, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: stranger,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });

  test("a LEFT participant (leftSeq set) is treated as not-present — refused, no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const former = await seedUser(db, castId<Handle>("former"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "f", userId: former, role: "member", leftSeq: 3 });
    const personaId = await seedPersona(db, former, "a");

    const err = await setParticipantActivePersona(db, emit, {
      chatId,
      targetUserId: former,
      personaId,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("participant_not_found");
    expect(emitted).toEqual([]);
  });
});

// ── D121-E: the display-tier room OPTION (owner ruling 2026-08-02) ──────────────────────────────────────
// A HOST option in the D121-B grammar: default off, host-only, and RENDER-only — it governs what the room
// LOOKS like, never what the model sees or what anyone types. The read-back arm matters as much as the
// write: `ChatDetail.hostDisplayScripts` is what the host's switch and the viewer's render tier both read.
describe("setHostDisplayScripts — the host's display-tier broadcast option", () => {
  test("defaults OFF, and the host can turn it on (merging, never nuking, the sibling sub-blobs)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    // Seed a sibling sub-blob first — the write must not eat it.
    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: roomOverridesSchema.parse({ scenario: "keep me" }) });
    emitted.length = 0;

    expect(await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true })).toBe(true);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    const metadata = row?.metadata as { hostDisplayScripts?: boolean; roomOverrides?: { scenario?: string } };
    expect(metadata.hostDisplayScripts).toBe(true);
    expect(metadata.roomOverrides?.scenario).toBe("keep me");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  test("turning it back OFF is a real write (absent must never be read as ON)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: true });
    expect(await roster.setHostDisplayScripts({ principal: principal(host), chatId, enabled: false })).toBe(false);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect((row?.metadata as { hostDisplayScripts?: boolean }).hostDisplayScripts).toBe(false);
  });

  test("a plain MEMBER is refused with not_host — no write, no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setHostDisplayScripts({ principal: principal(member), chatId, enabled: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    // A never-written metadata column is NULL, not an empty object — either way the option is absent.
    expect((row?.metadata as { hostDisplayScripts?: boolean } | null)?.hostDisplayScripts).toBeUndefined();
    expect(emitted).toEqual([]);
  });
});

// ── B1: the per-room offer-choices posture (RULED F2) ──────────────────────────────────────────────────
// The display-scripts shape one sub-blob over, with ONE law that differs and is the reason this verb is
// host-gated at all: it reaches the PROMPT. The tri-state is the other difference — absent means INHERIT the
// host's per-user default, so `false` and never-written are DIFFERENT rows, and `ChatDetail.offerChoices`
// must carry that difference rather than collapsing it to a boolean.
describe("setOfferChoices — the per-room offer-choices posture", () => {
  test("the host can pin it ON, merging rather than nuking the sibling sub-blobs", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: roomOverridesSchema.parse({ scenario: "keep me" }) });
    emitted.length = 0;

    expect(await roster.setOfferChoices({ principal: principal(host), chatId, enabled: true })).toBe(true);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    const metadata = row?.metadata as { offerChoices?: boolean; roomOverrides?: { scenario?: string } };
    expect(metadata.offerChoices).toBe(true);
    expect(metadata.roomOverrides?.scenario).toBe("keep me");
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
  });

  // THE TRI-STATE, which is the whole point of the knob: pinning OFF is a stored `false`, distinct from a
  // room that was never written (which inherits). A `=== true` projection would erase that distinction and
  // silently turn "this room, specifically, is off" into "this room follows me", which is the opposite.
  test("pinning it OFF stores an explicit false — never confused with a never-written room", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setOfferChoices({ principal: principal(host), chatId, enabled: true });
    expect(await roster.setOfferChoices({ principal: principal(host), chatId, enabled: false })).toBe(false);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect((row?.metadata as { offerChoices?: boolean }).offerChoices).toBe(false);
  });

  test("a plain MEMBER is refused with not_host — no write, no emit (this key steers the room's model)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    const err = await roster.setOfferChoices({ principal: principal(member), chatId, enabled: true }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect((row?.metadata as { offerChoices?: boolean } | null)?.offerChoices).toBeUndefined();
    expect(emitted).toEqual([]);
  });
});

// ── B7: the two reaction toggles (`setCharactersCanReact` + `setReactionsEnabled`) — the setOfferChoices
// twins, byte-for-byte: same merge-write, same tri-state (absent = INHERIT the host's per-user default),
// same host gate. Their ENFORCEMENT (a resolved-OFF room refusing toggleReaction / answering
// empty-with-verdict / silencing the react tool) is the reactions verb suite's; this describe proves the
// WRITE half — the key lands merged, the tri-state survives, and a member cannot reach either knob.
describe("setCharactersCanReact / setReactionsEnabled — the B7 reaction postures", () => {
  test("the host pins both keys, MERGING beside the sibling sub-blobs, one chatUpdated each", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    await roster.setRoomOverrides({ principal: principal(host), chatId, overrides: roomOverridesSchema.parse({ scenario: "keep me" }) });
    emitted.length = 0;

    expect(await roster.setCharactersCanReact({ principal: principal(host), chatId, enabled: true })).toBe(true);
    expect(await roster.setReactionsEnabled({ principal: principal(host), chatId, enabled: false })).toBe(false);

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    const metadata = row?.metadata as { charactersCanReact?: boolean; reactionsEnabled?: boolean; roomOverrides?: { scenario?: string } };
    expect(metadata.charactersCanReact).toBe(true);
    // The tri-state's teeth: an explicit `false` is a STORED value — "this room, specifically, is off" —
    // never confused with a never-written room that follows the host's default.
    expect(metadata.reactionsEnabled).toBe(false);
    expect(metadata.roomOverrides?.scenario).toBe("keep me");
    expect(emitted).toEqual([
      { type: "chatUpdated", chatId },
      { type: "chatUpdated", chatId },
    ]);
  });

  test("a plain MEMBER is refused with not_host on BOTH knobs — no write, no emit", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const roster = createParticipants(makeChatContext(db), { emit, claimChat: noClaim });

    // One knob reaches the PROMPT (the react-tool attach), the other every member's write path — both are
    // room-wide behavior, so host is the floor for each.
    const reactErr = await roster.setCharactersCanReact({ principal: principal(member), chatId, enabled: true }).catch((e: unknown) => e);
    expect((reactErr as ChatOperationError).code).toBe("not_host");
    const planeErr = await roster.setReactionsEnabled({ principal: principal(member), chatId, enabled: false }).catch((e: unknown) => e);
    expect((planeErr as ChatOperationError).code).toBe("not_host");

    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    const metadata = row?.metadata as { charactersCanReact?: boolean; reactionsEnabled?: boolean } | null;
    expect(metadata?.charactersCanReact).toBeUndefined();
    expect(metadata?.reactionsEnabled).toBeUndefined();
    expect(emitted).toEqual([]);
  });
});
