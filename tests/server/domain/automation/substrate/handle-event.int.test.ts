// A5 — the watcher/dispatch engine, end-to-end off `handleEvent`. Arms are A6, so these tests inject test arm
// executors through the harness seam and assert the ENGINE: a rule fires end-to-end off a real bus event;
// arms run in position order over sibling rules; a throwing rule is isolated; the cascade-depth + cooldown
// gates bite; the error ceiling auto-disables; and a chat with zero enabled rules does NOTHING (the pre-check
// — the byte-identity no-op's server half).

import type { AutomationActionInput, AutomationBusEvent, AutomationTrigger } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { automationRules, chatParticipants, messages } from "@orb/db";
import type { AutomationRuleId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import type { ArmDispatch, AutomationOps } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService, createEnabledRuleIndex } from "../../../../../packages/server/src/domain/automation/index.ts";
import { listFiresForRule } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { createSuggestionStore } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { createPostNarratorMessage } from "../../../../../packages/server/src/domain/chat/verbs/post-narrator-message.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedAsset, seedCharacter, seedMessage } from "../../chat/_support.ts";
import type { HarnessOverrides } from "../_support.ts";
import { makeAutomationHarness, NO_TOOLS, principal, readFailingDb, seedHostChat, seedUser } from "../_support.ts";

const CHAT_OPENED: AutomationTrigger = { bus: "chat", type: "chatOpened" };
const TURN_COMPLETED: AutomationTrigger = { bus: "chat", type: "turnCompleted" };
const SET_VAR: AutomationActionInput = { type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" };

interface Fixture {
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  readonly calls: string[];
  readonly events: AutomationBusEvent[];
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A dispatcher that records a set_variable arm's key, and throws on the `boom` sentinel value (isolation).
 *  These suites only fire `set_variable` rules, so it narrows via a cast (no discriminant guard). */
function recordingDispatch(calls: string[]): ArmDispatch {
  return (action): Promise<{ ok: true }> => {
    const arm = action as Extract<AutomationActionInput, { type: "set_variable" }>;
    if (arm.op === "set" && arm.value === "boom") {
      throw new Error("arm blew up");
    }
    calls.push(arm.key);
    return Promise.resolve({ ok: true as const });
  };
}

function chatOpened(chatId: ChatId): AutomationBusEvent extends never ? never : { type: "chatOpened"; chatId: ChatId } {
  return { type: "chatOpened", chatId };
}

async function setup(overrides: HarnessOverrides = {}): Promise<Fixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const calls: string[] = [];
  const events: AutomationBusEvent[] = [];
  const ctx = makeAutomationHarness(db, {
    runArm: overrides.runArm ?? recordingDispatch(calls),
    notify: overrides.notify ?? ((e): void => void events.push(e)),
    ...(overrides.ops !== undefined ? { ops: overrides.ops } : {}),
    ...(overrides.tools !== undefined ? { tools: overrides.tools } : {}),
  });
  return { db, host, chatId, svc: createAutomationService(ctx), calls, events };
}

interface RuleOpts {
  readonly name: string;
  readonly trigger?: AutomationTrigger;
  readonly actions?: readonly AutomationActionInput[];
  readonly matchAutomationEvents?: boolean;
  readonly cooldownSeconds?: number;
  readonly maxFiresPerHour?: number;
}

/** Create + enable a rule; returns its id. */
async function armRule(f: Fixture, opts: RuleOpts): Promise<AutomationRuleId> {
  const p = principal(f.host);
  const rule = await f.svc.createRule({
    principal: p,
    chatId: f.chatId,
    name: opts.name,
    trigger: opts.trigger ?? CHAT_OPENED,
    predicateCel: null,
    actions: opts.actions ?? [SET_VAR],
    matchAutomationEvents: opts.matchAutomationEvents ?? false,
    cooldownSeconds: opts.cooldownSeconds ?? 0,
    maxFiresPerHour: opts.maxFiresPerHour ?? 30,
  });
  await f.svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });
  return rule.id;
}

/** Fire `chatOpened` `n` times sequentially (recursion — each handleEvent mutates the shared store/index). */
async function fireOpenedN(f: Fixture, n: number): Promise<void> {
  if (n <= 0) {
    return;
  }
  await f.svc.handleEvent(chatOpened(f.chatId));
  await fireOpenedN(f, n - 1);
}

/** Ops whose `getTurnOrigin` reports a fixed cascade depth (the depth-gate probe). The A6 write ops are inert
 *  (this suite exercises the depth gate, never a real arm). */
function depthOps(depth: number): AutomationOps {
  return {
    tools: NO_TOOLS,
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve({ initiator: "automation" as const, automationDepth: depth }),
      // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
      listBackgroundChoices: () => Promise.resolve([]),
      setChatBackground: () => Promise.resolve(),
      requestTurn: () => Promise.resolve({ costUsd: null, messageCount: 0 }),
    },
    worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
    notifications: { emit: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ costUsd: null, imageCount: 0 }) },
    summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
  };
}

function turnCompleted(chatId: ChatId): { type: "turnCompleted"; chatId: ChatId; intent: "send"; messageId: MessageId } {
  return { type: "turnCompleted", chatId, intent: "send", messageId: mintTypeId(ID_PREFIX.message) };
}

function turnStarted(chatId: ChatId): {
  type: "turnStarted";
  chatId: ChatId;
  intent: "send";
  api: "chat-completions";
  provider: ProviderId;
  model: string;
  speakerCharacterId: null;
  targetMessageId: null;
} {
  return {
    type: "turnStarted",
    chatId,
    intent: "send",
    api: "chat-completions",
    provider: castId<ProviderId>("openrouter"),
    model: "gpt",
    speakerCharacterId: null,
    targetMessageId: null,
  };
}

