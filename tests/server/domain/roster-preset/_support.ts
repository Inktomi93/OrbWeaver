// Shared test harness for the roster-preset domain (NOT a test file — no `.test` suffix). Builds a
// real-db `RosterPresetContext` with injected determinism (frozen clock + seeded ids), a recording FAKE
// `audit`/`emitUserEvent`, REAL ownership-belt reads (the same queries the compose seam wires — the
// composed-real proof of that wiring is `tests/server/entry/compose/roster-preset.int.test.ts`), and
// RECORDING fakes for the four injected chat ops — the "fake at the edges, inject at the root" doctrine.
// The chat fakes model chat's OWN contracts: `addCharacterToChat` is idempotent against the harness's
// mutable `presentSeats` (it returns the live seat instead of minting), `setGroupConfig` parses through
// the real `groupConfigSchema` — so a harness-level apply exercises the same shapes the composed graph
// serves.

import type { GroupConfig, ParticipantView } from "@orb/contracts/chat";
import { groupConfigSchema, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, RosterPresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import type { PresentCharacterSeat, RosterPresetContext } from "../../../../packages/server/src/domain/roster-preset/contract/service.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { createSeededIds } from "../../../support/ids.ts";

interface AuditCall {
  readonly entry: Parameters<RosterPresetContext["audit"]>[0];
  readonly at: number;
}

interface UserEventCall {
  readonly userId: UserId;
  readonly event: UserBusEvent;
}

interface AddCall {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
}

interface KnobCall {
  readonly chatId: ChatId;
  readonly participantId: ChatParticipantId;
  readonly patch: { readonly talkativeness?: number | undefined; readonly disabled?: boolean | undefined };
}

interface ConfigCall {
  readonly chatId: ChatId;
  readonly config: GroupConfig;
}

interface HostCall {
  readonly principal: Principal;
  readonly chatId: ChatId;
}

export interface RosterPresetHarness {
  readonly ctx: RosterPresetContext;
  readonly audits: AuditCall[];
  readonly userEvents: UserEventCall[];
  /** The recorded injected-chat-op calls, in fire order (the applyToChat ordering pins read these). */
  readonly hostChecks: HostCall[];
  readonly adds: AddCall[];
  readonly knobs: KnobCall[];
  readonly configs: ConfigCall[];
  /** The target chat's PRESENT character seats the fake pre-read serves — tests seed it; the fake
   *  `addCharacterToChat` ALSO appends to it (chat's present-seat idempotency floor, modeled). */
  readonly presentSeats: PresentCharacterSeat[];
  readonly advance: (ms: number) => void;
}

/** A minimal fully-typed ParticipantView for a character seat the fake add returns. */
function fakeSeatView(chatId: ChatId, characterId: CharacterId, participantId: ChatParticipantId): ParticipantView {
  return {
    id: participantId,
    chatId,
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: TALKATIVENESS_DEFAULT,
    disabled: false,
    joinedAt: FROZEN_AT_MS,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Fake Seat",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
  };
}

/** Build the RosterPresetContext over a real db with deterministic + recording fakes. */
export function makeHarness(db: Db, overrides: Partial<RosterPresetContext> = {}): RosterPresetHarness {
  const clock = createFrozenClock(FROZEN_AT_MS);
  const ids = createSeededIds();
  const audits: AuditCall[] = [];
  const userEvents: UserEventCall[] = [];
  const hostChecks: HostCall[] = [];
  const adds: AddCall[] = [];
  const knobs: KnobCall[] = [];
  const configs: ConfigCall[] = [];
  const presentSeats: PresentCharacterSeat[] = [];
  const ctx: RosterPresetContext = {
    db,
    now: (): number => clock.now(),
    newRosterPresetId: (): RosterPresetId => castId<RosterPresetId>(ids.next("roster_preset")),
    audit: (entry: AuditCall["entry"], at: number): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    emitUserEvent: (userId: UserId, event: UserBusEvent): void => {
      userEvents.push({ userId, event });
    },
    // REAL belt reads (the compose seam's own queries) — the FK-vs-ownership distinction under test is
    // data, not wiring, so faking these would fake the subject.
    verifyCharactersOwned: async (ownerId, characterIds): Promise<readonly CharacterId[]> => {
      if (characterIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({ id: characters.id })
        .from(characters)
        .where(and(inArray(characters.id, [...characterIds]), eq(characters.ownerId, ownerId)));
      return rows.map((row) => row.id);
    },
    verifyPersonaOwned: async (ownerId, personaId): Promise<boolean> => {
      const rows = await db.select({ ownerId: personas.ownerId }).from(personas).where(eq(personas.id, personaId)).limit(1);
      return rows[0]?.ownerId === ownerId;
    },
    chat: {
      requireHost: (principalArg: Principal, chatId: ChatId): Promise<void> => {
        hostChecks.push({ principal: principalArg, chatId });
        return Promise.resolve();
      },
      listPresentCharacterSeats: (): Promise<readonly PresentCharacterSeat[]> => Promise.resolve([...presentSeats]),
      addCharacterToChat: ({ chatId, characterId }): Promise<ParticipantView> => {
        adds.push({ chatId, characterId });
        // Chat's present-seat idempotency floor, modeled: a present character returns its live seat.
        const existing = presentSeats.find((seat) => seat.characterId === characterId);
        if (existing !== undefined) {
          return Promise.resolve(fakeSeatView(chatId, characterId, existing.participantId));
        }
        const participantId = castId<ChatParticipantId>(ids.next("chat_participant"));
        presentSeats.push({ characterId, participantId });
        return Promise.resolve(fakeSeatView(chatId, characterId, participantId));
      },
      setSeatKnobs: ({ chatId, participantId, patch }): Promise<ParticipantView> => {
        knobs.push({ chatId, participantId, patch });
        const seat = presentSeats.find((s) => s.participantId === participantId);
        return Promise.resolve(fakeSeatView(chatId, seat?.characterId ?? castId<CharacterId>("character_unknown"), participantId));
      },
      setGroupConfig: ({ chatId, config }): Promise<GroupConfig> => {
        // The REAL parse — chat's own trust boundary, so a stored blob that stopped parsing fails here
        // exactly as it would at the composed seam.
        const parsed = groupConfigSchema.parse(config);
        configs.push({ chatId, config: parsed });
        return Promise.resolve(parsed);
      },
    },
    ...overrides,
  };
  return {
    ctx,
    audits,
    userEvents,
    hostChecks,
    adds,
    knobs,
    configs,
    presentSeats,
    advance: (ms: number): void => clock.advance(ms),
  };
}

/** Build a Principal for a given user id + role (cookie-resolved by default). */
export function principal(userId: UserId, role: UserRole = "user"): Principal {
  return makePrincipal(userId, { role });
}

/** A wire member spec (chat's D80 character arm) with knob defaults omitted unless given. */
export function memberSpec(
  characterId: CharacterId,
  position: number,
  knobs: { readonly talkativeness?: number; readonly disabled?: boolean } = {},
): { kind: "character"; characterId: CharacterId; position: number; talkativeness?: number | undefined; disabled?: boolean | undefined } {
  return { kind: "character", characterId, position, ...knobs };
}
