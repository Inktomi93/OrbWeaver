// .int tests for the D146-d PAUSE GATE in `engine/dispatch.ts` — "pause, don't rot".
//
// THE FAILURE THIS SUITE EXISTS TO PREVENT, stated once so a future reader knows what a red here means: a
// plugin is disabled, upgraded or uninstalled by ordinary user action at any time. If a rule naming that
// plugin's tool treated the disappearance as an ERROR, `arm_error` → `action_error` would increment
// `consecutive_errors`, the rule would AUTO-DISABLE at 20, the author would get a durable notice naming the
// RULE (not the plugin), and re-enabling the plugin would NOT bring the rule back. One toggle would silently
// eat every rule that mentions that plugin. A first-party contributor cannot vanish, so no other seam in this
// domain needs this; the contributor seam does, which is the whole reason D146-d exists as its own clause.
//
// The property being pinned is therefore NOT "a paused rule reports paused" — it is that a paused rule CHANGES
// NOTHING: no fire row, no error tick, no `last_fired_at`, no auto-disable, no arm effects. Self-healing is
// what falls out of that, and the re-enable row proves it costs no repair step.

import type { AutomationActionInput } from "@orb/contracts/automation";
import type { VariableWriteResult } from "@orb/contracts/chat";
import { automationRules, worldBooks } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AutomationRuleId, UserId, WorldBookId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { AutomationOps, AutomationToolOutcome, AutomationToolRequest } from "@orb/server/domain/automation";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ArmExecutorDeps, AutomationImageRequest, DispatchFrame } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { AutomationContext, AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createArmExecutors } from "../../../../../packages/server/src/domain/automation/engine/arm-executors.ts";
import { runDispatch } from "../../../../../packages/server/src/domain/automation/engine/dispatch.ts";
import { loadEnabledChatRules } from "../../../../../packages/server/src/domain/automation/persistence/rules.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/service.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { RuleFixture } from "../_support.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

/** The refusal CODE a rejected verb threw, or `null` when it resolved. Asserting the code rather than the
 *  message is what makes these pins about behaviour: the copy may be rewritten freely, and a DIFFERENT
 *  refusal firing in place of the intended one still reds. */
async function refusalCode(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return error instanceof DomainOperationError ? error.code : `unexpected:${error instanceof Error ? error.name : String(error)}`;
  }
}

const TOOL = "plugin_mood_report";
/** The auto-disable ceiling the rot would have walked to (`engine/dispatch.ts`). Restated rather than imported
 *  because it is a module-private const — if it MOVES, this suite's "20 events change nothing" row is still
 *  the honest shape of the claim, and the row asserting the rule is still enabled is what would catch a drift. */
const CONSECUTIVE_ERROR_DISABLE_AT = 20;

/** A stand-in for the plugin lifecycle: `installed` is the live registry, flipped by the tests the way an
 *  owner flips a plugin. `asks` records every reachability question so a test can assert WHO it was asked
 *  about — the rule's AUTHOR, never the caller. */
interface ToolGate {
  installed: Set<string>;
  readonly asks: { name: string; userId: UserId }[];
  readonly calls: AutomationToolRequest[];
  readonly owner: UserId;
}

function toolsFor(gate: ToolGate): AutomationOps["tools"] {
  return {
    isToolDrivableBy: (name, userId): boolean => {
      gate.asks.push({ name, userId });
      return gate.installed.has(name) && userId === gate.owner;
    },
    runTool: (req): Promise<AutomationToolOutcome> => {
      // The op re-checks itself (compose does the same) — this is what makes the deactivate-mid-dispatch race
      // an `unavailable` rather than a fabricated success.
      if (!gate.installed.has(req.name)) {
        return Promise.resolve({ ok: false, reason: "unavailable" });
      }
      gate.calls.push(req);
      return Promise.resolve({ ok: true, result: "tense" });
    },
  };
}