describe("automation handleEvent — the A5 dispatch engine", () => {
  test("fires a rule end-to-end off a real chat event", async () => {
    const f = await setup();
    const ruleId = await armRule(f, { name: "on open" });

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(f.calls).toEqual(["mood"]);
    const fires = await f.svc.listFires({ principal: principal(f.host), ruleId });
    expect(fires.map((x) => x.outcome)).toEqual(["fired"]);
    expect(f.events).toContainEqual({ type: "ruleFired", chatId: f.chatId, ruleId });
  });

  test("runs sibling rules' arms in position order", async () => {
    const f = await setup();
    await armRule(f, { name: "first", actions: [{ type: "set_variable", scope: "chat", key: "a", op: "set", value: "1" }] });
    await armRule(f, { name: "second", actions: [{ type: "set_variable", scope: "chat", key: "b", op: "set", value: "2" }] });

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(f.calls).toEqual(["a", "b"]);
  });

  test("isolates a throwing rule — siblings still fire", async () => {
    const f = await setup();
    const ok1 = await armRule(f, { name: "ok1", actions: [{ type: "set_variable", scope: "chat", key: "a", op: "set", value: "1" }] });
    const boom = await armRule(f, { name: "boom", actions: [{ type: "set_variable", scope: "chat", key: "x", op: "set", value: "boom" }] });
    const ok2 = await armRule(f, { name: "ok2", actions: [{ type: "set_variable", scope: "chat", key: "c", op: "set", value: "3" }] });

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(f.calls).toEqual(["a", "c"]);
    const p = principal(f.host);
    expect((await f.svc.listFires({ principal: p, ruleId: ok1 }))[0]?.outcome).toBe("fired");
    expect((await f.svc.listFires({ principal: p, ruleId: boom }))[0]?.outcome).toBe("action_error");
    expect((await f.svc.listFires({ principal: p, ruleId: ok2 }))[0]?.outcome).toBe("fired");
  });

  test("does NOTHING for a chat with no enabled rule (the pre-check no-op)", async () => {
    const f = await setup();
    const rule = await f.svc.createRule({
      principal: principal(f.host),
      chatId: f.chatId,
      name: "disabled",
      trigger: CHAT_OPENED,
      predicateCel: null,
      actions: [SET_VAR],
    });
    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(f.calls).toEqual([]);
    expect(await f.svc.listFires({ principal: principal(f.host), ruleId: rule.id })).toEqual([]);
  });

  test("refuses a rule inside its cooldown window (budget_refused, not an error)", async () => {
    const f = await setup();
    const ruleId = await armRule(f, { name: "cooldown", cooldownSeconds: 60 });

    await f.svc.handleEvent(chatOpened(f.chatId)); // fires, stamps last_fired_at = the fixed clock
    await f.svc.handleEvent(chatOpened(f.chatId)); // same instant — inside the 60s cooldown

    expect(f.calls).toEqual(["mood"]); // the arm ran ONCE
    const outcomes = (await f.svc.listFires({ principal: principal(f.host), ruleId })).map((x) => x.outcome);
    expect(outcomes).toContain("fired");
    expect(outcomes).toContain("budget_refused");
  });

  // #1423 — the front door SERIALIZES same-chat events, so a second event raised while the first is mid-arm
  // is QUEUED, not concurrent: it cannot reach the arm because it has not started, and when it does start the
  // first rule's cooldown is already committed. (The reservation belt these two cases used to prove at this
  // seam is still proven under REAL concurrency, one layer down where the lane does not reach —
  // `engine/dispatch.int.test.ts`'s held-reservation case. The lane is process-local; the reservation is not.)
  test("a second same-chat event raised mid-arm never runs beside the first — it is queued, and lands on the committed cooldown", async () => {
    const entered = deferred();
    const release = deferred();
    let attempts = 0;
    const f = await setup({
      runArm: async (): Promise<{ readonly ok: true }> => {
        attempts += 1;
        if (attempts === 1) {
          entered.resolve();
          await release.promise;
        }
        return { ok: true };
      },
    });
    const ruleId = await armRule(f, { name: "held cooldown", cooldownSeconds: 60 });

    const first = f.svc.handleEvent(chatOpened(f.chatId));
    await entered.promise;
    // NOT awaited here: the second event is queued behind the first, so awaiting it before releasing the arm
    // would deadlock — which is the serialization, observed.
    const second = f.svc.handleEvent(chatOpened(f.chatId));
    const attemptsWhileHeld = attempts;
    release.resolve();
    await Promise.all([first, second]);

    expect(attemptsWhileHeld).toBe(1);
    expect(attempts).toBe(1);
    const outcomes = (await f.svc.listFires({ principal: principal(f.host), ruleId })).map((row) => row.outcome);
    expect(outcomes).toContain("fired");
    expect(outcomes).toContain("budget_refused");
  });

  test("a queued event behind a FAILED one still runs — the failure released its reservation and the retry fires", async () => {
    const entered = deferred();
    const release = deferred();
    let attempts = 0;
    const f = await setup({
      runArm: async () => {
        attempts += 1;
        if (attempts === 1) {
          entered.resolve();
          await release.promise;
          return { ok: false as const, kind: "arm_error" as const, detail: "held failure" };
        }
        return { ok: true as const };
      },
    });
    const ruleId = await armRule(f, { name: "held failure", cooldownSeconds: 60 });

    const first = f.svc.handleEvent(chatOpened(f.chatId));
    await entered.promise;
    const second = f.svc.handleEvent(chatOpened(f.chatId)); // queued behind `first` (#1423) — see the case above.
    const attemptsWhileHeld = attempts;
    release.resolve();
    await Promise.all([first, second]);
    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(attemptsWhileHeld).toBe(1);
    expect(attempts).toBe(2);
    const outcomes = (await f.svc.listFires({ principal: principal(f.host), ruleId })).map((row) => row.outcome);
    expect(outcomes).toContain("action_error");
    expect(outcomes).toContain("budget_refused");
    expect(outcomes).toContain("fired");
  });

  test("suggest-only and mid-dispatch pause terminals release their held reservation", async () => {
    let suggestedCalls = 0;
    const suggested = await setup({
      runArm: (): Promise<{ readonly ok: true; readonly suggested: true }> => {
        suggestedCalls += 1;
        return Promise.resolve({ ok: true, suggested: true });
      },
    });
    const suggestedRule = await armRule(suggested, { name: "suggest-only", maxFiresPerHour: 1 });
    await suggested.svc.handleEvent(chatOpened(suggested.chatId));
    await suggested.svc.handleEvent(chatOpened(suggested.chatId));
    expect(suggestedCalls).toBe(2);
    await expect(suggested.svc.listFires({ principal: principal(suggested.host), ruleId: suggestedRule })).resolves.toEqual([]);

    let pausedCalls = 0;
    const paused = await setup({
      tools: {
        isToolDrivableBy: (): boolean => true,
        runTool: () => Promise.resolve({ ok: false, reason: "unavailable" }),
      },
      runArm: (): Promise<{ readonly ok: false; readonly kind: "paused" }> => {
        pausedCalls += 1;
        return Promise.resolve({ ok: false, kind: "paused" });
      },
    });
    const pausedRule = await armRule(paused, {
      name: "mid-dispatch pause",
      actions: [{ type: "run_tool", name: "plugin_tool" }],
      maxFiresPerHour: 1,
    });
    await paused.svc.handleEvent(chatOpened(paused.chatId));
    await paused.svc.handleEvent(chatOpened(paused.chatId));
    expect(pausedCalls).toBe(2);
    await expect(paused.svc.listFires({ principal: principal(paused.host), ruleId: pausedRule })).resolves.toEqual([]);
  });

  test("hard-caps the cascade at depth 3 (depth_refused)", async () => {
    const f = await setup({ ops: depthOps(3) });
    const ruleId = await armRule(f, { name: "cap", trigger: TURN_COMPLETED, matchAutomationEvents: true });

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.calls).toEqual([]);
    expect((await f.svc.listFires({ principal: principal(f.host), ruleId }))[0]?.outcome).toBe("depth_refused");
  });

  test("silently suppresses an un-opted cascade at depth 1 (no fire row)", async () => {
    const f = await setup({ ops: depthOps(1) });
    const ruleId = await armRule(f, { name: "sup", trigger: TURN_COMPLETED, matchAutomationEvents: false });

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(f.calls).toEqual([]);
    expect(await f.svc.listFires({ principal: principal(f.host), ruleId })).toEqual([]);
  });

  test("a transform_draft rule is NOT watcher-dispatched (no arm, no fire row — A7 pipeline-owned)", async () => {
    const f = await setup();
    const p = principal(f.host);
    // A transform-only rule on turnStarted registers into the prompt pipeline; the watcher must skip it (else
    // its arm records a spurious action_error every turn).
    const rule = await f.svc.createRule({
      principal: p,
      chatId: f.chatId,
      name: "xf",
      trigger: { bus: "chat", type: "turnStarted" },
      predicateCel: null,
      actions: [{ type: "transform_draft", target: "user_input", template: "{{draft}}" }],
    });
    await f.svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    await f.svc.handleEvent(turnStarted(f.chatId));

    expect(f.calls).toEqual([]);
    expect(await f.svc.listFires({ principal: p, ruleId: rule.id })).toEqual([]);
  });

  test("auto-disables a rule after the consecutive-error ceiling", async () => {
    const failDispatch: ArmDispatch = () => Promise.resolve({ ok: false as const, kind: "arm_error" as const, detail: "always fails" });
    const f = await setup({ runArm: failDispatch });
    const ruleId = await armRule(f, { name: "flaky" });

    await fireOpenedN(f, 20);

    expect(f.events).toContainEqual({ type: "ruleAutoDisabled", chatId: f.chatId, ruleId });
    const rules = await f.svc.listRules({ principal: principal(f.host), chatId: f.chatId });
    expect(rules.find((r) => r.id === ruleId)?.enabled).toBe(false);
  });

  test("records authority_refused (never fires) when the author lost host authority since creating the rule", async () => {
    const f = await setup();
    const ruleId = await armRule(f, { name: "ex-host rule" });
    // The author was host at create/enable, then got demoted to member (a host-handoff). The DISPATCH-time
    // `holdsAuthority` re-check (03 §2) must catch this: `can(author, "host", …)` throws for a member role, so
    // the rule records `authority_refused` and its arms NEVER run — a demoted ex-host cannot wield stale authority.
    await f.db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, f.chatId), eq(chatParticipants.userId, f.host), isNull(chatParticipants.leftSeq)));

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(f.calls).toEqual([]); // no arm ran
    // Read the fire log via persistence (the `listFires` verb is host-gated — the author just LOST host).
    const fires = await listFiresForRule(f.db, ruleId);
    expect(fires[0]?.outcome).toBe("authority_refused");
    expect(f.events).toContainEqual({ type: "ruleErrored", chatId: f.chatId, ruleId });
  });
});

