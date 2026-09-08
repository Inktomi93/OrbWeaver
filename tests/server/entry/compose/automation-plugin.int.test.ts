// entry/compose/automation-plugin — the `run_tool` arm's COMPOSE WIRING, driven COMPOSED-REAL (#691). The
// closure under test is `buildAutomationPlugin`'s `runTool` op: the reachability re-check, the DRIVER-SCOPED
// `resolveTools(authorUserId, …)` (#677), the exec frame it mints, and the record→outcome mapping. Every one
// of those was reachable only through fakes before this file — the four `AutomationOps.tools` stubs in
// `tests/server/domain/automation/**` prove the ARM against a hand-written seam, and the tool-use suites prove
// the REGISTRY against a hand-written exec. Nothing exercised the wire between them.
//
// So this suite takes the `app` fixture (the REAL `createServices` graph: the real registrar, the real
// automation service + dispatcher, the real `executeToolCalls`, the real chat variable persistence) and drives
// a rule end to end. Only the plugin GUEST is planted — `registerPluginTool` is the seam a plugin activation
// itself calls (PL-A), and a real QuickJS bundle would prove nothing extra about this wire while making the
// two-users-same-tool-name setup impossible to state.
//
// The identity frame is observed with `vi.spyOn(app.toolUse, "executeToolCalls")`, which CALLS THROUGH — the
// real execute still runs. That is also a premise check: `ServicesResult.toolUse` and the object
// `buildAutomationPlugin` closed over are asserted to be one instance by the spy recording at all.
//
// WHAT EACH PIN COSTS TO BREAK, measured by planting the break and watching it red (#691 red-first): the
// author-scoped resolve, `triggeredBy`, the record→result mapping and the C5 mint clause each red one or more
// rows on their own. The PAUSE row is the exception and deliberately so — it stayed green until BOTH the
// rule-level gate (`engine/dispatch.ts::pausingToolName`) and the arm-level `PAUSED_ARM` were neutered
// together, because `runTool`'s own reachability re-check + `resolveTools`' throw are a third belt behind
// them. It is a defence-in-depth receipt, not a dead assertion.

import type { AutomationActionInput } from "@orb/contracts/automation";
import type { InvocationChat } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { automationRules, chats } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { RuleValidationError } from "@orb/server/domain/automation";
import { loadPresentRole } from "@orb/server/domain/chat";
import type { PluginToolHandle } from "@orb/server/domain/tool-use";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { principal, seedHostChat, seedUser } from "../../domain/automation/_support.ts";

/** ONE namespaced name, installed by TWO users — the #677 shape (`plugin_<slug'>_<name>` is derived from a
 *  manifest, so two people installing the same plugin produce byte-identical names). */
const TOOL = "plugin_moodwatch_report";
const ARGS_TEMPLATE = '{"tag":"calm"}';

interface ToolProbe {
  /** Every guest invocation, in order — the planted behaviour that says WHOSE copy ran. */
  readonly calls: { readonly argsJson: string; readonly chat: InvocationChat | null }[];
  /** PL-A's deregistration handle — deactivation calls it (the pause-not-rot probe below). */
  readonly handle: PluginToolHandle;
}

/** Install `installer`'s copy of {@link TOOL} through the REAL runtime registrar, with a marker-prefixed
 *  result so a captured value names which shelf it came off. `resolveInstallerRole` is the production wiring
 *  verbatim (chat's own `loadPresentRole` over the real roster), so the PL-C ceiling is real too. */
function installTool(app: ServicesResult, db: Db, installer: UserId, marker: string): ToolProbe {
  const calls: { argsJson: string; chat: InvocationChat | null }[] = [];
  const handle = app.toolUse.registerPluginTool({
    name: TOOL,
    description: "report the room's mood",
    parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false },
    installer: principal(installer),
    invoke: (argsJson, chat): Promise<string> => {
      calls.push({ argsJson, chat });
      return Promise.resolve(`${marker}:${argsJson}`);
    },
    resolveInstallerRole: (chatId) => loadPresentRole(db, chatId, installer),
  });
  return { calls, handle };
}

interface Scene {
  readonly author: UserId;
  readonly stranger: UserId;
  readonly chatId: ChatId;
}