type Fixture = Awaited<ReturnType<typeof ruleFixture>>;

/** A fixture whose dispatch runs the REAL arm executors over the gated tool seam — no fake `runArm`, so the
 *  arm's own paused outcome and the engine's terminal are both the real ones.
 *
 *  `varOps` is CAPTURED rather than left to the shared harness's inert `applyVariableOps`. That default writes
 *  nothing anywhere, so an assertion phrased as "the chat variable was not written" passes whether or not the
 *  arm ran — a lying test, and this suite caught itself doing exactly that under a planted control. Capturing
 *  the call is the only way "the other arm did NOT run" is an observation. */
async function pauseFixture(): Promise<{ fixture: Fixture; gate: ToolGate; varOps: VarOp[] }> {
  const base = await ruleFixture();
  const gate: ToolGate = { installed: new Set([TOOL]), asks: [], calls: [], owner: base.host };
  const varOps: VarOp[] = [];
  const ops: AutomationOps = {
    ...base.ctx.ops,
    tools: toolsFor(gate),
    chat: {
      ...base.ctx.ops.chat,
      applyVariableOps: (_chatId, written): Promise<VariableWriteResult> => {
        varOps.push(...written);
        return Promise.resolve({ outcome: "applied" });
      },
    },
  };
  const ctx: AutomationContext = {
    ...base.ctx,
    ops,
    runArm: createArmExecutors({
      db: base.db,
      ops,
      prng: () => 0.42,
      notify: base.ctx.notify,
      suggestions: base.ctx.suggestions,
      newSuggestionId: base.ctx.newSuggestionId,
    }),
  };
  return { fixture: { ...base, ctx, svc: createAutomationService(ctx) }, gate, varOps };
}

/** Mint + enable a rule whose arms are `run_tool` plus (optionally) a bookkeeping `set_variable` BEFORE it. */
async function enableToolRule(fx: Fixture, withSideEffectArm = false): Promise<AutomationRuleId> {
  const rule = await fx.svc.createRule({
    principal: principal(fx.host),
    chatId: fx.chatId,
    name: "mood watch",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: withSideEffectArm
      ? [
          { type: "set_variable", scope: "chat", key: "ticks", op: "inc" },
          { type: "run_tool", name: TOOL, resultVar: "mood" },
        ]
      : [{ type: "run_tool", name: TOOL, resultVar: "mood" }],
  });
  await fx.svc.setRuleEnabled({ principal: principal(fx.host), ruleId: rule.id, enabled: true });
  await fx.ctx.enabled.reload();
  return rule.id;
}

async function ruleRow(fx: Fixture, ruleId: AutomationRuleId): Promise<{ enabled: boolean; consecutiveErrors: number; lastFiredAt: number | null }> {
  const [row] = await fx.db
    .select({ enabled: automationRules.enabled, consecutiveErrors: automationRules.consecutiveErrors, lastFiredAt: automationRules.lastFiredAt })
    .from(automationRules)
    .where(eq(automationRules.id, ruleId));
  if (row === undefined) {
    throw new Error("the rule vanished");
  }
  return row;
}

// THE CONTROL. Without this row every assertion below could pass on a rule that never worked at all — the
// classic vacuous-pause shape. It also fixes what "before" looks like: a real fire row and a real stamp.
test("CONTROL: while the plugin is installed the rule FIRES and the tool really runs", async () => {
  const { fixture, gate } = await pauseFixture();
  const ruleId = await enableToolRule(fixture);

  await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

  expect(gate.calls).toHaveLength(1);
  expect(gate.calls[0]).toMatchObject({ authorUserId: fixture.host, chatId: fixture.chatId, name: TOOL });
  const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
  expect(fires.map((f) => f.outcome)).toEqual(["fired"]);
  expect((await ruleRow(fixture, ruleId)).lastFiredAt).not.toBeNull();
});