// F2 — the shared-env WRITE-THROUGH: a `set_variable` chat-scope arm mutates the SHARED, cached CEL env, so a
// LATER arm in the same rule AND a later rule on the same chat in the same batch observe the write. Uses the
// REAL arm executors over a capturing `applyVariableOps` (the env starts empty — the read-through must come from
// the in-memory write, not the DB). This is the "order IS semantics" invariant, tested against real dispatch.
describe("F2 shared-env write-through (order is semantics)", () => {
  /** Real arm executors + a capturing var store; `readVariables` returns `{}` so the env is born empty. */
  function realArmOps(db: Awaited<ReturnType<typeof freshDb>>, captured: VarOp[]): { runArm: ArmDispatch; ops: AutomationOps } {
    const ops: AutomationOps = {
      tools: NO_TOOLS,
      chat: {
        getMessageFact: () => Promise.resolve(null),
        getTurnOrigin: () => Promise.resolve(null),
        // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
        resolveViewerVisibility: () => Promise.resolve(null),
        readVariables: () => Promise.resolve({}),
        readChoicePicks: () => Promise.resolve({}),
        resolveChatProse: () => Promise.resolve({}),
        applyVariableOps: (_chatId, varOps) => {
          captured.push(...varOps);
          return Promise.resolve({ outcome: "applied" });
        },
        listBackgroundChoices: () => Promise.resolve([]),
        setChatBackground: () => Promise.resolve(),
        requestTurn: () => Promise.resolve({ costUsd: null, messageCount: 0 }),
      },
      worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
      notifications: { emit: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ costUsd: null, imageCount: 0 }) },
      summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
    };
    return {
      runArm: createArmExecutors({
        db,
        ops,
        prng: () => 0.42,
        notify: () => undefined,
        suggestions: createSuggestionStore(),
        newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
      }),
      ops,
    };
  }

  test("in-rule: [set hp=5, inc hp] composes to 6 (the DB alone is stale — write-through is the mechanism)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const captured: VarOp[] = [];
    const { runArm, ops } = realArmOps(db, captured);
    const ctx = makeAutomationHarness(db, { runArm, ops });
    const svc = createAutomationService(ctx);
    const p = principal(host);
    const rule = await svc.createRule({
      principal: p,
      chatId,
      name: "hp",
      trigger: CHAT_OPENED,
      predicateCel: null,
      actions: [
        { type: "set_variable", scope: "chat", key: "hp", op: "set", value: "5" },
        { type: "set_variable", scope: "chat", key: "hp", op: "inc" },
      ],
    });
    await svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    await svc.handleEvent(chatOpened(chatId));

    // The inc read the just-set 5 (via write-through), not the stale DB/empty 0 → the second write is hp=6.
    expect(captured).toEqual([
      { op: "set", key: "hp", value: "5" },
      { op: "set", key: "hp", value: "6" },
    ]);
    expect((await svc.listFires({ principal: p, ruleId: rule.id }))[0]?.outcome).toBe("fired");
  });

  test("cross-rule: rule B's predicate sees rule A's earlier write on the same chat/batch (read-after-write)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const captured: VarOp[] = [];
    const { runArm, ops } = realArmOps(db, captured);
    const ctx = makeAutomationHarness(db, { runArm, ops });
    const svc = createAutomationService(ctx);
    const p = principal(host);
    // Rule A (position 0) sets the flag; Rule B (position 1) fires ONLY if it observes A's write.
    const ruleA = await svc.createRule({
      principal: p,
      chatId,
      name: "A-set",
      trigger: CHAT_OPENED,
      predicateCel: null,
      actions: [{ type: "set_variable", scope: "chat", key: "ready", op: "set", value: "yes" }],
    });
    const ruleB = await svc.createRule({
      principal: p,
      chatId,
      name: "B-react",
      trigger: CHAT_OPENED,
      predicateCel: 'vars.ready == "yes"',
      actions: [{ type: "set_variable", scope: "chat", key: "reacted", op: "set", value: "1" }],
    });
    await svc.setRuleEnabled({ principal: p, ruleId: ruleA.id, enabled: true });
    await svc.setRuleEnabled({ principal: p, ruleId: ruleB.id, enabled: true });

    await svc.handleEvent(chatOpened(chatId));

    // B FIRED — its predicate read A's write-through value. Without write-through B's env.vars.ready was stale
    // (empty), the predicate was false, and B never wrote `reacted`.
    expect(captured).toContainEqual({ op: "set", key: "reacted", value: "1" });
    expect((await svc.listFires({ principal: p, ruleId: ruleB.id }))[0]?.outcome).toBe("fired");
  });
});

