// The typed API surface: RosterPresetContext (the DI bundle) and RosterPresetService (the verb
// interface). Saved rosters (D61 B6, D170) —
// owner-scoped library CRUD + the additive/idempotent `applyToChat` that drives chat's EXISTING roster
// verbs by injection. Every CRUD surface gates on `principal.userId` (the persona posture — ownership IS
// the gate, no guard slot); `applyToChat` additionally requires target-chat HOST authority, established
// through chat's OWN injected guard (never re-implemented here — see {@link RosterPresetChatOps}).

import type { RulePresetId, RulePresetKnobValues } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { ApplyRosterPresetResult, RosterPresetMemberView, RosterPresetSummary, RosterPresetView } from "@orb/contracts/roster-preset";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, RosterPresetId, UserId } from "@orb/kit/ids";
import type { AutomationService, RulePresetKnobOverrides } from "#domain/automation";
import type { ChatService } from "#domain/chat";
import type { AuditEntry } from "#foundation/observability";
import type {
  ApplyRosterPresetParams,
  CreateRosterPresetParams,
  GetRosterPresetParams,
  ListRosterPresetsParams,
  RemoveRosterPresetParams,
  UpdateRosterPresetParams,
} from "./params.ts";

/** One PRESENT character seat of the target chat — the applyToChat classification pre-read's row
 *  (added vs alreadyPresent), and the participantId `setSeatKnobs` re-stamps an existing seat through. */
export interface PresentCharacterSeat {
  readonly characterId: CharacterId;
  readonly participantId: ChatParticipantId;
}

/** A normalized seat as the write verbs stamp it — wire positions sorted then re-stamped dense 0..n-1
 *  (`substrate/members.ts`). Homed here, not persistence (the automation `RuleRow` posture: an exported
 *  domain type lives in `contract/`). */
export interface MemberWrite {
  readonly characterId: CharacterId;
  readonly position: number;
  /** NULL = inherit the chat default at apply — never stamped as a knob. */
  readonly talkativeness: number | null;
  readonly disabled: boolean;
}

/** One member row + its live card's display floor, FLAT as persistence serves it (queries only — the
 *  per-preset grouping is the pure `groupMemberViews` in `substrate/members.ts`). Homed here, the
 *  `MemberWrite` posture. */
export interface MemberCardRow {
  readonly presetId: RosterPresetId;
  readonly view: RosterPresetMemberView;
}

/** The chat-owned ops `applyToChat` drives — wired at the composition root, never a sideways import.
 *  The three verbs are `Pick`ed off chat's OWN service type (type-only through the front door, the
 *  automation `contract/ops.ts` idiom) so their signatures cannot drift; both are host-gated INSIDE chat
 *  and idempotent by chat's own contract (`addCharacterToChat`'s present-seat floor + `setSeatKnobs`'s
 *  empty-patch no-op both name applyToChat as their consumer).
 *
 *  `requireHost` runs FIRST, before any read of the target room: without it, an apply whose members are
 *  all already present (and whose preset carries no config) would fire ZERO host-gated ops and hand a
 *  non-host preset owner a roster-intersection oracle (`{added: [], alreadyPresent: […]}` against a
 *  foreign chatId). It is chat's own exported guard bound at compose — ONE authority home; a stranger
 *  and a non-existent room collapse to the same leak-free NOT_FOUND. */
export interface RosterPresetChatOps extends Pick<ChatService, "addCharacterToChat" | "setGroupConfig" | "setSeatKnobs"> {
  readonly requireHost: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly listPresentCharacterSeats: (chatId: ChatId) => Promise<readonly PresentCharacterSeat[]>;
}

/** One roster rule as the write verbs stamp it (B10's rules rider, build record §6) — wire order re-stamped
 *  dense 0..n-1, the knob bag RESOLVED through the injected automation belt (stored as OUTPUT — the
 *  `groupConfig` posture). The `MemberWrite` sibling. */
