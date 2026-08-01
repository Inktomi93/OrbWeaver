// A5 — the watcher/dispatch engine, end-to-end off `handleEvent`. Arms are A6, so these tests inject test arm
// executors through the harness seam and assert the ENGINE: a rule fires end-to-end off a real bus event;
// arms run in position order over sibling rules; a throwing rule is isolated; the cascade-depth + cooldown
// gates bite; the error ceiling auto-disables; and a chat with zero enabled rules does NOTHING (the pre-check
// — the byte-identity no-op's server half).

import type { AutomationAction, AutomationBusEvent, AutomationTrigger } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import { chatParticipants, messages } from "@orb/db";
import type { AutomationRuleId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import type { ArmDispatch, AutomationOps } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/index.ts";
import { listFiresForRule } from "../../../../../packages/server/src/domain/automation/persistence/fires.ts";
import { createPostNarratorMessage } from "../../../../../packages/server/src/domain/chat/verbs/post-narrator-message.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedAsset, seedCharacter } from "../../chat/_support.ts";
import type { HarnessOverrides } from "../_support.ts";
import { makeAutomationHarness, principal, seedHostChat, seedUser } from "../_support.ts";

const CHAT_OPENED: AutomationTrigger = { bus: "chat", type: "chatOpened" };
const TURN_COMPLETED: AutomationTrigger = { bus: "chat", type: "turnCompleted" };
const SET_VAR: AutomationAction = { type: "set_variable", scope: "chat", key: "mood", op: "set", value: "grim" };

interface Fixture {
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  readonly calls: string[];
  readonly events: AutomationBusEvent[];
}

/** A dispatcher that records a set_variable arm's key, and throws on the `boom` sentinel value (isolation).
 *  These suites only fire `set_variable` rules, so it narrows via a cast (no discriminant guard). */
function recordingDispatch(calls: string[]): ArmDispatch {
  return (action): Promise<{ ok: true }> => {
    const arm = action as Extract<AutomationAction, { type: "set_variable" }>;
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
  });
  return { db, host, chatId, svc: createAutomationService(ctx), calls, events };
}

interface RuleOpts {
  readonly name: string;
  readonly trigger?: AutomationTrigger;
  readonly actions?: readonly AutomationAction[];
  readonly matchAutomationEvents?: boolean;
  readonly cooldownSeconds?: number;
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
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve({ initiator: "automation" as const, automationDepth: depth }),
      // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: () => Promise.resolve(),
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
  source: "openrouter";
  model: string;
  speakerCharacterId: null;
  targetMessageId: null;
} {
  return {
    type: "turnStarted",
    chatId,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
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
          return Promise.resolve();
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
    return { runArm: createArmExecutors({ db, ops, prng: () => 0.42, notify: () => undefined }), ops };
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
      chat: {
        getMessageFact: () => Promise.resolve(null),
        getTurnOrigin: () => Promise.resolve(null),
        // The visibility op is inert (fail-closed) — this suite never drives the plugin fan-out that consumes it.
        resolveViewerVisibility: () => Promise.resolve(null),
        readVariables: () => Promise.resolve({}),
        readChoicePicks: () => Promise.resolve({}),
        resolveChatProse: () => Promise.resolve({}),
        applyVariableOps: () => Promise.resolve(),
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
  // `AutomationAction` union requires the full shape). `quiet:false` ⇒ it POSTS (the F1 path under test).
  const genImageAction: AutomationAction = {
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
      emit: (event) => {
        posts.push(event);
        return Promise.resolve();
      },
    });
    const ops: AutomationOps = {
      chat: {
        // Read ops off the REAL db (the fact resolver reads `getTurnOrigin` back off the posted slot).
        getMessageFact: () => Promise.resolve(null),
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
        applyVariableOps: () => Promise.resolve(),
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
          if (!req.quiet) {
            await postNarratorMessage(req.chatId, req.prompt ?? "", [asset], { initiator: "automation", automationDepth: req.automationDepth });
          }
          return { costUsd: null, imageCount: 1 };
        },
      },
      summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
    };
    return { runArm: createArmExecutors({ db, ops, prng: () => 0.42, notify: () => undefined }), ops, posts };
  }

  /** The re-fire event a posted image raises — the exact `messageCommitted` the narrator op emitted. */
  function messageCommittedEvent(post: ChatBusEvent): ChatBusEvent {
    return { type: "messageCommitted", chatId: (post as { chatId: ChatId }).chatId, messageId: (post as { messageId: MessageId }).messageId };
  }

  /** Feed each captured post's `messageCommitted` back into `handleEvent`, one at a time (recursion — the queue
   *  grows as opted-in re-fires post deeper images). Returns the cursor once caught up, or bails at `ceiling`
   *  (an unbounded self-loop would never let the cursor catch `posts.length`). Recursive, not a loop, to keep
   *  the `noAwaitInLoops` gate green (the `fireOpenedN` precedent). */
  async function drainPosts(svc: AutomationService, posts: readonly ChatBusEvent[], cursor: number, ceiling: number): Promise<number> {
    if (cursor >= posts.length || cursor >= ceiling) {
      return cursor;
    }
    await svc.handleEvent(messageCommittedEvent(posts[cursor] as ChatBusEvent));
    return drainPosts(svc, posts, cursor + 1, ceiling);
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

    // A HUMAN message (depth 0) triggers the rule → it generates + posts one image (stamped depth 1).
    await svc.handleEvent({ type: "messageCommitted", chatId, messageId: mintTypeId(ID_PREFIX.message) });
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
    await svc.handleEvent({ type: "messageCommitted", chatId, messageId: mintTypeId(ID_PREFIX.message) });
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
