// .int tests for substrate/analysis-confirm — the `{via:"analysis"}` confirm executor (S5's confirm-routed
// outputs). Real libSQL. The pins: a confirmed STEER writes guidance verbatim (sliced at the one bound); a
// confirmed LORE apply rides the SAME belt as the arm (the attach gate re-checked AT CONFIRM — a book
// detached after the card was raised refuses, the stale-consent planted control) and advances the
// watermark ONLY on success; a confirmed suggestTurn rides `ops.chat.requestTurn` in the AUTHOR frame.

import { ANALYSIS_GUIDANCE_MAX } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRules, chatBooks, worldBooks } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AnalysisConfirmAct } from "../../../../../packages/server/src/domain/automation/contract/analysis.ts";
import type {
  AnalysisConfirmDeps,
  ApplyProseRewrite,
  AutomationOps,
  AutomationTurnRequest,
  PendingSuggestion,
  RuleRow,
} from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { selectRuleState } from "../../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
import { runAnalysisConfirm } from "../../../../../packages/server/src/domain/automation/substrate/analysis-confirm.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { NO_TOOLS, seedUser } from "../_support.ts";

const FIXED_NOW_MS = 1_700_000_000_000;

interface Captured {
  readonly upserts: { bookId: WorldBookId; entries: readonly { title: string; content: string }[] }[];
  readonly turns: AutomationTurnRequest[];
  /** C3 — every call the confirm made onto the CONFIRM-ONLY rewrite op (the pins it forwards are the claim). */
  readonly rewrites: Parameters<ApplyProseRewrite>[0][];
}

function makeOps(captured: Captured): AutomationOps {
  return {
    tools: NO_TOOLS,
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve(null),
      resolveViewerVisibility: () => Promise.resolve(null),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      resolveChatProse: () => Promise.resolve({}),
      applyVariableOps: () => Promise.resolve({ outcome: "applied" }),
      listBackgroundChoices: () => Promise.resolve([]),
      setChatBackground: () => Promise.resolve(),
      requestTurn: (req): Promise<{ messageCount: number }> => {
        captured.turns.push(req);
        return Promise.resolve({ messageCount: 1 });
      },
    },
    worldInfo: {
      upsertEntries: (args): Promise<{ inserted: number; updated: number; skippedHandEdited: number }> => {
        captured.upserts.push({ bookId: args.bookId, entries: args.entries.map((e) => ({ title: e.title, content: e.content })) });
        return Promise.resolve({ inserted: args.entries.length, updated: 0, skippedHandEdited: 0 });
      },
    },
    notifications: { emit: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ imageCount: 0 }) },
    summarizeQuiet: () => Promise.resolve({ text: "" }),
  };
}

/** The confirm executor's deps over a capturing ops double. The rewrite op is captured rather than wired to
 *  the real chat verb: its own two pins are the CHAT verb's, pinned in `tests/server/domain/chat/edit.int`. */
function makeDeps(db: Db, captured: Captured): AnalysisConfirmDeps {
  return {
    db,
    ops: makeOps(captured),
    nowMs: FIXED_NOW_MS,
    applyProseRewrite: (req): Promise<void> => {
      captured.rewrites.push(req);
      return Promise.resolve();
    },
  };
}

async function setup(): Promise<{ db: Db; host: UserId; chatId: ChatId; rule: RuleRow; pending: PendingSuggestion; captured: Captured }> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "conf");
  await seedParticipant(db, { chatId, key: "conf_host", userId: host, role: "host" });
  const ruleId = castId<AutomationRuleId>("automation_rule_conf");
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId: host,
    chatId,
    name: "analysis",
    position: 1,
    triggerBus: "chat",
    triggerType: "turnCompleted",
    actions: [],
  });
  const rows = await db.select().from(automationRules);
  const rule = rows[0] as RuleRow;
  const pending: PendingSuggestion = {
    id: mintTypeId(ID_PREFIX.automationSuggestion),
    kind: "confirm",
    chatId,
    source: { kind: "rule", ruleId },
    actorUserId: host,
    summary: "s",
    expiresAt: FIXED_NOW_MS + 1,
    payload: null, // each test supplies the act directly to the executor.
  };
  return { db, host, chatId, rule, pending, captured: { upserts: [], turns: [], rewrites: [] } };
}