// F3 — the DURABLE auto-disable notice. At the 20-error ceiling the rule disables; besides the transient
// `ruleAutoDisabled` bus event (a no-op sink until A8b), a durable `automation-notice` MUST reach the author
// through the notifications inbox — else a rotting rule is invisible today.
describe("F3 durable auto-disable author notice", () => {
  test("auto-disable emits an automation-notice to the rule author via notifications.emit", async () => {
    const notices: NotificationEvent[] = [];
    // Capturing notifications op; every other op is inert (this suite only drives the error ceiling).
    const ops: AutomationOps = {
      tools: NO_TOOLS,
      chat: {
        getMessageFact: () => Promise.resolve(null),
        getTurnOrigin: () => Promise.resolve(null),
        // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
        resolveViewerVisibility: () => Promise.resolve(null),
        readVariables: () => Promise.resolve({}),
        readChoicePicks: () => Promise.resolve({}),
        resolveChatProse: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
        listBackgroundChoices: () => Promise.resolve([]),
        setChatBackground: () => Promise.resolve(),
        requestTurn: () => Promise.resolve({ costUsd: null, messageCount: 0 }),
      },
      worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
      notifications: {
        emit: (event) => {
          notices.push(event);
          return Promise.resolve();
        },
      },
      imagery: { generatePicture: () => Promise.resolve({ costUsd: null, imageCount: 0 }) },
      summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
    };
    const failDispatch: ArmDispatch = () => Promise.resolve({ ok: false as const, kind: "arm_error" as const, detail: "always fails" });
    const f = await setup({ runArm: failDispatch, ops });
    const ruleId = await armRule(f, { name: "flaky" });

    await fireOpenedN(f, 20);

    const autoNotice = notices.find((n) => n.type === "automation-notice");
    expect(autoNotice).toBeDefined();
    // The durable notice targets the AUTHOR, deep-links the rule, and carries a clear disabled message.
    expect(autoNotice).toMatchObject({ type: "automation-notice", recipientUserId: f.host, chatId: f.chatId, source: { kind: "rule", ruleId } });
    expect(autoNotice?.type === "automation-notice" ? autoNotice.message : "").toContain("auto-disabled");
    // No SPURIOUS notice before the ceiling — exactly one durable notice at the disable.
    expect(notices.filter((n) => n.type === "automation-notice")).toHaveLength(1);
  });
});

// F5 — the abort-path cascade-guard hole (containment). An automation-INITIATED turn that ABORTS emits
// `turnAborted` carrying its OWN depth; the fact-resolver reads it (no reply slot exists). A depth ≥ 1 aborted
// turn's fact is depth ≥ 1, so a non-opted `turnAborted` rule is SUPPRESSED — closing the "retry on failure"
// self-loop (a depth-0 hardcode let it re-fire forever, bounded only by spend/hourly budget).
describe("F5 abort-path cascade guard (self-loop closed)", () => {
  function turnAborted(
    chatId: ChatId,
    automationDepth: number,
  ): { type: "turnAborted"; chatId: ChatId; intent: "send"; reason: "error"; automationDepth: number } {
    return { type: "turnAborted", chatId, intent: "send", reason: "error", automationDepth };
  }

  test("a non-opted turnAborted rule does NOT re-fire on a depth≥1 aborted automation turn (self-loop closed)", async () => {
    const f = await setup();
    // A "retry on failure" style rule: reacts to turnAborted, NOT opted into automation events.
    const ruleId = await armRule(f, { name: "retry-on-abort", trigger: { bus: "chat", type: "turnAborted" }, matchAutomationEvents: false });

    // The aborting turn was itself automation-initiated (depth 1) → the event carries depth 1.
    await f.svc.handleEvent(turnAborted(f.chatId, 1));

    // Suppressed at the cascade gate — no arm ran, no fire row (a default-suppressed cascade event records nothing).
    expect(f.calls).toEqual([]);
    expect(await f.svc.listFires({ principal: principal(f.host), ruleId })).toEqual([]);
  });

  test("a human-plane aborted turn (depth 0) DOES fire the turnAborted rule (the guard doesn't over-suppress)", async () => {
    const f = await setup();
    const ruleId = await armRule(f, { name: "on-human-abort", trigger: { bus: "chat", type: "turnAborted" }, matchAutomationEvents: false });

    await f.svc.handleEvent(turnAborted(f.chatId, 0));

    expect(f.calls).toEqual(["mood"]);
    expect((await f.svc.listFires({ principal: principal(f.host), ruleId }))[0]?.outcome).toBe("fired");
  });
});