export interface CastRuleWrite {
  readonly rulePresetId: RulePresetId;
  readonly position: number;
  readonly knobs: RulePresetKnobValues;
}

/** The automation-owned ops the rules rider drives — the SAME sanctioned shape as
 *  {@link RosterPresetChatOps}: verb types `Pick`ed off automation's OWN service (type-only through the
 *  front door, wired at compose) so signatures cannot drift, plus automation's exported capture belt.
 *  Every write op is host-gated INSIDE automation (`requireRuleAuthority` / `requireChatHost`) and the
 *  ONE rule write path stays automation's — this domain writes only its own junction. */
export interface RosterPresetAutomationOps
  extends Pick<AutomationService, "createRuleFromPreset" | "deleteRule" | "listRulePresets" | "listRules" | "setRuleEnabled"> {
  /** The capture-side validation belt (`resolveChatRulePresetKnobs`, automation's front door): catalogue
   *  membership + chat scope + full descriptor resolution. Throws automation's own `RuleValidationError`
   *  (kit `DomainOperationError` → BAD_REQUEST) — the injected-guard error posture `requireHost` set. */
  readonly resolveChatRulePresetKnobs: (rulePresetId: RulePresetId, overrides: RulePresetKnobOverrides) => RulePresetKnobValues;
}

/** The DI bundle every roster-preset verb closes over, wired at the composition root. */
export interface RosterPresetContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newRosterPresetId: () => RosterPresetId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Fires `rosterPresetsChanged` with the acting owner's userId after every library write commits, so a
   *  second device's picker refetches. Fire-and-forget. `applyToChat` deliberately does NOT emit it — an
   *  apply mutates the CHAT's roster (which fans `chatUpdated` through the injected chat verbs); the
   *  library rows are untouched. */
  readonly emitUserEvent: EmitUserEvent;
  /** The member-ownership belt: returns the subset of `characterIds` the owner actually owns. The FK
   *  proves a character EXISTS, never that it is the caller's (the persona `ensureAssetOwned` posture) —
   *  a member row must never reference another user's character. Compose-wired read. */
  readonly verifyCharactersOwned: (ownerId: UserId, characterIds: readonly CharacterId[]) => Promise<readonly CharacterId[]>;
  /** The anchor-persona belt — absent/foreign ⇒ false (leak-free). The chat-compose precedent. */
  readonly verifyPersonaOwned: (ownerId: UserId, personaId: PersonaId) => Promise<boolean>;
  readonly chat: RosterPresetChatOps;
  readonly automation: RosterPresetAutomationOps;
}

export interface RosterPresetService {
  /** Mint a saved roster owned by the caller. Validates every member character (and the optional anchor
   *  persona) as the CALLER's own; refuses a duplicate `(owner, name)` with a typed conflict. */
  readonly create: (params: CreateRosterPresetParams) => Promise<RosterPresetView>;
  /** Full replace of the authored fields, member list included. Throws
   *  {@link RosterPresetNotFoundError} when the preset doesn't exist OR isn't the caller's (one answer —
   *  no foreign-existence leak). */
  readonly update: (params: UpdateRosterPresetParams) => Promise<RosterPresetView>;
  /** Delete an owned roster (members CASCADE; chats started from it are untouched — a preset is a stamp,
   *  not a live link). */
  readonly remove: (params: RemoveRosterPresetParams) => Promise<void>;
  /** The caller's rosters, name-sorted, each with its position-ordered member preview. */
  readonly list: (params: ListRosterPresetsParams) => Promise<RosterPresetSummary[]>;
  /** One owned roster, members in position order. */
  readonly get: (params: GetRosterPresetParams) => Promise<RosterPresetView>;
  /** Additively apply the roster to an EXISTING chat the caller HOSTS — drives the injected chat verbs,
   *  never a second participant-insert path. Idempotent: re-apply mints nothing (chat's present-seat
   *  floor) and re-stamps the seat knobs. Never kicks. */
  readonly applyToChat: (params: ApplyRosterPresetParams) => Promise<ApplyRosterPresetResult>;
}
