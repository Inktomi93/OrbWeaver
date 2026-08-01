// Shared test harness for the automation domain (A3 global-variable slice + A4 rule/lifecycle slice). NOT a
// test file (no `.test` suffix). Builds a real-db `AutomationContext` with an injected fixed clock + prng
// (determinism), the real `can()` seam, and id minters; plus thin principal/user/chat seed delegates.

import type { AutomationAction, AutomationBusEvent, AutomationTrigger, TriggerFact } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chats, messages, messageVariants, users } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { eq } from "drizzle-orm";
import type { ArmDispatch, AutomationOps, TurnOriginRead } from "../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { PluginSubscriberRegistry } from "../../../../packages/server/src/domain/automation/contract/plugin-subscribers.ts";
import type { AutomationContext, AutomationService } from "../../../../packages/server/src/domain/automation/contract/service.ts";
import {
  createAutomationService,
  createEnabledRuleIndex,
  createPluginSubscriberRegistry,
  createPromptTransformIndex,
} from "../../../../packages/server/src/domain/automation/index.ts";
import { freshDb } from "../../../support/db.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { seedChat, seedParticipant } from "../chat/_support.ts";

/** A canonical valid arm + trigger for rule tests. */
export const SET_VAR: AutomationAction = { type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" };
export const MSG_COMMITTED: AutomationTrigger = { bus: "chat", type: "messageCommitted" };

/** A fixed injected clock — every `updated_at`/`fired_at` write is deterministic (no `Date.now`). */
export const FIXED_NOW_MS = 1_700_000_000_000;
/** A fixed prng — the dry-run macro `{{random}}`/`{{roll}}` source is deterministic in tests. */
const FIXED_PRNG = 0.42;

/** The A5 dispatch/watcher seam overrides a test injects — the arm dispatcher, a notify collector, and
 *  (rarely) custom chat read ops. The default `runArm` records every arm `action_error` (not-yet-wired). */
/** A minimal `PromptTransform` registrar for the A7 transform index — register/unregister into a Map the
 *  test reads back. Compose wires the chat domain's real `promptTransformRegistry` here. */
export interface TestPromptRegistry {
  readonly register: (transform: PromptTransform) => void;
  readonly unregister: (id: string) => void;
  readonly list: () => PromptTransform[];
}

/** A capturing prompt-transform registry — the transform tests read `list()` to assert what A7 registered. */
export function makeTestPromptRegistry(): TestPromptRegistry {
  const byId = new Map<string, PromptTransform>();
  return {
    register: (transform): void => void byId.set(transform.id, transform),
    unregister: (id): void => void byId.delete(id),
    list: (): PromptTransform[] => [...byId.values()],
  };
}

export interface HarnessOverrides {
  readonly runArm?: ArmDispatch;
  readonly notify?: (event: AutomationBusEvent) => void;
  readonly ops?: AutomationOps;
  /** The A7 prompt-transform registry the transform index registers into (default: a discarding sink). */
  readonly promptRegistry?: TestPromptRegistry;
  /** The plugin `events.on` subscriber registry (default: a fresh empty one). The fan-out tests inject one they
   *  register test subscribers on, then drive `handleEvent` and assert deliveries. */
  readonly pluginSubscribers?: PluginSubscriberRegistry;
}

/** The default injected dispatcher — every arm is not-yet-wired (records `action_error`), the A5 posture a
 *  test overrides with a real/fake arm. */
const NOT_WIRED_DISPATCH: ArmDispatch = () => Promise.resolve({ ok: false, kind: "arm_error", detail: "arm not wired" });

/** The chat READ ops the fact resolver + CEL env consume — direct db reads over the seeded chat (compose wires
 *  the equivalent from the chat domain's exports). */
function testChatOps(db: Db): AutomationOps {
  return {
    chat: {
      getMessageFact: async (_chatId, messageId): Promise<NonNullable<TriggerFact["message"]> | null> => {
        const rows = await db
          .select({
            id: messages.id,
            role: messages.role,
            authorUserId: messages.authorUserId,
            characterId: messages.characterId,
            seq: messages.seq,
            content: messageVariants.content,
          })
          .from(messages)
          .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
          .where(eq(messages.id, messageId))
          .limit(1);
        return rows[0] ?? null;
      },
      getTurnOrigin: async (_chatId, messageId): Promise<TurnOriginRead | null> => {
        const rows = await db
          .select({ initiator: messages.initiator, automationDepth: messages.automationDepth })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);
        const row = rows[0];
        return row === undefined ? null : { initiator: row.initiator, automationDepth: row.automationDepth };
      },
      readVariables: async (chatId): Promise<Record<string, string>> => {
        const rows = await db.select({ v: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId)).limit(1);
        return rows[0]?.v ?? {};
      },
      readChoicePicks: async (chatId): Promise<Record<string, string>> => {
        const rows = await db.select({ v: chats.variableValues }).from(chats).where(eq(chats.id, chatId)).limit(1);
        return rows[0]?.v ?? {};
      },
      // THE cross-domain viewer-visibility op — the REAL chat factory over the real db (never a fake): the
      // plugin fan-out's delivery gate consumes it, so a stubbed verdict here would test nothing.
      resolveViewerVisibility: createResolveViewerVisibility({ db }),
      // A6 write ops — inert defaults (the shared harness's A3/A4/A5 tests never fire a real arm; the arm
      // tests inject a capturing `AutomationOps`). Overridable via `overrides.ops`.
      applyVariableOps: async (): Promise<void> => undefined,
      // BG-F set_chat_background arm — inert defaults (only the arm tests exercise these).
      listBackgroundChoices: async (): Promise<readonly never[]> => [],
      // PROSE-1 — no host override in the shared harness ⇒ the shipped default clauses.
      resolveChatProse: () => Promise.resolve({}),
      setChatBackground: async (): Promise<void> => undefined,
      // 1.6 trigger_turn arm — inert default (only the arm-executor tests exercise a real requestTurn).
      requestTurn: async (): Promise<{ costUsd: number | null; messageCount: number }> => ({ costUsd: null, messageCount: 0 }),
    },
    worldInfo: {
      upsertEntries: async (): Promise<{ inserted: number; updated: number; skippedHandEdited: number }> => ({ inserted: 0, updated: 0, skippedHandEdited: 0 }),
    },
    notifications: { emit: async (): Promise<void> => undefined },
    imagery: { generatePicture: async (): Promise<{ costUsd: number | null; imageCount: number }> => ({ costUsd: null, imageCount: 0 }) },
    // BG-F quiet-op (the set_chat_background name pick) — inert default; only the arm tests exercise it.
    summarizeQuiet: async (): Promise<{ text: string; costUsd: number | null }> => ({ text: "", costUsd: null }),
  };
}