// N1 — the F1 image-post self-loop (containment; the F5 mechanism on the NEW write path). The F1 fix made a
// `generate_image` rule POST its result to chat via `postNarratorMessage`. If that post is committed at the DB
// default origin (`human`/0), the posted image's `messageCommitted` fact rides at depth 0, so a non-opted
// `messageCommitted → generate_image` rule RE-FIRES on its own post — one user message ⇒ ~10 generations
// before `budget_refused` terminates it. The fix threads the firing rule's automation origin through
// `postNarratorMessage` so the posted image's slot carries `initiator:"automation"` + depth ≥ 1; the resulting
// re-fire event resolves at depth ≥ 1 and `runGates` cascade-suppresses a non-opted rule. Driven through REAL
// dispatch + the REAL `postNarratorMessage` verb (the actual F1 seam), exactly like F5's real-path test.
describe("N1 image-post cascade guard (F1 self-loop closed)", () => {
  // The rule's arm: a `generate_image` with the schema defaults spelled out (createRule re-parses, but the TS
  // `AutomationActionInput` union requires the full shape). `quiet:false` ⇒ it POSTS (the F1 path under test).
  const genImageAction: AutomationActionInput = {
    type: "generate_image",
    mode: "free",
    n: 1,
    useAvatarReference: false,
    reuse: "prefer",
    quiet: false,
  };

  /** Build a REAL imagery op that posts through the REAL `postNarratorMessage` (the compose F1 seam), stamping
   *  the automation origin exactly as `entry/compose/services.ts` does. Every posted `messageCommitted` event is
   *  captured so the test can feed it back into `handleEvent` (the re-fire path). Returns the wired arm
   *  executors + the captured-events sink. */
  async function realImageryPostOps(
    db: Awaited<ReturnType<typeof freshDb>>,
    host: UserId,
  ): Promise<{ runArm: ArmDispatch; ops: AutomationOps; posts: ChatBusEvent[] }> {
    const groupChar = await seedCharacter(db, host, "narrator");
    const asset = await seedAsset(db, host, "gen-art");
    const posts: ChatBusEvent[] = [];
    const chatCtx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(chatCtx, {
      claimChat: (): Promise<void> => Promise.resolve(),
      emit: (event) => {
        posts.push(event);
        return Promise.resolve();
      },
    });
    const ops: AutomationOps = {
      tools: NO_TOOLS,
      chat: {
        // Read ops off the REAL db (the fact resolver reads `getTurnOrigin` back off the posted slot). The
        // message projection must resolve too: since #1417 a `messageCommitted` whose slot cannot be read is
        // SKIPPED (an unknown cascade depth never degrades to a human-plane 0), so a `null` here would make
        // the re-fire path under test unreachable and this suite green for the wrong reason.
        getMessageFact: async (_chatId, messageId) => {
          const rows = await db
            .select({ id: messages.id, role: messages.role, authorUserId: messages.authorUserId, characterId: messages.characterId, seq: messages.seq })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
          const row = rows[0];
          return row === undefined ? null : { ...row, content: "" };
        },
        // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
        resolveViewerVisibility: () => Promise.resolve(null),
        getTurnOrigin: async (_chatId, messageId) => {
          const rows = await db
            .select({ initiator: messages.initiator, automationDepth: messages.automationDepth })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
          const row = rows[0];
          return row === undefined ? null : { initiator: row.initiator, automationDepth: row.automationDepth };
        },
        readVariables: () => Promise.resolve({}),
        readChoicePicks: () => Promise.resolve({}),
        resolveChatProse: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
        listBackgroundChoices: () => Promise.resolve([]),
        setChatBackground: () => Promise.resolve(),
        requestTurn: () => Promise.resolve({ costUsd: null, messageCount: 0 }),
      },
      worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
      notifications: { emit: () => Promise.resolve() },
      imagery: {
        // The F1 compose op: generate → (non-quiet) POST through `postNarratorMessage`, threading the firing
        // rule's automation origin so the posted image's slot is depth ≥ 1 (the N1 fix under test).
        generatePicture: async (req) => {
          // The non-quiet POST needs a room; a chat-less (owner-global) request cannot reach it — the
          // automation admission matrix refuses a non-quiet global `generate_image` for exactly that reason.
          if (!req.quiet && req.chatId !== null) {
            await postNarratorMessage(req.chatId, req.prompt ?? "", [asset], { initiator: "automation", automationDepth: req.automationDepth });
          }
          return { costUsd: null, imageCount: 1 };
        },
      },
      summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
    };
    return {
      runArm: createArmExecutors({
        db,
        ops,
        prng: () => 0.42,
        notify: () => undefined,
        suggestions: createSuggestionStore(),
        newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
      }),
      ops,
      posts,
    };
  }

  /** The re-fire event a posted image raises — the exact `messageCommitted` the narrator op emitted. */
  function messageCommittedEvent(post: ChatBusEvent): ChatBusEvent {
    return { type: "messageCommitted", chatId: (post as { chatId: ChatId }).chatId, messageId: (post as { messageId: MessageId }).messageId };
  }

  /** Feed each captured post's `messageCommitted` back into `handleEvent`, one at a time. The queue grows as
   * opted-in re-fires post deeper images; `ceiling` bounds an accidental self-loop. */
  async function drainPosts(svc: AutomationService, posts: readonly ChatBusEvent[], cursor: number, ceiling: number): Promise<number> {
    let next = cursor;
    while (next < posts.length && next < ceiling) {
      await svc.handleEvent(messageCommittedEvent(posts[next] as ChatBusEvent));
      next += 1;
    }
    return next;
  }

  test("a non-opted `messageCommitted → generate_image` rule does NOT re-fire on its own posted image (self-loop closed)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const { runArm, ops, posts } = await realImageryPostOps(db, host);
    const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops }));
    const p = principal(host);
    const rule = await svc.createRule({
      principal: p,
      chatId,
      name: "on-message-gen",
      trigger: { bus: "chat", type: "messageCommitted" },
      predicateCel: null,
      actions: [genImageAction],
      matchAutomationEvents: false,
    });
    await svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    // A HUMAN message (depth 0) triggers the rule → it generates + posts one image (stamped depth 1). The
    // row is SEEDED, not merely named: since #1417 a `messageCommitted` whose slot cannot be read back is
    // skipped, so a minted-but-absent id would make this whole chain unreachable.
    const human = await seedMessage(db, chatId, 1, { content: "look at this" });
    await svc.handleEvent({ type: "messageCommitted", chatId, messageId: human.messageId });
    expect(posts).toHaveLength(1); // exactly ONE post from the human-triggered fire

    // The posted image's own `messageCommitted` — the self-loop trigger. Depth-1 (automation) origin ⇒ the
    // non-opted rule is cascade-suppressed at the gate: no second generation, no second post.
    await svc.handleEvent(messageCommittedEvent(posts[0] as ChatBusEvent));

    expect(posts).toHaveLength(1); // STILL one — the re-fire was suppressed (no runaway generation)
    const fires = await svc.listFires({ principal: p, ruleId: rule.id });
    expect(fires.map((x) => x.outcome)).toEqual(["fired"]); // one fire (the human trigger); the re-fire recorded nothing
  });

  test("an OPTED-IN rule re-fires on its own posts but is DEPTH-BOUNDED, not infinite (cap terminates the chain)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const { runArm, ops, posts } = await realImageryPostOps(db, host);
    const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops }));
    const p = principal(host);
    // Opted into automation events ⇒ it INTENDS to react to automation-initiated posts. It still must not loop
    // forever — the cascade depth cap (AUTOMATION_DEPTH_HARD_CAP = 3) bounds the chain.
    const rule = await svc.createRule({
      principal: p,
      chatId,
      name: "cascading-gen",
      trigger: { bus: "chat", type: "messageCommitted" },
      predicateCel: null,
      actions: [genImageAction],
      matchAutomationEvents: true,
    });
    await svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    // Drain the cascade to a FIXED ceiling: each re-fire raises a deeper `messageCommitted`; a real self-loop
    // would never stop appending. `cursor` catching up to `posts.length` before the ceiling proves termination.
    const drainCeiling = 20;
    const human = await seedMessage(db, chatId, 1, { content: "look at this" }); // a REAL slot — see the case above (#1417).
    await svc.handleEvent({ type: "messageCommitted", chatId, messageId: human.messageId });
    const cursor = await drainPosts(svc, posts, 0, drainCeiling);

    // Human msg (depth 0) → post @depth1 → post @depth2 → post @depth3 → depth-3 event REFUSED (no post).
    // So the chain TERMINATES at exactly 3 posts, and the queue drained fully (cursor caught up) — bounded.
    expect(posts).toHaveLength(3);
    expect(cursor).toBe(posts.length); // fully drained without hitting the drain ceiling
    const fires = await svc.listFires({ principal: p, ruleId: rule.id });
    expect(fires.filter((x) => x.outcome === "fired")).toHaveLength(3);
    expect(fires.some((x) => x.outcome === "depth_refused")).toBe(true);
  });
});