test("a confirmed STEER writes the guidance VERBATIM, sliced at the ONE bound", async () => {
  const { db, rule, pending, captured } = await setup();
  const long = `adopt {{getglobalvar::x}} ${"g".repeat(ANALYSIS_GUIDANCE_MAX * 2)}`;
  await runAnalysisConfirm(makeDeps(db, captured), pending, rule, { kind: "steer", guidance: long });
  const stored = await selectRuleState(db, rule.id);
  expect(stored.guidance).toBe(long.slice(0, ANALYSIS_GUIDANCE_MAX)); // sliced, otherwise byte-identical (braces intact).
});

test("a confirmed LORE apply writes through the belt and advances the watermark to the card's span end", async () => {
  const { db, host, chatId, rule, pending, captured } = await setup();
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "b" });
  await db.insert(chatBooks).values({ chatId, worldBookId: bookId });
  const act: AnalysisConfirmAct = { kind: "lore", bookId, entries: [{ entryKey: "s0.k", keys: ["kw"], content: "fact" }], spanEnd: 12 };
  await runAnalysisConfirm(makeDeps(db, captured), pending, rule, act);
  expect(captured.upserts[0]?.entries[0]?.title).toBe(`auto/${rule.id}:s0.k`);
  expect((await selectRuleState(db, rule.id)).state.settledThroughSeq).toBe(12);
});

test("PLANTED CONTROL — the attach gate bites AT CONFIRM: a book detached after the raise refuses, writes nothing, moves no watermark", async () => {
  const { db, host, chatId: _chatId, rule, pending, captured } = await setup();
  const bookId = mintTypeId(ID_PREFIX.worldBook);
  await db.insert(worldBooks).values({ id: bookId, ownerId: host, name: "b" }); // exists, NOT attached — consent withdrawn.
  const act: AnalysisConfirmAct = { kind: "lore", bookId, entries: [{ entryKey: "s0.k", keys: [], content: "c" }], spanEnd: 9 };
  await expect(runAnalysisConfirm(makeDeps(db, captured), pending, rule, act)).rejects.toThrow("not attached");
  expect(captured.upserts).toEqual([]);
  expect((await selectRuleState(db, rule.id)).state.settledThroughSeq).toBe(0);
});

test("a confirmed suggestTurn runs the room's guided turn in the AUTHOR frame at the raising dispatch's depth", async () => {
  const { db, host, chatId, rule, pending, captured } = await setup();
  const act: AnalysisConfirmAct = { kind: "suggestTurn", steerText: "Cut to the chase.", automationDepth: 2 };
  await runAnalysisConfirm(makeDeps(db, captured), pending, rule, act);
  expect(captured.turns).toEqual([{ authorUserId: host, chatId, automationDepth: 2, guided: "Cut to the chase." }]);
});

test("C3: a confirmed REWRITE forwards the card's variant pin + content hash VERBATIM, in the author frame", async () => {
  const { db, host, chatId, rule, pending, captured } = await setup();
  const messageId = mintTypeId(ID_PREFIX.message);
  const variantId = mintTypeId(ID_PREFIX.messageVariant);
  const act: AnalysisConfirmAct = { kind: "rewrite", messageId, variantId, contentHash: "abc123", content: "The door was already locked." };
  await runAnalysisConfirm(makeDeps(db, captured), pending, rule, act);
  // The two pins are what make the confirm safe across time, so the confirm's job is to carry them UNCHANGED
  // to the verb that re-checks them — a confirm that re-derived either would be checking the room against
  // itself. `authorUserId` is the rule author, never the confirmer (§3-S4's identity law).
  expect(captured.rewrites).toEqual([
    { authorUserId: host, chatId, messageId, variantId, expectedContentHash: "abc123", content: "The door was already locked." },
  ]);
});

test("C3 PLANTED CONTROL — a refusing rewrite op propagates, so the confirm verb records action_error rather than a fired row", async () => {
  const { db, rule, pending, captured } = await setup();
  const deps: AnalysisConfirmDeps = { ...makeDeps(db, captured), applyProseRewrite: () => Promise.reject(new Error("rewrite_superseded")) };
  const act: AnalysisConfirmAct = {
    kind: "rewrite",
    messageId: mintTypeId(ID_PREFIX.message),
    variantId: mintTypeId(ID_PREFIX.messageVariant),
    contentHash: "h",
    content: "c",
  };
  await expect(runAnalysisConfirm(deps, pending, rule, act)).rejects.toThrow("rewrite_superseded");
});