describe("D146-d: a deactivated contributor PAUSES the rule and changes nothing", () => {
  test("the bus path writes NO fire row, spends NO error budget, and stamps NO fire", async () => {
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set(); // the owner switched the plugin off.

    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(gate.calls).toEqual([]); // the gate refused before any arm ran — the tool was never invoked
    // NO ROW. A pause is not a fire and not a fault, so the one surface that answers "why did this run" must
    // not claim either. (`action_error` here would be the rot; `fired` would be a lie.)
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).toEqual([]);
    expect(await ruleRow(fixture, ruleId)).toEqual({ enabled: true, consecutiveErrors: 0, lastFiredAt: null });
  });

  test("MORE events than the auto-disable ceiling still leave the rule enabled with a ZERO error count", async () => {
    // THE ROT PIN, at the exact size of the failure it prevents. Pre-D146-d these 21 events would have walked
    // `consecutive_errors` to 20, auto-disabled the rule, and posted the author a durable notice blaming the
    // RULE — for a plugin they merely turned off.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set();

    for (let i = 0; i <= CONSECUTIVE_ERROR_DISABLE_AT; i += 1) {
      await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    }

    expect(await ruleRow(fixture, ruleId)).toMatchObject({ enabled: true, consecutiveErrors: 0 });
  });

  test("a rule mixing a bookkeeping arm with the tool arm runs NEITHER — the pause is atomic", async () => {
    // Why the gate is rule-level and not arm-level: an arm-level pause would let the `set_variable` arm tick a
    // counter on every event forever while the act the rule exists for never happens. Partial execution is its
    // own kind of rot, and "the rule is waiting for your plugin" is only true if the rule really does nothing.
    const { fixture, gate, varOps } = await pauseFixture();
    const ruleId = await enableToolRule(fixture, true);

    // THE CONTROL FIRST, because the assertion below is an ABSENCE: with the plugin installed the bookkeeping
    // arm really does write, so "it did not write" afterwards is an observation rather than an inert stub.
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(varOps).toEqual([
      { op: "set", key: "ticks", value: "1" },
      { op: "set", key: "mood", value: "tense" },
    ]);
    varOps.length = 0;

    gate.installed = new Set();
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(varOps).toEqual([]); // the bookkeeping arm never ran — the pause is atomic, not per-arm
    expect(gate.calls).toHaveLength(1); // ...and still only the CONTROL's tool call
    expect((await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).map((f) => f.outcome)).toEqual(["fired"]);
  });

  test("re-enabling the plugin resumes the rule on the very next event — no repair step", async () => {
    // Self-healing falls out of "changes nothing": there is no disabled flag to clear, no counter to reset and
    // no stored attach list to refresh, so the next dispatch simply finds the tool again.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);

    gate.installed = new Set();
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    expect(gate.calls).toEqual([]);

    gate.installed = new Set([TOOL]);
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });

    expect(gate.calls).toHaveLength(1);
    expect((await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).map((f) => f.outcome)).toEqual(["fired"]);
  });
});

describe("the pause gate and the rest of the engine", () => {
  test("Run now on a paused rule answers `paused`, not `action_error` — the two features meet here", async () => {
    // `run_tool` is SPEND-classed, so a rate refusal raises the F4 invitation whose confirm is a fresh
    // `runRuleNow`. If the manual path reported a fault for a switched-off plugin, confirming that invitation
    // would spend the rule's error budget — the exact rot, arriving through the affordance meant to help.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.installed = new Set();

    const result = await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(result).toEqual({ outcome: "paused" });
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).toEqual([]);
    expect(await ruleRow(fixture, ruleId)).toMatchObject({ consecutiveErrors: 0 });
  });

  test("reachability is asked about the rule's AUTHOR — not the host who pressed Run now", async () => {
    // The identity question the gate must not get wrong. A successor host running someone else's rule does not
    // lend it THEIR plugins, and does not have their own reachability stand in for the author's.
    const { fixture, gate } = await pauseFixture();
    const ruleId = await enableToolRule(fixture);
    gate.asks.length = 0;

    await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId });

    expect(gate.asks).not.toEqual([]);
    expect(gate.asks.every((ask) => ask.userId === fixture.host)).toBe(true);
    // AND THE CONTROL that makes the assertion mean something: the stub only answers `true` for its declared
    // owner, so if the gate had asked about anyone else it would have reported the tool missing and this
    // rule would have PAUSED instead of firing.
    expect(await fixture.svc.runRuleNow({ principal: principal(fixture.host), ruleId })).toEqual({ outcome: "fired" });
  });
});

