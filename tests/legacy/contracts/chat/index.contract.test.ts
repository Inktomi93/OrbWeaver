import type { ChatIdentity } from "@orb/contracts/chat";
import { buildIdentityNameContext, CHAT_BUS_EVENT_TYPES, LIVE_ONLY_CHAT_EVENT_TYPES } from "@orb/contracts/chat";
import type { PersonaId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { resolveRowMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// Type-level pins (D26 slot-has-no-content / view-has-content, the ChatBusEvent secret-unrepresentable
// allowlist, the delta anchor, the warning codes and the InviteView no-token-leak pin) live in `index.test-d.ts`
// (docs/law/Spine-Testing.md §1). This file keeps the front-door's own residual identity: the bus/producers
// surface (bus.ts and producers.ts are NOT test-presence-flagged seams) plus the front-door re-export integrity.

test("CHAT_BUS_EVENT_TYPES is the exhaustive discriminator set incl. the embedded WI events", () => {
  // Membership is the registry itself: a chat-owned event, an embedded world-info event, and no unknown type.
  const known = (type: string): boolean => Object.hasOwn(CHAT_BUS_EVENT_TYPES, type);
  for (const type of [
    "messageCommitted",
    "wiBookAttached",
    "worldInfoActivated",
    "chatOpened",
    "warning",
    "messageHidden",
    "turnAccepted",
    "roomEntityChanged",
    "memoryRecall",
    "reactionsChanged",
  ]) {
    expect(known(type)).toBe(true);
  }
  expect(known("credentialLeaked")).toBe(false);
  // 24 chat-owned (incl. the D45 `warning`, the `messageHidden`, the pre-arbitration `turnAccepted`,
  // the entity→room bridge's `roomEntityChanged`, the #313 `memoryRecall`, the B6 `reactionsChanged`)
  // + 6 WI variants.
  expect(Object.keys(CHAT_BUS_EVENT_TYPES)).toHaveLength(30);
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

// ── §6 parity keystone (Chat-Macro-Resolution.md §6 / task #59 P1) ──────────────────────────────────
// The doctrine's ONE shared fixture: anchor(pinned)=Nyx, active=Zara, a row stamped personaId=Mira,
// content "{{user}} waves". Server ASSEMBLE (`engine/pipeline.ts`'s `toShapeCanon`, via `engine.ts`'s
// `buildIdentityNameContext` call over the loaded cast producer) and client DISPLAY
// (`message-list-surface.tsx`'s merge, via the SAME projection over the wire cast) both call this ONE
// projection over the identical `ChatIdentity[]` shape (D137), so a single call here IS both sides: the
// projection feeds `resolveRowMacros`, and that composition must resolve to Mira — never Zara (active) nor
// Nyx (the pinned anchor, a CARD-only axis — never a history row's subject). The atom-level parity —
// `resolveRowMacros` itself — is pinned in tests/legacy/kit/macro/row-macros.test.ts; the projection's own
// routing/totality in producers.contract.test.ts.
test("§6 parity keystone: the shared identity projection resolves a row's {{user}} to its own stamped persona, never the active nor the pinned anchor", () => {
  const miraId = castId<PersonaId>(mintTypeId(ID_PREFIX.persona));
  const identities: ChatIdentity[] = [{ kind: "persona", id: miraId, name: "Mira", description: "a wandering scholar", avatarHash: null }];

  const { characterNamesById, personaNamesById } = buildIdentityNameContext(identities);
  // The ANCHOR fallback — it must lose to the row's own Mira stamp.
  const names = { characterNamesById, personaNamesById, fallbackPersonaName: "Nyx" };

  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: miraId }, names)).toBe("Mira waves");
  // A NULL stamp (no producer entry the row itself owns) falls to the chat ANCHOR — a chat invariant, never the reader.
  expect(resolveRowMacros("{{user}} waves", { characterId: null, personaId: null }, names)).toBe("Nyx waves");
});
