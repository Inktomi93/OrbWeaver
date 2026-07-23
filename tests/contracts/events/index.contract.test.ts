import type { DomainEvent, DomainEventType, EmitDomainEvent } from "@orb/contracts/events";
import { DOMAIN_EVENT_TYPES } from "@orb/contracts/events";
import type { AssetId, CardEvolutionProposalId, CharacterId, ChatId, CrewEditProposalId, RpgClockId, RpgNpcId, RpgSessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── The in-process domain-event union (the embeddings indexer's payload contract) ──
// One home for the event discriminant axis (§7.5). A drift here means a handler/emitter re-spelled the
// type — the whole point of this node. CLOSED: a payload is only a branded id (the subscriber re-reads
// canon by id, never trusting event-carried data) — no secret/credential field is representable.
test("DOMAIN_EVENT_TYPES is exactly the closed axis (2 core + the 4-member chat-crew + the 5-member rpg mirror)", () => {
  expect(DOMAIN_EVENT_TYPES).toEqual([
    "character.updated",
    "asset.created",
    "crew.keeperRan",
    "crew.editProposalCreated",
    "crew.cardProposalCreated",
    "crew.directorPassCompleted",
    "rpg.clockCompleted",
    "rpg.sessionConcluded",
    "rpg.encounterEnded",
    "rpg.reputationMilestone",
    "rpg.checkResolved",
  ]);
});

test("each event carries only its branded id (an injected EmitDomainEvent accepts every member)", () => {
  const seen: DomainEvent[] = [];
  const emit: EmitDomainEvent = (event) => {
    seen.push(event);
  };
  emit({
    type: "character.updated",
    characterId: castId<CharacterId>("character_evt"),
    contentChanged: true,
  });
  emit({ type: "asset.created", assetId: castId<AssetId>("asset_evt") });
  emit({ type: "crew.keeperRan", chatId: castId<ChatId>("chat_evt") });
  emit({ type: "crew.editProposalCreated", chatId: castId<ChatId>("chat_evt"), proposalId: castId<CrewEditProposalId>("crewprop_evt") });
  emit({
    type: "crew.cardProposalCreated",
    chatId: castId<ChatId>("chat_evt"),
    characterId: castId<CharacterId>("character_evt"),
    proposalId: castId<CardEvolutionProposalId>("cardprop_evt"),
  });
  emit({ type: "crew.directorPassCompleted", chatId: castId<ChatId>("chat_evt") });
  emit({ type: "rpg.clockCompleted", chatId: castId<ChatId>("chat_evt"), clockId: castId<RpgClockId>("rpgclock_evt") });
  emit({ type: "rpg.sessionConcluded", chatId: castId<ChatId>("chat_evt"), sessionId: castId<RpgSessionId>("rpgsession_evt") });
  emit({ type: "rpg.encounterEnded", chatId: castId<ChatId>("chat_evt"), encounterId: castId("rpgenc_evt") });
  emit({ type: "rpg.reputationMilestone", chatId: castId<ChatId>("chat_evt"), npcId: castId<RpgNpcId>("rpgnpc_evt") });
  emit({ type: "rpg.checkResolved", chatId: castId<ChatId>("chat_evt") });
  expect(seen.map((e) => e.type)).toEqual([...DOMAIN_EVENT_TYPES]);
});

// Exhaustiveness: a `Record<DomainEventType, …>` is tsc-red if a member is added/removed, backing the
// runtime assert with a compile-time guard (no inline re-spelling anywhere).
const EVENT_SEEN: Record<DomainEventType, true> = {
  "character.updated": true,
  "asset.created": true,
  "crew.keeperRan": true,
  "crew.editProposalCreated": true,
  "crew.cardProposalCreated": true,
  "crew.directorPassCompleted": true,
  "rpg.clockCompleted": true,
  "rpg.sessionConcluded": true,
  "rpg.encounterEnded": true,
  "rpg.reputationMilestone": true,
  "rpg.checkResolved": true,
};
test("DomainEventType has no member beyond the tuple", () => {
  expect(Object.keys(EVENT_SEEN).sort()).toEqual([...DOMAIN_EVENT_TYPES].sort());
});