// W1 (#704) — the `worldInfoActivated` self-chain (containment; the F5/N1 mechanism on the WI-activation
// trigger). A turn-generating rule on `worldInfoActivated` (the reactToLoreActivation family) steers a reaction
// turn; that turn re-runs assembly and can RE-ACTIVATE the same lore, raising a fresh `worldInfoActivated`.
// The activation is emitted mid-assembly, BEFORE the reply slot commits, so its depth cannot be read back
// through `getTurnOrigin` — it rides the EVENT (the `turnAborted` mechanism), carrying the generating turn's
// own cascade depth (`engine.ts turnCascadeDepth(prep)`). A pre-fix hardcode of `automationDepth: 0` in the
// fact-resolver made every re-activation look human-plane, so the depth never escalated and the cap never bit —
// the rule self-chained, bounded only by a per-preset `cooldownSeconds` belt. Driven through REAL arm executors
// + a `requestTurn` op that simulates the engine's WI-activation emit (the actual seam), exactly like N1.
describe("W1 world-info-activation cascade guard (self-chain closed, #704)", () => {
  // `confirmFirst:false` ⇒ the arm triggers the turn immediately (not a confirm-first suggestion).
  const triggerTurn: AutomationActionInput = { type: "trigger_turn", confirmFirst: false };

  /** REAL arm executors whose `requestTurn` op simulates chat's engine: the reaction turn generates and
   *  re-activates the same lore, emitting `worldInfoActivated` carrying THIS turn's own cascade depth
   *  (`origin.automationDepth`, threaded through the arm to `req.automationDepth`). Every simulated activation
   *  is captured so the test can feed it back into `handleEvent` (the re-fire path). */
  function loreReactionOps(db: Awaited<ReturnType<typeof freshDb>>): { runArm: ArmDispatch; ops: AutomationOps; activations: ChatBusEvent[] } {
    const activations: ChatBusEvent[] = [];
    const ops: AutomationOps = {
      tools: NO_TOOLS,
      chat: {
        // The resolver reads the WI-activation depth OFF THE EVENT — no committed slot exists mid-assembly, so
        // these reads stay inert (never consulted for this trigger).
        getMessageFact: () => Promise.resolve(null),
        getTurnOrigin: () => Promise.resolve(null),
        resolveViewerVisibility: () => Promise.resolve(null),
        readVariables: () => Promise.resolve({}),
        readChoicePicks: () => Promise.resolve({}),
        resolveChatProse: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
        listBackgroundChoices: () => Promise.resolve([]),
        setChatBackground: () => Promise.resolve(),
        requestTurn: (req) => {
          activations.push({
            type: "worldInfoActivated",
            chatId: req.chatId,
            entryIds: [mintTypeId(ID_PREFIX.worldEntry)],
            automationDepth: req.automationDepth,
          });
          return Promise.resolve({ costUsd: null, messageCount: 1 });
        },
      },
      worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
      notifications: { emit: () => Promise.resolve() },
      imagery: { generatePicture: () => Promise.resolve({ costUsd: null, imageCount: 0 }) },
      summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
    };
    return {
      runArm: createArmExecutors({
        db,
        ops,
        prng: () => 0.42,
        notify: () => undefined,
        suggestions: createSuggestionStore(),
        newSuggestionId: () => mintTypeId(ID_PREFIX.automationSuggestion),
      }),
      ops,
      activations,
    };
  }

  /** A lore-activation event carrying the generating turn's cascade `depth` (0 = a human-plane turn). */
  function worldInfoActivated(chatId: ChatId, depth: number): ChatBusEvent {
    return { type: "worldInfoActivated", chatId, entryIds: [mintTypeId(ID_PREFIX.worldEntry)], automationDepth: depth };
  }

  /** Feed each captured re-activation back into `handleEvent`, one at a time. The queue grows as opted-in
   * re-fires raise deeper activations; `ceiling` bounds an accidental self-chain. */
  async function drainActivations(svc: AutomationService, activations: readonly ChatBusEvent[], cursor: number, ceiling: number): Promise<number> {
    let next = cursor;
    while (next < activations.length && next < ceiling) {
      await svc.handleEvent(activations[next] as ChatBusEvent);
      next += 1;
    }
    return next;
  }

  test("a non-opted `worldInfoActivated → trigger_turn` rule does NOT re-fire on its reaction turn's own re-activation (self-loop closed)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const { runArm, ops, activations } = loreReactionOps(db);
    const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops }));
    const p = principal(host);
    const rule = await svc.createRule({
      principal: p,
      chatId,
      name: "react-to-lore",
      trigger: { bus: "chat", type: "worldInfoActivated" },
      predicateCel: null,
      actions: [triggerTurn],
      matchAutomationEvents: false,
    });
    await svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    // NORMAL PATH: a human turn's activation (depth 0) DOES fire the rule — it steers one reaction turn, which
    // re-activates the lore at depth 1. The guard never over-suppresses the human plane.
    await svc.handleEvent(worldInfoActivated(chatId, 0));
    expect(activations).toHaveLength(1);

    // The reaction turn's own re-activation (depth 1, automation-plane) — a non-opted rule is cascade-suppressed
    // at the gate: no second reaction, no runaway. (Pre-fix, the depth-0 hardcode made this look human-plane and
    // the rule re-fired forever.)
    await svc.handleEvent(activations[0] as ChatBusEvent);

    expect(activations).toHaveLength(1); // STILL one — the re-fire was suppressed
    const fires = await svc.listFires({ principal: p, ruleId: rule.id });
    expect(fires.map((x) => x.outcome)).toEqual(["fired"]); // exactly one fire (the human trigger)
  });

  test("an OPTED-IN rule re-fires on its reaction turns but is DEPTH-BOUNDED, not infinite (the cap terminates the chain)", async () => {
    const db = await freshDb();
    const host = await seedUser(db, "user_host");
    const chatId = await seedHostChat(db, host);
    const { runArm, ops, activations } = loreReactionOps(db);
    const svc = createAutomationService(makeAutomationHarness(db, { runArm, ops }));
    const p = principal(host);
    // Opted into automation events ⇒ it INTENDS to react to automation-plane re-activations. It still must not
    // loop forever — the cascade depth cap (AUTOMATION_DEPTH_HARD_CAP = 3) bounds the chain.
    const rule = await svc.createRule({
      principal: p,
      chatId,
      name: "cascading-react",
      trigger: { bus: "chat", type: "worldInfoActivated" },
      predicateCel: null,
      actions: [triggerTurn],
      matchAutomationEvents: true,
    });
    await svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });

    // Drain the cascade to a FIXED ceiling below the hourly budget: each re-fire raises a deeper activation; a
    // real self-chain would never stop appending. `cursor` catching `activations.length` before the ceiling
    // proves termination — NOT the wall-clock cooldown (there is none) and NOT the hourly budget (ceiling < 120).
    const drainCeiling = 12;
    await svc.handleEvent(worldInfoActivated(chatId, 0)); // human depth-0 seed → reaction @depth1
    const cursor = await drainActivations(svc, activations, 0, drainCeiling);

    // Human (0) → react @1 → react @2 → react @3 → the depth-3 activation is REFUSED (no reaction). The chain
    // TERMINATES at exactly 3 reaction turns, and the queue drained fully (cursor caught up) — bounded by depth.
    expect(activations).toHaveLength(3);
    expect(cursor).toBe(activations.length); // fully drained without hitting the drain ceiling
    const fires = await svc.listFires({ principal: p, ruleId: rule.id });
    expect(fires.filter((x) => x.outcome === "fired")).toHaveLength(3);
    expect(fires.some((x) => x.outcome === "depth_refused")).toBe(true);
  });
});