/** Two users and a room the AUTHOR hosts (rule authoring is room-host authority). */
async function seedScene(db: Db): Promise<Scene> {
  const author = await seedUser(db, "user_rule_author");
  const stranger = await seedUser(db, "user_rule_stranger");
  const chatId = await seedHostChat(db, author);
  return { author, stranger, chatId };
}

/** Mint + enable one rule through the real verbs (rules are born disabled; enabling is the consent act). */
async function mintEnabledRule(app: ServicesResult, author: UserId, chatId: ChatId | null, action: AutomationActionInput): Promise<AutomationRuleId> {
  const actor = principal(author);
  const rule = await app.automation.createRule({
    principal: actor,
    chatId,
    name: "moodwatch",
    trigger: chatId === null ? { bus: "domain", type: "character.updated" } : { bus: "chat", type: "messageCommitted" },
    actions: [action],
  });
  await app.automation.setRuleEnabled({ principal: actor, ruleId: rule.id, enabled: true });
  return rule.id;
}

/** The chat's SETTLED variable fold (`chats.runtimeVariables` — what the real `applyVariableOps` writes). */
async function chatVariables(db: Db, chatId: ChatId): Promise<Record<string, string>> {
  const rows = await db.select({ v: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId)).limit(1);
  return rows.at(0)?.v ?? {};
}

test("the AUTHOR'S OWN copy of a shared tool name runs, and its result lands in the chat variable", async ({ app, db }) => {
  const { author, stranger, chatId } = await seedScene(db);
  // Both users hold the same namespaced name. The stranger's copy is registered FIRST, so a name-only
  // resolve (the pre-#677 shape) would hand the arm exactly this entry.
  const strangerTool = installTool(app, db, stranger, "stranger");
  const authorTool = installTool(app, db, author, "author");
  const ruleId = await mintEnabledRule(app, author, chatId, { type: "run_tool", name: TOOL, argsTemplate: ARGS_TEMPLATE, resultVar: "mood" });

  const result = await app.automation.runRuleNow({ principal: principal(author), ruleId });

  expect(result).toEqual({ outcome: "fired" });
  // WHOSE grant was spent: the author's guest ran once with the RENDERED args; the stranger's never ran.
  expect(authorTool.calls).toEqual([{ argsJson: ARGS_TEMPLATE, chat: { chatId, canWrite: true, automationDepth: 0 } }]);
  expect(strangerTool.calls).toEqual([]);
  // …and the captured value is the AUTHOR's copy's bytes, landed through the real chat variable fold.
  expect(await chatVariables(db, chatId)).toEqual({ mood: `author:${ARGS_TEMPLATE}` });
});

test("the executor receives the AUTHOR's identity frame — their Principal, triggeredBy, no turn, the rule's chat", async ({ app, db }) => {
  const { author, chatId } = await seedScene(db);
  installTool(app, db, author, "author");
  const ruleId = await mintEnabledRule(app, author, chatId, { type: "run_tool", name: TOOL, argsTemplate: ARGS_TEMPLATE });
  // Records the frame; the real execute still runs (spyOn calls through).
  const executed = vi.spyOn(app.toolUse, "executeToolCalls");

  await app.automation.runRuleNow({ principal: principal(author), ruleId });

  // The spy firing at all is the premise receipt: the compose closure and `ServicesResult.toolUse` are ONE
  // instance, so this file really is observing the production wire.
  expect(executed).toHaveBeenCalledTimes(1);
  const [set, calls, exec] = executed.mock.calls[0] ?? [];
  // The RESOLVED SET is the author's shelf — the entry carries their ownership (`substrate/partition.ts`).
  expect(set?.entries.map((entry) => ({ name: entry.name, owner: entry.owner, source: entry.source }))).toEqual([
    { name: TOOL, owner: author, source: "plugin" },
  ]);
  expect(calls?.map((call) => ({ name: call.name, arguments: call.arguments }))).toEqual([{ name: TOOL, arguments: ARGS_TEMPLATE }]);
  // The acting identity is the rule's AUTHOR, resolved by ROW READ — not a bare id, not the box owner.
  expect(exec?.principal.userId).toBe(author);
  expect(exec?.principal.role).toBe("user");
  expect(exec?.triggeredBy).toBe(author);
  expect(exec?.chatId).toBe(chatId);
  // A rule dispatch is not a turn, and the roster is fail-CLOSED null (the compose header's two claims).
  expect(exec?.turnId).toBeNull();
  expect(exec?.membership).toBeNull();
});