// ── C5 helpers (the owner-global lane's dispatch pins below) ─────────────────────────────────────────────
const C5_DOMAIN_TRIGGER = { bus: "domain", type: "character.updated" } as const;

/** A quiet caption-mode image arm — the ONE image shape a chat-less rule may carry, and the living-library
 *  preset's own arm. */
const C5_QUIET_PORTRAIT: AutomationActionInput = {
  type: "generate_image",
  mode: "character_multimodal",
  n: 1,
  useAvatarReference: false,
  reuse: "prefer",
  quiet: true,
};

/** Mint an owner-global rule with the given arms. `chatId: null` IS the scope. */
function mintGlobal(
  f: RuleFixture,
  actions: readonly AutomationActionInput[],
  predicateCel: string | null = null,
): ReturnType<AutomationService["createRule"]> {
  return f.svc.createRule({ principal: principal(f.host), chatId: null, name: "library rule", trigger: C5_DOMAIN_TRIGGER, predicateCel, actions });
}

/** A capturing imagery op — the arm's real executor runs, the provider does not. */
function captureImages(requests: AutomationImageRequest[]): ArmExecutorDeps["ops"]["imagery"] {
  return {
    generatePicture: (req): Promise<{ readonly imageCount: number }> => {
      requests.push(req);
      return Promise.resolve({ imageCount: 1 });
    },
  };
}

/** The fixture's own context with the REAL arm dispatcher wired over a capturing imagery op — the arm
 *  executor, the env build, the frame and every gate are production code; only the provider call stops at
 *  the seam. */
function wireRealArms(f: RuleFixture, requests: AutomationImageRequest[]): { readonly svc: AutomationService; readonly reload: () => Promise<void> } {
  const ctx = f.ctx;
  const wired = {
    ...ctx,
    runArm: createArmExecutors({
      db: f.db,
      ops: { ...ctx.ops, imagery: captureImages(requests) },
      prng: ctx.prng,
      notify: ctx.notify,
      suggestions: ctx.suggestions,
      newSuggestionId: ctx.newSuggestionId,
    }),
  };
  return { svc: createAutomationService(wired), reload: () => wired.enabled.reload() };
}

// ── C5: the OWNER-GLOBAL lane's dispatch half (interaction-direction-spec §3-S3 + §7 C5) ─────────────────
// The ADMISSION matrix that decides which rules reach here is pinned at `../substrate/validate.int.test.ts`;
// these are the pins about what the ENGINE does once a chat-less rule fires. The owner's test for the whole
// lane is "fires on a character import with NO room open": a chat-less rule, a domain-bus event, no chat
// anywhere in the frame, and a real arm executor running.
//
// Every refusal is asserted by its CODE (`RuleValidationError.code`), never by its prose — matching a
// message would pin copy while claiming to pin behaviour.

