import type { ChatBusEvent, ChatDeltaEvent, ChatIdentity } from "@orb/contracts/chat";
import { buildIdentityNameContext, CHAT_BUS_EVENT_TYPES, CHAT_WARNING_CODES, isChatBusEventType, LIVE_ONLY_CHAT_EVENT_TYPES } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { PersonaId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { resolveRowMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

// Type-level pins (D26 slot-has-no-content / view-has-content, the ChatBusEvent secret-unrepresentable
// allowlist, and the InviteView no-token-leak pin) live in `index.test-d.ts` (core/Spine-Testing.md §1). This
// file keeps the front-door's own residual identity: the bus/producers surface (bus.ts and producers.ts are
// NOT test-presence-flagged seams) plus the front-door re-export integrity.

// ── Sample ids (minted/cast — no pasted random-looking literals; noSecrets) ───
const SAMPLE_MESSAGE_ID = mintTypeId(ID_PREFIX.message);
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);

test("ChatDeltaEvent carries text and reasoning chunks", () => {
  const textDelta: ChatDeltaEvent = { chatId: SAMPLE_CHAT_ID, kind: "text", text: "hi" };
  const reasoningDelta: ChatDeltaEvent = {
    chatId: SAMPLE_CHAT_ID,
    kind: "reasoning",
    text: "thinking",
  };
  expect(textDelta.kind).toBe("text");
  expect(reasoningDelta.kind).toBe("reasoning");
  // The D16 classification anchor is on the BUS member, NOT on this chunk — `ChatDeltaEvent` is also the
  // provider-level payload every backend runner constructs, and a provider cannot know a `messages.seq`
  // (it would have to be fabricated). Pinned here so the anchor never migrates down onto the chunk.
  expect("slotSeq" in textDelta).toBe(false);
});

test("the `delta` bus member carries its target slot's seq — the D16 anchor that keeps clamped members streaming", () => {
  // Without this, a raw-text delta is unclassifiable and the clamp must withhold it from EVERY `from-join`
  // member (the DB default) — which is every invited human in a room with prior canon.
  const streamed: ChatBusEvent = {
    type: "delta",
    chatId: SAMPLE_CHAT_ID,
    slotSeq: 7,
    delta: { chatId: SAMPLE_CHAT_ID, kind: "text", text: "hi" },
  };
  // A plain scalar, so the bus-payload allowlist (no unknown/Record/index field) is untouched.
  expect(streamed.type === "delta" ? streamed.slotSeq : null).toBe(7);
  expect(JSON.parse(JSON.stringify(streamed))).toEqual(streamed);
});

test("CHAT_BUS_EVENT_TYPES is the exhaustive discriminator set incl. the embedded WI events", () => {
  // The guard recognizes a chat-owned event AND an embedded world-info event; rejects an unknown.
  expect(isChatBusEventType("messageCommitted")).toBe(true);
  expect(isChatBusEventType("wiBookAttached")).toBe(true);
  expect(isChatBusEventType("credentialLeaked")).toBe(false);
  expect(isChatBusEventType("worldInfoActivated")).toBe(true);
  expect(isChatBusEventType("chatOpened")).toBe(true);
  expect(isChatBusEventType("warning")).toBe(true);
  expect(isChatBusEventType("messageHidden")).toBe(true);
  expect(isChatBusEventType("turnAccepted")).toBe(true);
  expect(isChatBusEventType("roomEntityChanged")).toBe(true);
  expect(isChatBusEventType("memoryRecall")).toBe(true);
  expect(isChatBusEventType("reactionsChanged")).toBe(true);
  // 24 chat-owned (incl. the D45 `warning`, the PD-86 `messageHidden`, the pre-arbitration `turnAccepted`,
  // the entity→room bridge's `roomEntityChanged`, the #313 `memoryRecall`, the B6 `reactionsChanged`)
  // + 6 WI variants.
  expect(Object.keys(CHAT_BUS_EVENT_TYPES)).toHaveLength(30);
});

test("memory rerank degradation is a typed durable warning code", () => {
  expect(CHAT_WARNING_CODES).toContain("memory_rerank_unavailable");
  const warning: ChatBusEvent = { type: "warning", chatId: SAMPLE_CHAT_ID, code: "memory_rerank_unavailable" };
  expect(warning).toEqual({ type: "warning", chatId: SAMPLE_CHAT_ID, code: "memory_rerank_unavailable" });
});

// THE LIVE-ONLY LANE (entity→room bridge §3.4). The two subsets must PARTITION the union: a member that is
// in neither can never be fanned, and one in both is a contradiction the emit surfaces would resolve
// arbitrarily. `DurableChatBusEvent` is what the db CHECK derives from, so a drift here is a row shape the
// schema would reject at runtime.
test("LIVE_ONLY_CHAT_EVENT_TYPES partitions the union — durable ∪ live-only = every member, ∩ = ∅", () => {
  expect([...LIVE_ONLY_CHAT_EVENT_TYPES]).toEqual(["roomEntityChanged", "chatDeleted", "memoryRecall"]);
  const all = Object.keys(CHAT_BUS_EVENT_TYPES);
  const liveOnly = new Set<string>(LIVE_ONLY_CHAT_EVENT_TYPES);
  // Every live-only member is a REAL union member (a typo'd tuple entry would silently narrow nothing).
  for (const type of liveOnly) {
    expect(all).toContain(type);
  }
  expect(all.filter((t) => !liveOnly.has(t))).toHaveLength(all.length - liveOnly.size);
});

test("a representative ChatBusEvent round-trips its public, secret-free shape", () => {
  const committed: ChatBusEvent = {
    type: "messageCommitted",
    chatId: SAMPLE_CHAT_ID,
    messageId: SAMPLE_MESSAGE_ID,
  };
  const turnStarted: ChatBusEvent = {
    type: "turnStarted",
    chatId: SAMPLE_CHAT_ID,
    intent: "send",
    api: "chat-completions",
    provider: castId<ProviderId>("custom-openai"),
    model: "claude-sonnet",
    speakerCharacterId: null,
    targetMessageId: null,
  };
  expect(committed.type).toBe("messageCommitted");
  expect(turnStarted.type).toBe("turnStarted");
  // turnStarted carries no caller id (D19 — attribution is on the turn path, never the public bus).
  expect("callerUserId" in turnStarted).toBe(false);
});

test("chatOpened + worldInfoActivated round-trip their id-only shapes (event-bus ST parity, D50)", () => {
  const opened: ChatBusEvent = { type: "chatOpened", chatId: SAMPLE_CHAT_ID };
  const wiFired: ChatBusEvent = {
    type: "worldInfoActivated",
    chatId: SAMPLE_CHAT_ID,
    entryIds: [mintTypeId(ID_PREFIX.worldEntry)],
    automationDepth: 0,
  };
  expect(opened.type).toBe("chatOpened");
  expect(wiFired.entryIds).toHaveLength(1);
});

// The compile-time pin that credentials / secrets / caller id are UNREPRESENTABLE in ChatBusEvent moved to
// index.test-d.ts (bus-payload allowlist). The runtime secret-strip backstop lives on messageSlotSchema above
// (ChatBusEvent itself is schema-less — never zod-parsed), and the no-caller-id check sits in the
// representative-round-trip test above.

// ── §6 parity keystone (Chat-Macro-Resolution.md §6 / task #59 P1) ──────────────────────────────────
// The doctrine's ONE shared fixture: anchor(pinned)=Nyx, active=Zara, a row stamped personaId=Mara,
// content "{{user}} waves". Server ASSEMBLE (`engine/pipeline.ts`'s `toShapeCanon`, via `engine.ts`'s
// `buildIdentityNameContext` call over the loaded cast producer) and client DISPLAY
// (`message-list-surface.tsx`'s merge, via the SAME projection over the wire cast) each derive
// their lookup maps from the identical `ChatIdentity[]` ARRAY shape (D137) — this is the ONE place both
// "sides" import the SAME projection, so a fixture here proves the map-construction step itself can't
// diverge (the atom-level parity — resolveRowMacros itself — is pinned separately in
// tests/kit/macro/row-macros.test.ts; the projection's own routing/totality is pinned in
// producers.contract.test.ts). Two independently-built map pairs from the SAME array, fed through
// `resolveRowMacros`, must both resolve to Mara — never Zara (active) nor Nyx (the pinned anchor, a CARD-
// only axis — never a history row's subject).
test("§6 parity keystone: server-build and client-build of the SAME identities array both resolve a row's {{user}} to Mara, never the active nor the pinned anchor", () => {
  const maraId = castId<PersonaId>(mintTypeId(ID_PREFIX.persona));
  const identities: ChatIdentity[] = [{ kind: "persona", id: maraId, name: "Mara", description: "a wandering scholar", avatarHash: null }];

  // "server ASSEMBLE"-side build — mirrors engine.ts's `buildIdentityNameContext(cast)` call.
  const { characterNamesById: serverCharacterNamesById, personaNamesById: serverPersonaNamesById } = buildIdentityNameContext(identities);
  // "client DISPLAY"-side build — mirrors message-list-surface.tsx's merge-then-project call (a fresh array
  // copy stands in for "the cast arrived over the wire", never the SAME in-memory reference).
  const { characterNamesById: clientCharacterNamesById, personaNamesById: clientPersonaNamesById } = buildIdentityNameContext([...identities]);

  const rowStamps = { characterId: null, personaId: maraId };
  const serverOut = resolveRowMacros("{{user}} waves", rowStamps, {
    characterNamesById: serverCharacterNamesById,
    personaNamesById: serverPersonaNamesById,
    fallbackPersonaName: "Nyx", // the ANCHOR fallback — must lose to the row's own Mara stamp.
  });
  const clientOut = resolveRowMacros("{{user}} waves", rowStamps, {
    characterNamesById: clientCharacterNamesById,
    personaNamesById: clientPersonaNamesById,
    fallbackPersonaName: "Nyx",
  });
  expect(serverOut).toBe("Mara waves");
  expect(clientOut).toBe("Mara waves");
  expect(serverOut).toBe(clientOut);

  // …and a NULL stamp (no producer entry the row itself owns) falls to the chat ANCHOR on BOTH sides — a
  // chat invariant, so server ASSEMBLE == client DISPLAY (ruling A / the design principle: never the reader).
  const nullStampServer = resolveRowMacros(
    "{{user}} waves",
    { characterId: null, personaId: null },
    {
      characterNamesById: serverCharacterNamesById,
      personaNamesById: serverPersonaNamesById,
      fallbackPersonaName: "Nyx",
    },
  );
  const nullStampClient = resolveRowMacros(
    "{{user}} waves",
    { characterId: null, personaId: null },
    {
      characterNamesById: clientCharacterNamesById,
      personaNamesById: clientPersonaNamesById,
      fallbackPersonaName: "Nyx",
    },
  );
  expect(nullStampServer).toBe("Nyx waves");
  expect(nullStampClient).toBe("Nyx waves");
});
