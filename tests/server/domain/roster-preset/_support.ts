// Shared test harness for the roster-preset domain (NOT a test file — no `.test` suffix). Builds a
// real-db `RosterPresetContext` with injected determinism (frozen clock + seeded ids), a recording FAKE
// `audit`/`emitUserEvent`, REAL ownership-belt reads (the same queries the compose seam wires — the
// composed-real proof of that wiring is `tests/server/entry/compose/roster-preset.int.test.ts`), and
// RECORDING fakes for the four injected chat ops — the "fake at the edges, inject at the root" doctrine.
// The chat fakes model chat's OWN contracts: `addCharacterToChat` is idempotent against the harness's
// mutable `presentSeats` (it returns the live seat instead of minting), `setGroupConfig` parses through
// the real `groupConfigSchema` — so a harness-level apply exercises the same shapes the composed graph
// serves.

import type { RulePresetId, RulePresetKnobValues } from "@orb/contracts/automation";
import { automationTriggerFor } from "@orb/contracts/automation";
import type { GroupConfig, ParticipantView } from "@orb/contracts/chat";
import { groupConfigSchema, TALKATIVENESS_DEFAULT } from "@orb/contracts/chat";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { characters, personas } from "@orb/db";
import type { AutomationRuleId, CharacterId, ChatId, ChatParticipantId, RosterPresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { RuleValidationError } from "../../../../packages/server/src/domain/automation/contract/errors.ts";
import { RULE_PRESETS } from "../../../../packages/server/src/domain/automation/contract/presets.ts";
import type { RuleView } from "../../../../packages/server/src/domain/automation/contract/results.ts";
import { resolveChatRulePresetKnobs, toRulePresetView } from "../../../../packages/server/src/domain/automation/substrate/presets.ts";
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

interface RuleMintCall {
  readonly chatId: ChatId | null;
  readonly rulePresetId: RulePresetId;
  readonly knobs: RulePresetKnobValues;
}

interface RuleEnableCall {
  readonly ruleId: AutomationRuleId;
  readonly enabled: boolean;
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
  /** The target chat's rules the fake `listRules` serves — tests seed it (via {@link seededRuleView});
   *  the fake mint APPENDS to it and the fake delete REMOVES from it, so re-apply arms see the room
   *  move exactly as automation's own verbs would move it. */
  readonly roomRules: RuleView[];
  /** The recorded injected-automation-op calls (B10's rules rider), in fire order. */
  readonly ruleMints: RuleMintCall[];
  readonly ruleEnables: RuleEnableCall[];
  readonly ruleDeletes: AutomationRuleId[];
  /** `listRules` invocation count — the sans-rules-cast ZERO-OPS pin reads this (a read is an op too). */
  readonly ruleListReads: { count: number };
  /** PLANTED per-preset mint refusals — the fake `createRuleFromPreset` throws automation's own
   *  `RuleValidationError` with the planted reason (the book-attachment consent class the REAL graph
   *  raises; the composed-real proof is `tests/server/entry/compose/roster-preset.int.test.ts`). */
  readonly refuseMints: Map<RulePresetId, string>;
  readonly advance: (ms: number) => void;
}

/** A fully-typed room RuleView the fake automation plane serves — provenance stamped when given. */
export function seededRuleView(args: {
  readonly id: AutomationRuleId;
  readonly chatId: ChatId;
  readonly name: string;
  readonly enabled: boolean;
  readonly position: number;
  readonly rulePresetId: RulePresetId | null;
  readonly rulePresetKnobs: RulePresetKnobValues | null;
  readonly createdAt?: number;
}): RuleView {
  return {
    id: args.id,
    chatId: args.chatId,
    name: args.name,
    description: null,
    enabled: args.enabled,
    position: args.position,
    trigger: automationTriggerFor("messageCommitted"),
    predicateCel: null,
    actions: [],
    // #1422 — an EMPTY arm list that parsed fine. The flag is what tells that apart from a blob nothing
    // could read, and a fixture must not claim the corrupt state it is not modelling.
    actionsCorrupt: false,
    rulePresetId: args.rulePresetId,
    rulePresetKnobs: args.rulePresetKnobs,
    matchAutomationEvents: false,
    // B4 at the shipped default. This double stands in for rules the CAST re-mints, and a cast carries no
    // opinion about the F4 offer — it captures preset ids + knobs, never per-rule preferences.
    suggestOnRefusal: true,
    cooldownSeconds: 0,
    maxFiresPerHour: 30,
    lastError: null,
    lastFiredAt: null,
    createdAt: args.createdAt ?? FROZEN_AT_MS,
    updatedAt: args.createdAt ?? FROZEN_AT_MS,
  };
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
  const roomRules: RuleView[] = [];
  const ruleMints: RuleMintCall[] = [];
  const ruleEnables: RuleEnableCall[] = [];
  const ruleDeletes: AutomationRuleId[] = [];
  const ruleListReads = { count: 0 };
  const refuseMints = new Map<RulePresetId, string>();
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
    // B10's rules rider — the injected automation ops. The VALIDATION arms are REAL (the same
    // catalogue + resolver the compose seam wires: the knob law is data, not wiring, so faking it
    // would fake the subject); the WRITE arms are recording fakes modeling automation's contracts —
    // mint appends `ruleCount` born-DISABLED provenance-stamped views, delete removes, enable flips.
    automation: {
      resolveChatRulePresetKnobs,
      listRulePresets: () => Object.values(RULE_PRESETS).map(toRulePresetView),
      listRules: () => {
        ruleListReads.count += 1;
        return Promise.resolve([...roomRules]);
      },
      createRuleFromPreset: ({ chatId, presetId: rulePresetId, knobs: overrideKnobs }): Promise<RuleView[]> => {
        const refusal = refuseMints.get(rulePresetId);
        if (refusal !== undefined) {
          // The planted consent-class refusal (automation's OWN error class — what the catch narrows on).
          return Promise.reject(new RuleValidationError("book_not_attached", refusal));
        }
        const resolved = resolveChatRulePresetKnobs(rulePresetId, overrideKnobs ?? {});
        ruleMints.push({ chatId, rulePresetId, knobs: resolved });
        const minted: RuleView[] = [];
        for (let index = 0; index < RULE_PRESETS[rulePresetId].ruleCount; index += 1) {
          const view = seededRuleView({
            id: castId<AutomationRuleId>(ids.next("automation_rule")),
            chatId: chatId ?? castId<ChatId>("chat_unscoped"),
            name: `${RULE_PRESETS[rulePresetId].title} (${index + 1}/${RULE_PRESETS[rulePresetId].ruleCount})`,
            enabled: false,
            position: roomRules.length,
            rulePresetId,
            rulePresetKnobs: resolved,
            createdAt: clock.now(),
          });
          roomRules.push(view);
          minted.push(view);
        }
        return Promise.resolve(minted);
      },
      setRuleEnabled: ({ ruleId, enabled }): Promise<void> => {
        ruleEnables.push({ ruleId, enabled });
        const index = roomRules.findIndex((rule) => rule.id === ruleId);
        const held = roomRules[index];
        if (held !== undefined) {
          roomRules[index] = { ...held, enabled };
        }
        return Promise.resolve();
      },
      deleteRule: ({ ruleId }): Promise<void> => {
        ruleDeletes.push(ruleId);
        const index = roomRules.findIndex((rule) => rule.id === ruleId);
        if (index >= 0) {
          roomRules.splice(index, 1);
        }
        return Promise.resolve();
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
    roomRules,
    ruleMints,
    ruleEnables,
    ruleDeletes,
    ruleListReads,
    refuseMints,
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
