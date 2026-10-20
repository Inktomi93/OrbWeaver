// Shared test harness for the automation domain (A3 global-variable slice + A4 rule/lifecycle slice). NOT a
// test file (no `.test` suffix). Builds a real-db `AutomationContext` with an injected fixed clock + prng
// (determinism), the real `can()` seam, and id minters; plus thin principal/user/chat seed delegates.

import type { AutomationAction, AutomationActionInput, AutomationBusEvent, AutomationTrigger } from "@orb/contracts/automation";
import { automationActionSchema } from "@orb/contracts/automation";
import type { PromptTransform, VariableWriteResult } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { automationFires } from "@orb/db";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseHandle } from "@orb/db/wiring-driver";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AutomationRuleId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSerialLanes } from "@orb/kit/serial-lanes";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import { createResolveUserEnabled } from "@orb/server/domain/sessions";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedUser as seedUserRow } from "@orb/testkit/node/factories/user.ts";
import { can } from "#server/domain/admin/index.ts";
import type {
  ApplyProseRewrite,
  ArmDispatch,
  AutomationOps,
  EnabledRuleIndex,
  ExecutePluginSuggestion,
  IsPluginLive,
  PromptTransformIndex,
  SuggestionStore,
} from "#server/domain/automation/contract/ops.ts";
import type { PluginSubscriberRegistry } from "#server/domain/automation/contract/plugin-subscribers.ts";
import type { AutomationContext, AutomationService } from "#server/domain/automation/contract/service.ts";
import {
  createAutomationService,
  createEnabledRuleIndex,
  createPluginSubscriberRegistry,
  createPromptTransformIndex,
  createSuggestionStore,
} from "#server/domain/automation/index.ts";
import { createLoadUserById } from "#server/domain/sessions/verbs/load-user-by-id.ts";
import { createHostPrincipalResolver } from "#server/entry/auth/index.ts";
import type { AutomationActionOpsDeps } from "#server/entry/compose/automation-watcher.ts";
import { createAutomationOps } from "#server/entry/compose/automation-watcher.ts";
import { principal as makePrincipal } from "../../../db/schema/_support.ts";
import { seedChat, seedParticipant } from "../chat/_support.ts";

// One lane set per suite, the way the automation service owns one for its dispatcher and arms.
const SERIAL_LANES = createSerialLanes();

/** PARSE an AUTHORED arm into the stored/dispatched shape — exactly what `createRule` does before anything
 *  runs, so a test that hands an arm straight to the dispatcher exercises the same value production does.
 *  Without it every fixture would have to spell each defaulted field (`mode`, `position`, `confirmFirst`,
 *  the imagery args) by hand, which is how a new default turns into a repo-wide churn wave. */
export function arm(input: AutomationActionInput): AutomationAction {
  return automationActionSchema.parse(input);
}