describe("C5 dispatch — the owner's test", () => {
  test("a global rule FIRES on a character import with NO room open, through the real engine", async () => {
    const requests: AutomationImageRequest[] = [];
    const f = await ruleFixture();
    const character = await seedCharacter(f.db, { ownerId: f.host, name: "Mira" });
    const { svc, reload } = wireRealArms(f, requests);

    const rule = await svc.createRule({
      principal: principal(f.host),
      chatId: null,
      name: "living library",
      trigger: C5_DOMAIN_TRIGGER,
      predicateCel: "has(event.character) && event.character.contentChanged",
      actions: [C5_QUIET_PORTRAIT],
    });
    await svc.setRuleEnabled({ principal: principal(f.host), ruleId: rule.id, enabled: true });
    await reload();

    // THE EVENT. No chat is opened, no chat exists in the frame, and the fact is chat-less by construction.
    await svc.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(request?.chatId).toBeNull(); // the whole point: the arm ran with NO room
    expect(request?.quiet).toBe(true);
    expect(request?.authorUserId).toBe(f.host);
    // The SUBJECT came off the FACT — an arm authored with no `subjectCharacterId` illustrates whichever
    // character just changed, which is what makes one standing rule a LIBRARY rule rather than one card's.
    expect(request?.subjectCharacterId).toBe(character.id);
    // …and it is recorded as a real fire on the durable log, which is the global lane's only feedback
    // surface (the transient bus is per-chat and correctly says nothing).
    const fires = await svc.listFires({ principal: principal(f.host), ruleId: rule.id });
    expect(fires.map((row) => row.outcome)).toEqual(["fired"]);
    expect(fires[0]?.chatId).toBeNull();
  });

  test("S7 `contentChanged`: a CONTENT write fires it, a flag-only edit does not", async () => {
    const requests: AutomationImageRequest[] = [];
    const f = await ruleFixture();
    const character = await seedCharacter(f.db, { ownerId: f.host, name: "Mira" });
    const { svc, reload } = wireRealArms(f, requests);
    const rule = await svc.createRule({
      principal: principal(f.host),
      chatId: null,
      name: "living library",
      trigger: C5_DOMAIN_TRIGGER,
      predicateCel: "has(event.character) && event.character.contentChanged",
      actions: [C5_QUIET_PORTRAIT],
    });
    await svc.setRuleEnabled({ principal: principal(f.host), ruleId: rule.id, enabled: true });
    await reload();

    // A FLAG-ONLY edit (star/archive/theme) raises the same event with `contentChanged: false`. Before S7
    // the resolver DROPPED the flag entirely, so this fired identically to a real card write — the
    // edit-burst chore the catalogue's fun pass killed, and the reason this preset needed the field.
    await svc.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: false });
    expect(requests).toEqual([]);
    // A `predicate_false` before a rule's first fire logs nothing (the LEAN first-match rule), so the empty
    // log here is the honest evidence that nothing ran rather than an absence of instrumentation.
    await expect(svc.listFires({ principal: principal(f.host), ruleId: rule.id })).resolves.toEqual([]);

    await svc.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });
    expect(requests).toHaveLength(1);
  });

  test("a global rule does NOT fire on another owner's row — the subject gate", async () => {
    const requests: AutomationImageRequest[] = [];
    const f = await ruleFixture();
    const stranger = await seedUser(f.db, "user_stranger");
    const theirCharacter = await seedCharacter(f.db, { ownerId: stranger, name: "Not mine" });
    const { svc, reload } = wireRealArms(f, requests);
    const rule = await svc.createRule({
      principal: principal(f.host),
      chatId: null,
      name: "living library",
      trigger: C5_DOMAIN_TRIGGER,
      predicateCel: null,
      actions: [C5_QUIET_PORTRAIT],
    });
    await svc.setRuleEnabled({ principal: principal(f.host), ruleId: rule.id, enabled: true });
    await reload();

    // The domain bus is ONE global firehose and `loadEnabledDomainRules` matches across every owner. Without
    // the subject gate this author's rule would spend their model budget illustrating a stranger's card into
    // their own gallery.
    await svc.handleEvent({ type: "character.updated", characterId: theirCharacter.id, contentChanged: true });
    expect(requests).toEqual([]);
    // QUIET: the rule did nothing wrong, so no fire row and no error budget spent — the same shape as the
    // cascade-suppression skip it sits beside.
    await expect(svc.listFires({ principal: principal(f.host), ruleId: rule.id })).resolves.toEqual([]);
  });
});

