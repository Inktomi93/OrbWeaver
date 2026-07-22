// support/factories/rpg — the campaign-root + snapshot seed (rpg-design/03). `seedGame` inserts an
// `rpg_games` row (auto-seeding a bare chat when none is given, so it is FK-clean on an empty db) and
// returns the stored row. `makeSnapshotValues` builds a valid `rpg_snapshots` insert around caller-supplied
// message/variant FKs (the D26 slot the snapshot keys on). Deterministic ids (core/Spine-Testing.md §3).

import type { RpgGameConfig } from "@orb/contracts/rpg";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgGames } from "@orb/db";
import type { MessageId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { NewRpgSnapshot, RpgGameRow } from "../../../packages/server/src/domain/rpg/contract/service.ts";
import { FROZEN_AT_MS } from "../clock.ts";
import { createSeededIds } from "../ids.ts";
import { seedChat } from "./chat.ts";

const ids = createSeededIds();

/** A valid minimal config — the smallest wizard product that parses (03 §1.1). */
export const DEFAULT_GAME_CONFIG: RpgGameConfig = rpgGameConfigSchema.parse({
  genres: ["Fantasy"],
  tones: ["Heroic"],
  difficulty: "normal",
  rating: "sfw",
  gm: { kind: "standalone" },
});

/** Overrides for the seeded game row; an absent `chatId` auto-seeds a bare chat. */
export interface SeedGameOptions extends Partial<RpgGameRow> {}

/** Insert an `rpg_games` row against a real db, returning the stored canon row (DB defaults applied). */
export async function seedGame(db: Db, overrides: SeedGameOptions = {}): Promise<RpgGameRow> {
  const chatId = overrides.chatId ?? (await seedChat(db)).id;
  const values = {
    id: castId<RpgGameId>(ids.next("rpggame")),
    config: DEFAULT_GAME_CONFIG,
    ...overrides,
    chatId,
  };
  const rows = await db.insert(rpgGames).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("seedGame: no row returned");
  }
  return row;
}

/** The FK triple every snapshot keys on: its game + the D26 slot/variant the swipe rides. */
export interface SnapshotFks {
  readonly gameId: RpgGameId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
}

/** A valid `rpg_snapshots` insert (day-1 morning, empty scene) around caller FKs; override any field. */
export function makeSnapshotValues(fks: SnapshotFks, overrides: Partial<NewRpgSnapshot> = {}): NewRpgSnapshot {
  return {
    id: castId(ids.next("rpgsnap")),
    gameId: fks.gameId,
    messageId: fks.messageId,
    variantId: fks.variantId,
    clock: { day: 1, hour: 8, minute: 0 },
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [],
    widgetValues: {},
    fieldLocks: null,
    committed: 0,
    createdAt: FROZEN_AT_MS,
    ...overrides,
  };
}