test("a tool the author never installed is refused at the MINT — the rule is never stored and nothing runs", async ({ app, db }) => {
  const { author, stranger, chatId } = await seedScene(db);
  // The name EXISTS in the registry — it is simply on someone else's shelf, which is the cross-user case the
  // reachability predicate exists for (a room-mate's plugin is not drivable by naming it).
  const strangerTool = installTool(app, db, stranger, "stranger");

  await expect(
    app.automation.createRule({
      principal: principal(author),
      chatId,
      name: "moodwatch",
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [{ type: "run_tool", name: TOOL }],
    }),
  ).rejects.toThrow(RuleValidationError);

  expect(await app.automation.listRules({ principal: principal(author), chatId })).toEqual([]);
  expect(strangerTool.calls).toEqual([]);
});

test("deactivating the author's plugin PAUSES the rule — no fire row, no error tick, the row byte-identical", async ({ app, db }) => {
  const { author, chatId } = await seedScene(db);
  const authorTool = installTool(app, db, author, "author");
  const ruleId = await mintEnabledRule(app, author, chatId, { type: "run_tool", name: TOOL, argsTemplate: ARGS_TEMPLATE, resultVar: "mood" });
  // A healthy fire FIRST, so the pause below is a state change away from a working rule rather than a rule
  // that never ran (which any refusal would satisfy).
  expect(await app.automation.runRuleNow({ principal: principal(author), ruleId })).toEqual({ outcome: "fired" });
  const before = await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(1);

  // The plugin is deactivated — PL-A's handle is what a real deactivation calls.
  authorTool.handle.unregister();
  const paused = await app.automation.runRuleNow({ principal: principal(author), ruleId });

  expect(paused).toEqual({ outcome: "paused" });
  expect(authorTool.calls).toHaveLength(1); // the guest was not invoked a second time
  // D146-d's whole claim, asserted as the header states it: the stored state is byte-identical, so the rule
  // self-heals when the plugin comes back — no `action_error` row, no `consecutiveErrors` tick toward the
  // 20-error auto-disable, no `lastFiredAt` movement.
  expect(await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(1)).toEqual(before);
  const fires = await app.automation.listFires({ principal: principal(author), ruleId });
  expect(fires.map((fire) => fire.outcome)).toEqual(["fired"]);
  // …and the captured variable still holds the value the healthy fire wrote (a pause writes nothing at all).
  expect(await chatVariables(db, chatId)).toEqual({ mood: `author:${ARGS_TEMPLATE}` });
});

test("C5: a global rule cannot capture into a CHAT variable, and its chat-less fire runs the tool with no room", async ({ app, db }) => {
  const { author } = await seedScene(db);
  const authorTool = installTool(app, db, author, "author");

  // The admission matrix's `run_tool` row: the `chat` plane is one room's fold and this rule has no room.
  await expect(
    app.automation.createRule({
      principal: principal(author),
      chatId: null,
      name: "moodwatch",
      trigger: { bus: "domain", type: "character.updated" },
      actions: [{ type: "run_tool", name: TOOL, resultVar: "mood", resultScope: "chat" }],
    }),
  ).rejects.toThrow(RuleValidationError);
  // `listOwnerRules` is the chat-less twin of `listRules` (the global lane's read has no chat to gate on).
  expect(await app.automation.listOwnerRules({ principal: principal(author) })).toEqual([]);

  // The same arm on the AUTHOR's own plane is admissible — the refusal is about the plane, not the arm.
  const ruleId = await mintEnabledRule(app, author, null, {
    type: "run_tool",
    name: TOOL,
    argsTemplate: ARGS_TEMPLATE,
    resultVar: "mood",
    resultScope: "global",
  });
  const executed = vi.spyOn(app.toolUse, "executeToolCalls");

  expect(await app.automation.runRuleNow({ principal: principal(author), ruleId })).toEqual({ outcome: "fired" });

  // A chat-less fire hands the executor no room, so the guest gets no invocation-chat scope at all.
  expect(executed.mock.calls[0]?.[2].chatId).toBeNull();
  expect(authorTool.calls).toEqual([{ argsJson: ARGS_TEMPLATE, chat: null }]);
  expect(await app.automation.getGlobalVariable({ principal: principal(author), key: "mood" })).toBe(`author:${ARGS_TEMPLATE}`);
});