describe("C5 belts — the owner rate ceiling and the book-ownership gate", () => {
  test("the OWNER hourly cap refuses a global fire, and the refusal keeps the rule healthy", async () => {
    const f = await ruleFixture();
    const character = await seedCharacter(f.db, { ownerId: f.host, name: "Mira" });
    // A ZERO ceiling is a real, useful setting — "stop all of my library rules" without disabling each one.
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 0 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 0 });

    const rule = await mintGlobal(f, [C5_QUIET_PORTRAIT]);
    await f.svc.setRuleEnabled({ principal: principal(f.host), ruleId: rule.id, enabled: true });
    await f.ctx.enabled.reload();
    await f.svc.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });

    const fires = await f.svc.listFires({ principal: principal(f.host), ruleId: rule.id });
    expect(fires.map((row) => row.outcome)).toEqual(["budget_refused"]);
    expect(fires[0]?.detail).toMatchObject({ limit: "owner_hourly" }); // the OWNER belt, not a chat's
    // A rate refusal is NOT an error — the rule stays enabled with a clean error ledger.
    const after = await ruleRow(f, rule.id);
    expect(after.enabled).toBe(true);
    expect(after.consecutiveErrors).toBe(0);
  });

  test("an ABSENT owner-budget row is dispatched as — and projects to — the DDL default", async () => {
    const f = await ruleFixture();
    // The projection and the gate read the same default, so a host who never set a ceiling still SEES the
    // one they are actually dispatched under.
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 120 });
    // …and the plane is single-owned: a second user's read is their own, unaffected by this one's write.
    const other = await seedUser(f.db, "user_other");
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 7 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(other) })).resolves.toEqual({ maxFiresPerHour: 120 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 7 });
  });

  test("the WORLD-INFO gate branches on scope: ownership for a global rule, attachment for a room's", async () => {
    const f = await ruleFixture();
    const stranger = await seedUser(f.db, "user_stranger");
    const mine: WorldBookId = mintTypeId(ID_PREFIX.worldBook);
    const theirs: WorldBookId = mintTypeId(ID_PREFIX.worldBook);
    await f.db.insert(worldBooks).values({ id: mine, ownerId: f.host, name: "my lore" });
    await f.db.insert(worldBooks).values({ id: theirs, ownerId: stranger, name: "their lore" });

    const lore = (bookId: WorldBookId): AutomationActionInput => ({
      type: "insert_world_info_entry",
      bookId,
      entryKey: "k",
      keys: ["k"],
      contentTemplate: "x",
    });

    // GLOBAL: ownership IS the consent (D23 — books are top-level single-owned, and a room consumes one only
    // through its own scope junction, which this path never touches). My own book is admitted…
    await expect(mintGlobal(f, [lore(mine)])).resolves.toMatchObject({ chatId: null });
    // …and a stranger's is refused.
    await expect(refusalCode(mintGlobal(f, [lore(theirs)]))).resolves.toBe("automation_rule_unattached_book");

    // CHAT: the room's consent is the ATTACHMENT, unchanged — my own UNATTACHED book is still refused there,
    // which is what makes these two different questions rather than one weakened for the global lane.
    const roomCode = await refusalCode(
      f.svc.createRule({
        principal: principal(f.host),
        chatId: f.chatId,
        name: "room rule",
        trigger: { bus: "chat", type: "messageCommitted" },
        actions: [lore(mine)],
      }),
    );
    expect(roomCode).toBe("automation_rule_unattached_book");
  });
});