/** Build an AutomationContext over a real db with the fixed clock/prng, the real `can()`, id minters, and the
 *  A5 watcher/dispatch seams (real enabled index, the author-principal resolver, injectable arm executors +
 *  notify). Call `ctx.enabled.reload()` after seeding enabled rules if the watcher pre-check is under test. */
export function makeAutomationHarness(db: Db, overrides: HarnessOverrides = {}): AutomationContext {
  const ops = overrides.ops ?? testChatOps(db);
  const promptRegistry: TestPromptRegistry = overrides.promptRegistry ?? makeTestPromptRegistry();
  return {
    db,
    now: () => FIXED_NOW_MS,
    prng: () => FIXED_PRNG,
    newRuleId: () => mintTypeId(ID_PREFIX.automationRule),
    newFireId: () => mintTypeId(ID_PREFIX.automationFire),
    can,
    ops,
    runArm: overrides.runArm ?? NOT_WIRED_DISPATCH,
    enabled: createEnabledRuleIndex(db),
    pluginSubscribers: overrides.pluginSubscribers ?? createPluginSubscriberRegistry(),
    transforms: createPromptTransformIndex({
      db,
      ops,
      prng: () => FIXED_PRNG,
      now: () => FIXED_NOW_MS,
      register: promptRegistry.register,
      unregister: promptRegistry.unregister,
    }),
    resolveAuthor: async (userId): Promise<Principal | null> => {
      const rows = await db.select({ role: users.role, handle: users.handle }).from(users).where(eq(users.id, userId)).limit(1);
      const row = rows[0];
      return row === undefined ? null : { userId, role: row.role, handle: row.handle, externalId: null, via: "fallback" };
    },
    notify: overrides.notify ?? ((): void => undefined),
  };
}

/** A cookie-resolved Principal for a user id. */
export function principal(userId: UserId): Principal {
  return makePrincipal(userId);
}

/** Seed a user row and return its id (the global_variables / rule owner FK target). */
export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const userId = castId<UserId>(id);
  await seedUserRow(db, { id: userId, handle: castId<Handle>(id) });
  return userId;
}

/** Seed a chat with `userId` as its PRESENT host (the rule-authoring authority) and return the chatId. */
export async function seedHostChat(db: Db, userId: UserId, key = "auto"): Promise<ChatId> {
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `${key}_host`, userId, role: "host" });
  return chatId;
}

export interface RuleFixture {
  readonly db: Db;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
}

/** A fresh db + a host + their chat + the built service — the shared rule-lifecycle test setup. */
export async function ruleFixture(): Promise<RuleFixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const svc = createAutomationService(makeAutomationHarness(db));
  return { db, host, chatId, svc };
}
