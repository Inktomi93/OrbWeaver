import type { DomainEvent, DomainEventType, EmitDomainEvent } from "@orb/contracts/events";
import { DOMAIN_EVENT_TYPES } from "@orb/contracts/events";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── The in-process domain-event union (the embeddings indexer's payload contract) ──
// One home for the event discriminant axis (§7.5). A drift here means a handler/emitter re-spelled the
// type — the whole point of this node. CLOSED: a payload is only a branded id (the subscriber re-reads
// canon by id, never trusting event-carried data) — no secret/credential field is representable.
test("DOMAIN_EVENT_TYPES is exactly the closed [character.updated, asset.created] axis", () => {
  expect(DOMAIN_EVENT_TYPES).toEqual(["character.updated", "asset.created"]);
});

test("each event carries only its branded id (an injected EmitDomainEvent accepts every member)", () => {
  const seen: DomainEvent[] = [];
  const emit: EmitDomainEvent = (event) => {
    seen.push(event);
  };
  emit({ type: "character.updated", characterId: castId<CharacterId>("character_evt") });
  emit({ type: "asset.created", assetId: castId<AssetId>("asset_evt") });
  expect(seen.map((e) => e.type)).toEqual([...DOMAIN_EVENT_TYPES]);
});

// Exhaustiveness: a `Record<DomainEventType, …>` is tsc-red if a member is added/removed, backing the
// runtime assert with a compile-time guard (no inline re-spelling anywhere).
const EVENT_SEEN: Record<DomainEventType, true> = {
  "character.updated": true,
  "asset.created": true,
};
test("DomainEventType has no member beyond the tuple", () => {
  expect(Object.keys(EVENT_SEEN).sort()).toEqual([...DOMAIN_EVENT_TYPES].sort());
});