describe("C5 engine — the chat plane is UNBOUND on a global frame, never faked", () => {
  test("an arm template reaching for a chat-keyed root ERRORS rather than rendering an invented empty room", async () => {
    // The mint refuses a chat-keyed PREDICATE. An arm TEMPLATE is the second surface, and its belt is
    // structural: a global frame's CEL activation OMITS `chat`/`vars`/`choice` entirely, so `{{expr::…}}`
    // over one is an `expr-error` diagnostic that `strictArgs` turns into the arm's typed refusal. Binding
    // the empties instead would render a confident `0` for a room that does not exist.
    const f = await ruleFixture();
    const frame: DispatchFrame = {
      chatId: null,
      authorUserId: f.host,
      fact: { type: "character.updated", bus: "domain", chatId: null },
      env: { vars: {}, choice: {}, global: { note: "kept" }, chat: { id: "", messageCount: 0 }, now: { epochMs: 0, hour: 0, dayOfWeek: 0 } },
      origin: { ruleId: mintTypeId(ID_PREFIX.automationRule), automationDepth: 1 },
      now: 0,
    };
    const runArm = createArmExecutors({
      db: f.db,
      ops: f.ctx.ops,
      prng: f.ctx.prng,
      notify: f.ctx.notify,
      suggestions: f.ctx.suggestions,
      newSuggestionId: f.ctx.newSuggestionId,
    });
    const chatKeyed = await runArm({ type: "set_variable", scope: "global", key: "k", op: "set", value: "{{expr::chat.messageCount}}" }, frame);
    expect(chatKeyed.ok).toBe(false);
    // The author's OWN global plane is still bound — the omission is the CHAT plane, not the whole env.
    const authorPlane = await runArm({ type: "set_variable", scope: "global", key: "copy", op: "set", value: "{{expr::global.note}}" }, frame);
    expect(authorPlane.ok).toBe(true);
    await expect(f.svc.getGlobalVariable({ principal: principal(f.host), key: "copy" })).resolves.toBe("kept");
  });
});

// -- #1419: a raised CONFIRMATION aborts the arm chain ------------------------------------------------------
// `runArms` used to abort only on `!outcome.ok`, and a confirm-first arm returns `{ok: true, suggested: true}`
// WITHOUT acting -- so the loop read the ask as an ordinary success and ran the arms behind it anyway. The
// gated act waited on a human while its continuation executed immediately, and `finalizeRule` then routed the
// whole rule to the `suggested` terminal: no `fired` row, no rate charge, nothing in the log a host could read.
// The terminal ruling is UNCHANGED (a direct arm AHEAD of the ask still lands `suggested`); what changed is
// that the arms BEHIND the ask no longer run.
describe("#1419 a confirm-first arm stops the chain", () => {
  /** A dispatcher that records every arm it is handed and STASHES (asks) on the arm named by `askAt`. */
  function chainDispatch(seen: string[], askAt: string): AutomationContext["runArm"] {
    return (action): Promise<{ readonly ok: true; readonly suggested?: true }> => {
      const key = action.type === "set_variable" ? action.key : action.type;
      seen.push(key);
      return Promise.resolve(key === askAt ? { ok: true, suggested: true } : { ok: true });
    };
  }

  async function fireChain(seen: string[], askAt: string): Promise<{ readonly fixture: Fixture; readonly ruleId: AutomationRuleId }> {
    const base = await ruleFixture();
    const ctx: AutomationContext = { ...base.ctx, runArm: chainDispatch(seen, askAt) };
    const fixture: Fixture = { ...base, ctx, svc: createAutomationService(ctx) };
    const rule = await fixture.svc.createRule({
      principal: principal(fixture.host),
      chatId: fixture.chatId,
      name: "mixed postures",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [
        { type: "set_variable", scope: "chat", key: "before", op: "inc" },
        { type: "set_variable", scope: "chat", key: "asks", op: "inc" },
        { type: "set_variable", scope: "chat", key: "after", op: "inc" },
      ],
    });
    await fixture.svc.setRuleEnabled({ principal: principal(fixture.host), ruleId: rule.id, enabled: true });
    await ctx.enabled.reload();
    await fixture.svc.handleEvent({ type: "chatOpened", chatId: fixture.chatId });
    return { fixture, ruleId: rule.id };
  }

  test("CONTROL: with no arm asking, every arm in the list runs and the rule FIRES", async () => {
    const seen: string[] = [];
    const { fixture, ruleId } = await fireChain(seen, "nothing-asks");
    expect(seen).toEqual(["before", "asks", "after"]);
    const fires = await fixture.svc.listFires({ principal: principal(fixture.host), ruleId });
    expect(fires.map((row) => row.outcome)).toEqual(["fired"]);
  });

  test("the arms BEHIND the confirm-first one never run -- the continuation waits for the human, it does not race ahead", async () => {
    const seen: string[] = [];
    const { fixture, ruleId } = await fireChain(seen, "asks");
    // `after` is absent: the chain stopped at the ask. `before` ran -- it is ahead of the question, and the
    // `suggested` terminal's own doc states why the rule still reports `suggested` for it.
    expect(seen).toEqual(["before", "asks"]);
    // The terminal writes NOTHING (S4 fire-log honesty) -- unchanged by this fix, and asserted here so a
    // future "just log the partial fire" edit reds against the ruling rather than against a comment.
    expect(await fixture.svc.listFires({ principal: principal(fixture.host), ruleId })).toEqual([]);
  });
});