// -- #1423: the front door SERIALIZES a chat's events --------------------------------------------------------
// The watcher detached one `handleEvent` per bus event, so two events for one chat ran concurrently: both read
// the same variable snapshot, both computed an increment, both wrote the same next value. Dispatch is written
// throughout as if order were semantics (arms share a mutable env, `runDispatch` recurses, clock presets count
// beats) -- that promise held INSIDE one event and nowhere between two. The queue lives at this door, not in
// the watcher, because the D81 `chatOpened` tap feeds `handleEvent` straight from the composition root.
describe("#1423 same-chat events are serialized at the front door", () => {
  test("a second event never interleaves with the first -- it starts only after the first dispatch finishes", async () => {
    const order: string[] = [];
    const gate = deferred();
    let n = 0;
    const f = await setup({
      runArm: async (): Promise<{ readonly ok: true }> => {
        n += 1;
        const tag = `e${n}`;
        order.push(`${tag}:enter`);
        if (n === 1) {
          await gate.promise;
        }
        order.push(`${tag}:exit`);
        return { ok: true };
      },
    });
    await armRule(f, { name: "ordered" });

    // BOTH events are raised before either dispatch can finish -- the exact shape two rapid bus events have.
    const first = f.svc.handleEvent(chatOpened(f.chatId));
    const second = f.svc.handleEvent(chatOpened(f.chatId));
    await new Promise((resolve) => setTimeout(resolve, 0));
    gate.resolve();
    await Promise.all([first, second]);

    // Unserialized this reads ["e1:enter", "e2:enter", "e2:exit", "e1:exit"] -- the interleave, observed.
    expect(order).toEqual(["e1:enter", "e1:exit", "e2:enter", "e2:exit"]);
  });
});

// #1433 — WHICH BUS AN EVENT IS ON IS TUPLE MEMBERSHIP, not punctuation. The front door used to classify with
// `event.type.includes(".")`, which is a property of today's NAMES: nothing makes every DomainEventType
// dot-namespaced or forbids a ChatBusEvent from carrying a dot, so a future member of either union would take
// the wrong pre-check and the wrong rule loader and never dispatch despite sitting in the trigger map.
//
// THESE ARE FENCES, NOT RED-FIRST DEFECT PROOFS, and the label is deliberate: the two tuples happen to be
// dot-disjoint TODAY, so both arms pass against the pre-fix source too and a planted punctuation classifier
// does NOT make them fail (measured — the misroute needs a dotless domain event, which the closed unions
// make unconstructable from a test). They are REGRESSION fences over the routing rewrite: both lanes still
// dispatch, and a non-taxonomy event still drops. The CLASSIFIER's own contract — including the case the
// punctuation test got wrong — is pinned where a planted mutation does bite:
// `tests/contracts/automation/index.contract.test.ts` > "triggerBusOf".
describe("#1433 - bus routing derives from the trigger tuples", () => {
  test("a DOMAIN-bus rule fires on its domain event and a CHAT-bus rule on its chat event", async () => {
    const f = await setup();
    const p = principal(f.host);
    const chatRule = await f.svc.createRule({
      principal: p,
      chatId: f.chatId,
      name: "chat-lane",
      trigger: CHAT_OPENED,
      predicateCel: null,
      actions: [{ ...SET_VAR, key: "fromChat" }],
    });
    await f.svc.setRuleEnabled({ principal: p, ruleId: chatRule.id, enabled: true });
    const domainRule = await f.svc.createRule({
      principal: p,
      chatId: f.chatId,
      name: "domain-lane",
      trigger: { bus: "domain", type: "character.updated" },
      predicateCel: null,
      actions: [{ ...SET_VAR, key: "fromDomain" }],
    });
    await f.svc.setRuleEnabled({ principal: p, ruleId: domainRule.id, enabled: true });

    await f.svc.handleEvent(chatOpened(f.chatId));
    await f.svc.handleEvent({ type: "character.updated", characterId: mintTypeId(ID_PREFIX.character), contentChanged: true });
    expect(f.calls).toEqual(["fromChat", "fromDomain"]);
  });

  test("an event on NEITHER trigger tuple dispatches nothing, even in a chat that has enabled rules", async () => {
    const f = await setup();
    await armRule(f, { name: "listener" });
    // `messagesReordered` is a real ChatBusEvent and is NOT automation trigger vocabulary, so no stored rule
    // can name it (the db CHECK binds `trigger_type` to the tuples). The honest answer is a drop.
    await f.svc.handleEvent({ type: "messagesReordered", chatId: f.chatId });
    expect(f.calls).toEqual([]);
  });
});

