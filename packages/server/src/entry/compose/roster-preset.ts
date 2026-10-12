// The roster-preset seam (D61 B6 — saved parties; D170).
// Built AFTER chat: `applyToChat` drives chat's OWN host-gated verbs (addCharacterToChat / setSeatKnobs /
// setGroupConfig) plus chat's own `requireHost` guard — ONE authority home, wired here so the domain
// never sideways-imports chat at runtime. The two ownership belts (member characters, anchor persona) are
// the owning domains' own reads; the present-seat classification pre-read is a direct compose-root db read
// (the `resolveChatHostUserId` precedent): an injected op that reads tenant-scoped data either takes the
// caller and gates inside (the chat verbs do) or is a pure ownership/classification read whose subject
// the calling verb already gated.

import type { Can } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { AutomationService } from "#domain/automation";
import { resolveChatRulePresetKnobs } from "#domain/automation";
import { createOwnedCharacterIds } from "#domain/character";
import type { ChatService } from "#domain/chat";
import { requireHost } from "#domain/chat";
import { createPersonaOwned } from "#domain/persona";
import type { PresentCharacterSeat, RosterPresetContext, RosterPresetService } from "#domain/roster-preset";
import { createRosterPresetService } from "#domain/roster-preset";
import type { AuditEntry } from "#foundation/observability";
import { minter } from "./minter.ts";

interface RosterPresetComposeInput {
  readonly db: Db;
  readonly now: () => number;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly emitUserEvent: EmitUserEvent;
  readonly can: Can;
  readonly chat: ChatService;
  readonly automation: AutomationService;
}

export function buildRosterPreset(input: RosterPresetComposeInput): RosterPresetService {
  const { db, now, audit, emitUserEvent, can, chat, automation } = input;
  const ctx: RosterPresetContext = {
    db,
    now,
    newRosterPresetId: minter(ID_PREFIX.rosterPreset),
    audit,
    emitUserEvent,
    // The owned subset of `characterIds` — the FK proves existence, never ownership, so the producer
    // verb gates through this read (D18/D20).
    verifyCharactersOwned: createOwnedCharacterIds(db),
    verifyPersonaOwned: createPersonaOwned(db),
    chat: {
      addCharacterToChat: chat.addCharacterToChat,
      setSeatKnobs: chat.setSeatKnobs,
      setGroupConfig: chat.setGroupConfig,
      // Chat's OWN guard — a stranger and a dead room collapse to the same leak-free NOT_FOUND. Runs
      // BEFORE any target-room read inside applyToChat (the roster-intersection-oracle closure).
      requireHost: async (principal, chatId): Promise<void> => {
        await requireHost({ db, can }, principal, chatId);
      },
      // The added-vs-alreadyPresent classification pre-read: PRESENT character seats only (leftSeq NULL
      // — a departed seat re-adds fresh, era-per-row). Runs strictly AFTER the host gate above.
      listPresentCharacterSeats: async (chatId): Promise<readonly PresentCharacterSeat[]> => {
        const rows = await db
          .select({ characterId: chatParticipants.characterId, participantId: chatParticipants.id })
          .from(chatParticipants)
          .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
        return rows.flatMap((row) => (row.characterId === null ? [] : [{ characterId: row.characterId, participantId: row.participantId }]));
      },
    },
    // B10's rules rider — automation's OWN front-door verbs (every write host-gated inside automation;
    // the ONE rule write path stays automation's) + its exported capture belt. The same sanctioned
    // shape as the chat ops above.
    automation: {
      createRuleFromPreset: automation.createRuleFromPreset,
      deleteRule: automation.deleteRule,
      listRulePresets: automation.listRulePresets,
      listRules: automation.listRules,
      setRuleEnabled: automation.setRuleEnabled,
      resolveChatRulePresetKnobs,
    },
  };
  return createRosterPresetService(ctx);
}
