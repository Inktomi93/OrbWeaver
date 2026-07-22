// tests/support/rpg-tool — builds an `RpgToolCtx` for the rpg TOOL handler tests (rpg-design/05 §3). Seeds a
// real game row, wires a full `RpgContext` (host membership stub + a bus sink + an overridable Rng), the
// `RpgService`, and the per-turn tool identity. A determinism seam (tests/support/), exempt from the test-* gates.

import type { DomainEvent } from "@orb/contracts/events";
import type { RpgBusEvent, RpgSheet } from "@orb/contracts/rpg";
import { rpgSheetSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgParty } from "@orb/db";
import type { ChatTurnId, MessageVariantId, RpgGameId, RpgPartyMemberId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { Rng } from "../../packages/server/src/domain/rpg/contract/rng.ts";
import type { RpgContext, RpgGameRow, RpgPartyRow, RpgService } from "../../packages/server/src/domain/rpg/contract/service.ts";
import type { RpgToolCtx } from "../../packages/server/src/domain/rpg/contract/tool-ctx.ts";
import { insertSnapshot } from "../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { createRpgService } from "../../packages/server/src/domain/rpg/service.ts";
import { makeSnapshotValues, principal, seedGame, seedMessage, seedUser } from "./factories/index.ts";
import { makeRpgContext } from "./rpg-context.ts";

const HOST_ID = castId<UserId>("user_host");
export const TOOL_HOST = principal(HOST_ID);
export const TOOL_TURN_ID = castId<ChatTurnId>("chatturn_test");

export interface SeededToolCtx {
  readonly ctx: RpgContext;
  readonly service: RpgService;
  readonly game: RpgGameRow;
  readonly tctx: RpgToolCtx;
  readonly bus: RpgBusEvent[];
  /** The closed domain-event mirror (05 §5 / 09b) captured for automation-visibility assertions. */
  readonly domainEvents: DomainEvent[];
}

export interface SeedToolOptions {
  readonly rng?: Rng;
  readonly game?: Parameters<typeof seedGame>[1];
  /** The pending user message text `ctx.chat.getPendingUserText` returns — the dice feed-forward seam (05 §6).
   *  A `[dice: …]` tag here lets a check golden pin the authoritative player-roll path. Default: no user line. */
  readonly pendingUserText?: string;
  /** Mark the tool turn dice-eligible (05 §6) — the engine's slot-adjacency verdict, which the FEED gates on.
   *  A check golden that exercises the queued-d20 path sets this (the live engine marks it for send/deferred/
   *  swipe-of-the-die-response); default false ⇒ a stale die never feeds. */
  readonly diceEligible?: boolean;
}

/** Seed a game + build its `RpgToolCtx` (AI-GM seat, host authority). The bus events land in `bus`. */
export async function seedToolCtx(db: Db, opts: SeedToolOptions = {}): Promise<SeededToolCtx> {
  const bus: RpgBusEvent[] = [];
  const domainEvents: DomainEvent[] = [];
  const game = await seedGame(db, opts.game);
  const ctx = makeRpgContext(db, {
    emitBus: (e) => bus.push(e),
    emitDomainEvent: (e) => domainEvents.push(e),
    ...(opts.rng !== undefined ? { rng: opts.rng } : {}),
    chat: {
      getMembership: async () => ({ role: "host" }),
      postNarratorMessage: async () => ({ messageId: castId("message_stub"), variantId: castId("message_variant_stub") }),
      setGroupConfig: () => Promise.resolve(),
      getPendingUserText: async () => opts.pendingUserText ?? null,
      resolveHost: async () => null,
      listRoster: async () => [],
      countNarratorTurnsSinceMedia: async () => 0,
    },
  });
  if (opts.diceEligible === true) {
    ctx.staging.markDicePreRollEligible(TOOL_TURN_ID);
  }
  const service = createRpgService(ctx);
  const tctx: RpgToolCtx = { ctx, service, game, chatId: game.chatId, turnId: TOOL_TURN_ID, principal: TOOL_HOST };
  return { ctx, service, game, tctx, bus, domainEvents };
}

/** A valid `RpgSheet` for a party member (03 §4.1) — override any field for a focused check. */
export function makeSheet(over: Record<string, unknown> = {}): RpgSheet {
  return rpgSheetSchema.parse({ className: "Adventurer", attributes: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 }, maxHp: 20, ...over });
}

let partySeq = 0;

/** Seed a party member (a fresh user seat) with a sheet whose `className` doubles as the alias-match name. */
export async function seedPartyMember(db: Db, gameId: RpgGameId, sheet: Record<string, unknown> = {}): Promise<RpgPartyRow> {
  const user = await seedUser(db);
  partySeq += 1;
  const rows = await db
    .insert(rpgParty)
    .values({
      // A VALID 26-char typeid suffix (the snapshot schema parses `partyMemberId` through `typeIdSchema` on
      // flush — a short test id fails there). Deterministic: the counter zero-padded to the suffix width.
      id: castId<RpgPartyMemberId>(`${ID_PREFIX.rpgPartyMember}_${String(partySeq).padStart(26, "0")}`),
      gameId,
      characterId: null,
      userId: user.id,
      sheet: makeSheet(sheet),
      arc: null,
      provenance: "joined",
      joinedSession: 1,
      leftSession: null,
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("seedPartyMember: no row returned");
  }
  return row;
}

/** Seed a committed base snapshot on a fresh assistant message so `resolveSnapshotForTurn` resolves it — the
 *  resolved variant the RPG-CONSOLE-COMMIT direct-commit arms write in place. Returns the snapshot's variant id. */
export async function seedBaseSnapshot(
  db: Db,
  game: Pick<RpgGameRow, "id" | "chatId">,
  seq: number,
  overrides: Record<string, unknown> = {},
): Promise<MessageVariantId> {
  const msg = await seedMessage(db, { chatId: game.chatId, role: "assistant", seq });
  await insertSnapshot(db, makeSnapshotValues({ gameId: game.id, messageId: msg.id, variantId: msg.variantId }, { committed: 1, ...overrides }));
  return msg.variantId;
}

/** A deterministic Rng that returns queued integers in order (falling back to `minIncl`), the first array
 *  element for `pick`, and a fixed `chance`. Lets a golden pin an exact roll (a natural 18, a hit, …). */
export function queuedRng(ints: readonly number[], chance = false): Rng {
  const queue = [...ints];
  return {
    int: (minIncl: number): number => queue.shift() ?? minIncl,
    pick: <T>(arr: readonly T[]): T => arr[0] as T,
    chance: (): boolean => chance,
  };
}