// #1564 — the LAST unswept `reload()`. When a dispatch auto-disables a rule the front door reconciles the
// enabled index, and a failed rebuild there is the quietest form of the #1431 defect: `reload` throws into
// `createHandleEvent`'s self-safe wrapper, which logs and moves on, so the index is behind canon with NO latch
// for `healStaleIndexes` to notice and no caller to tell. `refresh` sets that latch.
test("#1564 — an index-refresh failure after a dispatch auto-disable LATCHES STALE instead of vanishing into the self-safe wrapper", async () => {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const failing = { fail: false };
  const enabled = createEnabledRuleIndex(readFailingDb(db, failing));
  const ctx = makeAutomationHarness(db, { enabled });
  const svc = createAutomationService(ctx);
  const rule = await svc.createRule({
    principal: principal(host),
    chatId,
    name: "doomed",
    trigger: CHAT_OPENED,
    predicateCel: null,
    actions: [SET_VAR],
  });
  await svc.setRuleEnabled({ principal: principal(host), ruleId: rule.id, enabled: true });
  await enabled.reload();
  // A blob no arm schema can parse ⇒ the dispatch DISABLES the rule ⇒ the reconcile under test.
  await db
    .update(automationRules)
    // @orb-waive no-test-fabrication(never): the A5 CORRUPT-BLOB state is by definition a value no schema admits — a typed factory Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    // could not produce it, and it is exactly the invalid input the disable-on-corrupt path exists to answer.
    .set({ actions: [{ not: "an arm" }] as never })
    .where(eq(automationRules.id, rule.id));

  failing.fail = true;
  await svc.handleEvent(chatOpened(chatId));

  expect(enabled.isStale()).toBe(true);
  // THE PREMISE, proven: the auto-disable really committed, so the reconcile really ran.
  const [view] = await svc.listRules({ principal: principal(host), chatId });
  expect(view?.enabled).toBe(false);
});

// #1554 — d11a0f6e9 (#1423) put ALL domain-bus dispatch behind ONE process-wide lane
// (`automation:domain`), so a slow arm on one owner's rule delayed every OTHER owner's unrelated rule too.
// Two owner-GLOBAL rules (`chatId: null`) each watching `character.updated` on their OWN owned character —
// the real shape (`livingLibrary`'s own catalogue row) — prove BOTH halves the restructure owes: two
// DIFFERENT owners' domain events interleave, and one owner's OWN two events still serialize (the exact
// #1423 property, now scoped to the OWNER key instead of the whole bus).
describe("#1554 domain-bus dispatch is keyed by OWNER, not one shared lane", () => {
  test("two owners' domain events interleave while one owner's own events still serialize", async () => {
    const order: string[] = [];
    const gates = { ownerA: deferred(), ownerA2: deferred() };
    let ownerAFires = 0;
    const f = await setup({
      runArm: async (action): Promise<{ readonly ok: true }> => {
        const arm = action as Extract<AutomationActionInput, { type: "set_variable" }>;
        const tag = arm.key;
        order.push(`${tag}:enter`);
        if (tag === "ownerA") {
          ownerAFires += 1;
          // The FIRST ownerA fire blocks on `gates.ownerA`; a SECOND ownerA fire (queued behind it on the
          // same owner lane) blocks on `gates.ownerA2` — two independent gates so the test can release them
          // one at a time and observe the queueing, exactly as #1423's same-chat pin does for one lane.
          await (ownerAFires === 1 ? gates.ownerA.promise : gates.ownerA2.promise);
        }
        order.push(`${tag}:exit`);
        return { ok: true };
      },
    });
    const ownerA = f.host;
    const ownerB = await seedUser(f.db, "user_owner_b");
    const characterA1 = await seedCharacter(f.db, ownerA, "card-a1");
    const characterA2 = await seedCharacter(f.db, ownerA, "card-a2");
    const characterB = await seedCharacter(f.db, ownerB, "card-b");

    async function armGlobalRule(owner: UserId, key: string): Promise<void> {
      const p = principal(owner);
      const rule = await f.svc.createRule({
        principal: p,
        chatId: null,
        name: `global-${key}`,
        trigger: { bus: "domain", type: "character.updated" },
        predicateCel: null,
        actions: [{ type: "set_variable", scope: "global", key, op: "set", value: "x" }],
      });
      await f.svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });
    }
    await armGlobalRule(ownerA, "ownerA");
    await armGlobalRule(ownerB, "ownerB");

    // ownerA's event and ownerB's event, both raised before either dispatch can finish -- the exact shape
    // two rapid domain-bus events have (a card import, a lore edit, seconds apart).
    const eventA1 = f.svc.handleEvent({ type: "character.updated", characterId: characterA1, contentChanged: true });
    const eventB = f.svc.handleEvent({ type: "character.updated", characterId: characterB, contentChanged: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // THE OLD SINGLE LANE'S SIGNATURE: unserialized-by-owner would read the same as this already does not
    // regress (both being blind lanes never contended), so the proof is what happens NEXT — ownerB's short
    // arm settles WHILE ownerA's is still parked, which the pre-#1554 single "automation:domain" lane could
    // never show (ownerB would not even ENTER until ownerA's exit).
    expect(order).toEqual(["ownerA:enter", "ownerB:enter", "ownerB:exit"]);

    // A SECOND ownerA event, raised while the first is still blocked -- it must queue behind ownerA's own
    // lane (never behind ownerB's, which has already drained) and must NOT start until the first exits.
    const eventA2 = f.svc.handleEvent({ type: "character.updated", characterId: characterA2, contentChanged: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["ownerA:enter", "ownerB:enter", "ownerB:exit"]); // ownerA2 has NOT entered yet.

    gates.ownerA.resolve();
    await eventA1;
    // The SECOND ownerA job's "enter" lands on the lane's own tail, one microtask after the first settles.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["ownerA:enter", "ownerB:enter", "ownerB:exit", "ownerA:exit", "ownerA:enter"]);

    gates.ownerA2.resolve();
    await Promise.all([eventB, eventA2]);
    expect(order).toEqual(["ownerA:enter", "ownerB:enter", "ownerB:exit", "ownerA:exit", "ownerA:enter", "ownerA:exit"]);
  });
});