/** A canonical valid arm + trigger for rule tests. */
export const SET_VAR: AutomationAction = arm({ type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" });
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
  /** S4 — the pending-ask store (default: a fresh empty one). Pass one in to inspect what a fire stashed. */
  readonly suggestions?: SuggestionStore;
  /** S4 posture 2, the PLUGIN arm — the injected executor a confirmed plugin act runs through, and the plugin
   *  liveness read the confirm re-check consults. Defaults REFUSE and report NOT LIVE: a confirm test that
   *  forgets to wire them sees a typed refusal, never a silently-executed act (the fail-closed default class
   *  `resolveViewerVisibility` and `isBookAttachedToChat` already use in the plugin harness). */
  readonly executePluginSuggestion?: ExecutePluginSuggestion;
  readonly isPluginLive?: IsPluginLive;
  /** C3 — the CONFIRM-ONLY prose-rewrite op. Same fail-closed default class: it REJECTS unless a test wires
   *  it, so nothing can assert a landed rewrite the harness never performed. */
  readonly applyProseRewrite?: ApplyProseRewrite;
  /** D146 — the `run_tool` arm's tool seam. Default {@link NO_TOOLS}: nothing is drivable, so a rule naming a
   *  tool PAUSES. A test that exercises the arm passes a stub naming exactly the tools it pretends are
   *  installed, for exactly the author it pretends installed them. */
  readonly tools?: AutomationOps["tools"];
  /** #1431 — the in-process enabled-rule index. Pass one in to drive the REFRESH-FAILURE path: the real index
   *  only fails when the db does, and the invariant under test (a durable mutation must not be rejected by a
   *  failed index rebuild, and the stale index must fail OPEN) is unreachable otherwise. */
  readonly enabled?: EnabledRuleIndex;
  /** #1431 — the prompt-transform index, same reason. */
  readonly transforms?: PromptTransformIndex;
}

/** #1431 — a `Db` FACADE whose READS throw while `state.fail` is true; writes are untouched.
 *
 *  It is handed ONLY to the in-process indexes (`createEnabledRuleIndex` / `createPromptTransformIndex`), never
 *  to the context, so a verb's durable write still commits against the real db while its index rebuild fails.
 *  That is the exact interleaving the defect lives in, and it exercises the REAL index — a hand-rolled index
 *  double would prove the double's behavior and nothing about the production stale latch or its fail-open reads. */
export function readFailingDb(db: Db, state: { fail: boolean }): Db {
  const refuse = (): never => {
    throw new Error("test: db read refused");
  };
  return new Proxy(db, {
    get: (target, prop, receiver): unknown => {
      if (state.fail && (prop === "select" || prop === "selectDistinct")) {
        return refuse;
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

/** The FAIL-CLOSED tool seam, and the honest default for every harness that registers no plugin: no name is
 *  drivable by anyone, and an invocation that somehow reaches it answers `unavailable` rather than pretending
 *  to have run something. Exported because the inline `AutomationOps` literals in the dispatch/fan-out suites
 *  need the same default without rebuilding the bundle. */
export const NO_TOOLS: AutomationOps["tools"] = {
  isToolDrivableBy: (): boolean => false,
  runTool: () => Promise.resolve({ ok: false, reason: "unavailable" }),
};

/** The default injected dispatcher — every arm is not-yet-wired (records `action_error`), the A5 posture a
 *  test overrides with a real/fake arm. */
const NOT_WIRED_DISPATCH: ArmDispatch = () => Promise.resolve({ ok: false, kind: "arm_error", detail: "arm not wired" });

/** The automation ops as compose assembles them: the chat READ projections are the production ones over the real
 *  db, and every action WRITE op is inert (the shared harness never fires a real arm; the arm tests inject a
 *  capturing `AutomationOps` through `overrides.ops`). Exported for suites that need the real reads beside their
 *  own write ops. */
export function realAutomationOps(db: Db, overrides: Partial<Omit<AutomationActionOpsDeps, "db">> = {}): AutomationOps {
  const handle = databaseHandle(db);
  return createAutomationOps({
    db: handle,
    // The plugin fan-out's delivery gate consumes this, so a stubbed verdict here would test nothing.
    resolveViewerVisibility: createResolveViewerVisibility({ db: handle }),
    applyVariableOps: async (): Promise<VariableWriteResult> => ({ outcome: "applied" }),
    upsertEntries: async () => ({ inserted: 0, updated: 0, skippedHandEdited: 0 }),
    emitNotification: async (): Promise<void> => undefined,
    generatePicture: async () => ({ costUsd: null, imageCount: 0 }),
    requestTurn: async () => ({ costUsd: null, messageCount: 0 }),
    listBackgroundChoices: async (): Promise<readonly never[]> => [],
    setChatBackground: async (): Promise<void> => undefined,
    // No host override in the shared harness, so every prose slot resolves to its shipped default.
    resolveChatProse: () => Promise.resolve({}),
    summarizeQuiet: async () => ({ text: "", costUsd: null }),
    isToolDrivableBy: NO_TOOLS.isToolDrivableBy,
    runTool: NO_TOOLS.runTool,
    ...overrides,
  });
}

/** The author reads compose wires from sessions' own `loadUserById`: the row-derived Principal and the
 *  fail-closed standing-authority check. */
function realAuthorReads(db: Db): Pick<AutomationContext, "isAuthorEnabled" | "resolveAuthor"> {
  const sessions = createLoadUserById({ db });
  return { isAuthorEnabled: createResolveUserEnabled(sessions), resolveAuthor: createHostPrincipalResolver(sessions) };
}

/** Build an AutomationContext over a real db with the fixed clock/prng, the real `can()`, id minters, and the
 *  A5 watcher/dispatch seams (real enabled index, the author-principal resolver, injectable arm executors +
 *  notify). Call `ctx.enabled.reload()` after seeding enabled rules if the watcher pre-check is under test. */
export function makeAutomationHarness(db: Db, overrides: HarnessOverrides = {}): DbAssemblyInput<AutomationContext> {
  const handle = databaseHandle(db);
  const ops =
    overrides.ops ??
    realAutomationOps(db, overrides.tools === undefined ? {} : { isToolDrivableBy: overrides.tools.isToolDrivableBy, runTool: overrides.tools.runTool });
  const promptRegistry: TestPromptRegistry = overrides.promptRegistry ?? makeTestPromptRegistry();
  return {
    db: handle,
    now: () => FIXED_NOW_MS,
    serialLanes: SERIAL_LANES,
    prng: () => FIXED_PRNG,
    newRuleId: () => mintTypeId(ID_PREFIX.automationRule),
    newFireId: () => mintTypeId(ID_PREFIX.automationFire),
    newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
    can,
    ops,
    listRuleTools: () => [],
    runArm: overrides.runArm ?? NOT_WIRED_DISPATCH,
    enabled: overrides.enabled ?? createEnabledRuleIndex(handle),
    // S4 — ONE store per harness (the compose posture): a test that raises through the dispatch and confirms
    // through the verbs must be looking at the same map, or every confirm would refuse as not-found.
    suggestions: overrides.suggestions ?? createSuggestionStore(),
    pluginSubscribers: overrides.pluginSubscribers ?? createPluginSubscriberRegistry(),
    transforms:
      overrides.transforms ??
      createPromptTransformIndex({
        db: handle,
        ops,
        prng: () => FIXED_PRNG,
        now: () => FIXED_NOW_MS,
        register: promptRegistry.register,
        unregister: promptRegistry.unregister,
      }),
    // Never a stub `true`: a disabled author's chat-less rules must stop firing, which a constant cannot show.
    ...realAuthorReads(db),
    executePluginSuggestion:
      overrides.executePluginSuggestion ?? ((): Promise<void> => Promise.reject(new Error("test: executePluginSuggestion was not wired for this harness"))),
    isPluginLive: overrides.isPluginLive ?? ((): Promise<boolean> => Promise.resolve(false)),
    // C3 — REJECTS by default, like `executePluginSuggestion` above and for the same reason: a harness that
    // silently no-op'd a confirmed rewrite would let a test assert a landed rewrite that never happened.
    applyProseRewrite:
      overrides.applyProseRewrite ?? ((): Promise<void> => Promise.reject(new Error("test: applyProseRewrite was not wired for this harness"))),
    notify: overrides.notify ?? ((): void => undefined),
  };
}

/** The owner-form context a substrate entry takes, recovered from the harness's assembly handle exactly as the
 *  automation service recovers it. */
export function automationContext(input: DbAssemblyInput<AutomationContext>): AutomationContext {
  return { ...input, db: databaseForOwner(input.db) };
}

/** Resolve a caller's Principal through the production row resolver; the stored row decides the role. */
export async function principal(db: Db, userId: UserId): Promise<Principal> {
  return await makePrincipal({ db }, userId);
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

/** Seed `count` completed `fired` rows for one rule of a chat inside the current hour window — the fixture that
 *  fills the per-chat fire-rate belt up to (or past) `AUTOMATION_CHAT_MAX_FIRES_PER_HOUR`. Each row sits one ms
 *  apart from `firedAt` onward. */
export async function seedChatFires(
  db: Db,
  args: { readonly ruleId: AutomationRuleId; readonly chatId: ChatId; readonly count: number; readonly firedAt: number },
): Promise<void> {
  const rows = Array.from({ length: args.count }, (_, i) => ({
    id: mintTypeId(ID_PREFIX.automationFire),
    ruleId: args.ruleId,
    chatId: args.chatId,
    triggerType: "messageCommitted" as const,
    outcome: "fired" as const,
    detail: null,
    automationDepth: 0,
    firedAt: args.firedAt + i,
  }));
  if (rows.length > 0) {
    await db.insert(automationFires).values(rows);
  }
}

export interface RuleFixture {
  readonly db: Db;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  /** Every event the verbs pushed at the injected `notify` sink, in order — the automation bus's ONE producer
   *  seam. The rule-lifecycle suites assert `rulesChanged` here (event-bus coverage survey H2/F5); before the
   *  fix wave the member was declared and emitted nowhere, so this ledger was empty for every rule verb. */
  readonly events: AutomationBusEvent[];
  /** The context the service was built over — S4 tests read `ctx.suggestions` to see what a fire stashed,
   *  and the end-to-end confirm tests need the SAME instance the verbs take from. */
  readonly ctx: DbAssemblyInput<AutomationContext>;
}

/** A fresh db + a host + their chat + the built service — the shared rule-lifecycle test setup. */
export async function ruleFixture(overrides: HarnessOverrides = {}, freshHandle?: Db): Promise<RuleFixture> {
  const db = freshHandle ?? (await freshDb());
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const events: AutomationBusEvent[] = [];
  // The collector is applied LAST on purpose: `events` is the fixture's contract, so an override may widen
  // the harness (a real arm dispatcher, a shared store) without silently blinding every bus assertion.
  const ctx = makeAutomationHarness(db, { ...overrides, notify: (event): void => void events.push(event) });
  const svc = createAutomationService(ctx);
  return { db, host, chatId, svc, events, ctx };
}