// -- The RESERVATION belt, under REAL concurrency -----------------------------------------------------------
// #1423 put a per-chat queue at the `handleEvent` front door, so two same-chat bus events can no longer
// overlap and the front-door suite can no longer prove this. The belt still matters and is still the only
// thing that holds where the lane does not reach: the lane is PROCESS-LOCAL, and `confirmSuggestion`/`runNow`
// enter the engine from their own requests. So the overlap is driven HERE, one layer below the queue.
describe("the fire reservation admits exactly one of two overlapping dispatches", () => {
  test("a second dispatch entered while the first holds its reservation is budget_refused, and no second arm runs", async () => {
    const base = await ruleFixture();
    const entered = { resolve: (): void => undefined, promise: Promise.resolve() };
    entered.promise = new Promise<void>((done) => {
      entered.resolve = done;
    });
    const release = { resolve: (): void => undefined, promise: Promise.resolve() };
    release.promise = new Promise<void>((done) => {
      release.resolve = done;
    });
    let attempts = 0;
    const ctx: AutomationContext = {
      ...base.ctx,
      runArm: async (): Promise<{ readonly ok: true }> => {
        attempts += 1;
        if (attempts === 1) {
          entered.resolve();
          await release.promise;
        }
        return { ok: true };
      },
    };
    const svc = createAutomationService(ctx);
    const rule = await svc.createRule({
      principal: principal(base.host),
      chatId: base.chatId,
      name: "reserved",
      trigger: { bus: "chat", type: "chatOpened" },
      actions: [{ type: "set_variable", scope: "chat", key: "ticks", op: "inc" }],
      cooldownSeconds: 60,
    });
    await svc.setRuleEnabled({ principal: principal(base.host), ruleId: rule.id, enabled: true });
    const rules = await loadEnabledChatRules(base.db, base.chatId, "chatOpened");
    const resolved = { fact: { bus: "chat" as const, type: "chatOpened" as const, chatId: base.chatId }, automationDepth: 0 };

    // TRUE overlap: the second dispatch starts while the first is parked inside its arm.
    const first = runDispatch(ctx, rules, resolved);
    await entered.promise;
    const second = await runDispatch(ctx, rules, resolved);
    const attemptsWhileHeld = attempts;
    release.resolve();
    await first;

    expect(attemptsWhileHeld).toBe(1); // the second never reached the arm -- the HELD reservation refused it
    expect(second.outcomes).toEqual(["budget_refused"]);
    const outcomes = (await svc.listFires({ principal: principal(base.host), ruleId: rule.id })).map((row) => row.outcome);
    expect(outcomes).toContain("fired");
    expect(outcomes).toContain("budget_refused");
  });
});
