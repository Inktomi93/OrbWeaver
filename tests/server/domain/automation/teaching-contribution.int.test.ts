// domain/automation/teaching-contribution — the S5 guidance delivery, driven through chat's REAL collector
// (`collectTeaching`) over a REAL db, never the contribution's `collect` in isolation (the B1 lesson: A1's
// own fixture faked the gather as a shape production never produces and its guard was vacuous for exactly
// that reason). The pins:
//   • BYTE-IDENTITY — no rule / no guidance / a handed-off room ⇒ the merged array is DEEP-EQUAL to a
//     registry without this contribution (the A1 seam property, held per contributor);
//   • VERBATIM + MACRO-INERT (§2 law 6) — a model-authored `{{getglobalvar::…}}` survives collection AND
//     the assembly splice as LITERAL BRACES (the splice's resolveContent is identity in production);
//   • the authors-note register (in_chat · depth 4 · system · origin authors-note);
//   • the `automation.guidance.frame` delimiter, so a folded note never reads as a player's words.

import { PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId, mintTypeId } from "@orb/kit/ids";
import { EMPTY_ANALYSIS_STATE } from "../../../../packages/server/src/domain/automation/contract/analysis.ts";
import { createAutomationTeachingContributions } from "../../../../packages/server/src/domain/automation/index.ts";
import { upsertRuleState } from "../../../../packages/server/src/domain/automation/persistence/rule-state.ts";
import { spliceInChatInjections } from "../../../../packages/server/src/domain/chat/assembly/injections.ts";
import { MERGE_SEPARATOR } from "../../../../packages/server/src/domain/chat/assembly/role-squash.ts";
import { shape } from "../../../../packages/server/src/domain/chat/assembly/shape.ts";
import type { TeachingContext } from "../../../../packages/server/src/domain/chat/contract/context.ts";
import { collectTeaching } from "../../../../packages/server/src/domain/chat/substrate/teaching.ts";
import { convertsToEmptyWireRow } from "../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../chat/_support.ts";
import { seedUser } from "./_support.ts";

const NOW = 1_700_000_000_000;
const GUIDANCE = "Plant the courier's absence — do not explain it. {{getglobalvar::secret}} stays literal.";

function tctxFor(chatId: ChatId, runAsUserId: UserId): TeachingContext {
  // knobs/identity are inert here — this contribution reads chatId + runAsUserId, and prose only for its frame.
  return {
    chatId,
    runAsUserId,
    knobs: { offerChoices: false, charactersCanReact: false, reactionsEnabled: true },
    prose: {},
    identity: { user: "User", char: "Aria" },
    rpgGather: null,
  };
}

async function seedAnalysisRule(
  db: Db,
  args: { readonly id: string; readonly ownerId: UserId; readonly chatId: ChatId; readonly enabled: boolean },
): Promise<AutomationRuleId> {
  const ruleId = castId<AutomationRuleId>(args.id);
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId: args.ownerId,
    chatId: args.chatId,
    name: "analysis",
    position: 1,
    triggerBus: "chat",
    triggerType: "turnCompleted",
    actions: [],
    enabled: args.enabled,
  });
  return ruleId;
}

async function setup(): Promise<{ db: Db; host: UserId; chatId: ChatId }> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedChat(db, "tch");
  await seedParticipant(db, { chatId, key: "tch_host", userId: host, role: "host" });
  return { db, host, chatId };
}

test("BYTE-IDENTITY: no rule / no guidance / a handed-off room all collect to the empty collection — deep-equal to a registry without this contribution", async () => {
  const { db, host, chatId } = await setup();
  const registry = createAutomationTeachingContributions({ db });

  // No rule at all.
  expect(await collectTeaching(registry, tctxFor(chatId, host))).toEqual(await collectTeaching([], tctxFor(chatId, host)));

  // An enabled rule with EMPTY guidance ("" = no standing guidance).
  const ruleId = await seedAnalysisRule(db, { id: "automation_rule_tch", ownerId: host, chatId, enabled: true });
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: "", nowMs: NOW });
  expect(await collectTeaching(registry, tctxFor(chatId, host))).toEqual({ injections: [], toolNames: [] });

  // Guidance stored — but the turn resolved under a NEW host (a handoff): the read self-gates on
  // ownerId = runAsUserId, so the very next turn teaches nothing, fail-safe (§3-S5.3).
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: GUIDANCE, nowMs: NOW + 1 });
  const newHost = await seedUser(db, "user_newhost");
  expect(await collectTeaching(registry, tctxFor(chatId, newHost))).toEqual({ injections: [], toolNames: [] });
});

test("standing guidance collects as ONE verbatim authors-note-register injection — and survives the assembly splice as LITERAL BRACES", async () => {
  const { db, host, chatId } = await setup();
  const ruleId = await seedAnalysisRule(db, { id: "automation_rule_tch2", ownerId: host, chatId, enabled: true });
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: GUIDANCE, nowMs: NOW });

  const collected = await collectTeaching(createAutomationTeachingContributions({ db }), tctxFor(chatId, host));
  expect(collected.toolNames).toEqual([]);
  expect(collected.injections).toEqual([
    // VERBATIM — the exact stored bytes, braces and all, inside the shipped frame at the authors-note register
    // (in_chat/4/system).
    {
      position: "in_chat",
      depth: 4,
      role: "system",
      content: resolveProseText("automation.guidance.frame", {}, { guidance: GUIDANCE }),
      origin: "authors-note",
    },
  ]);

  // The delivery plane is macro-inert BY CHANNEL: the splice's resolveContent is identity in production,
  // so the model-authored macro reaches the assembled history as literal braces (§2 law 6's pin). The
  // system row converts to the framed user note here (no channel bit granted) — the BYTES survive inside.
  const history = Array.from({ length: 6 }, (_, i) => ({ role: "user" as const, content: `turn ${i}` }));
  const spliced = spliceInChatInjections(history, collected.injections);
  const carried = spliced.find((row) => row.content.includes("{{getglobalvar::secret}}"));
  expect(carried).toBeDefined();
});

test("a DISABLED rule's guidance stops teaching (consent withdrawn ⇒ the steer goes silent)", async () => {
  const { db, host, chatId } = await setup();
  const ruleId = await seedAnalysisRule(db, { id: "automation_rule_tch3", ownerId: host, chatId, enabled: false });
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: GUIDANCE, nowMs: NOW });
  expect(await collectTeaching(createAutomationTeachingContributions({ db }), tctxFor(chatId, host))).toEqual({ injections: [], toolNames: [] });
});

// On a model that takes no system row the depth-4 guidance folds into a player's message and leads their labelled
// line. It carries its own delimiter so it never reads as that player's words (owner ruling). The delimiters are
// read off the frame slot, so the assertion is the structure, never the words.
test("folded guidance is delimited from the player's label line in a labelled multi-human room", async () => {
  const { db, host, chatId } = await setup();
  const ruleId = await seedAnalysisRule(db, { id: "automation_rule_tch4", ownerId: host, chatId, enabled: true });
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: GUIDANCE, nowMs: NOW });
  const [open = "", close = ""] = PROSE_SLOTS["automation.guidance.frame"].text.split("{{guidance}}");
  expect(open.trim()).not.toBe("");
  expect(close.trim()).not.toBe("");

  const collected = await collectTeaching(createAutomationTeachingContributions({ db }), tctxFor(chatId, host));
  // Four rows below the players' pair, so the depth-4 note splices directly after it and folds mid-history.
  const shaped = shape({
    canon: [
      { role: "user", content: "I open the door.", authorName: "Nate", messageId: mintTypeId("message") },
      { role: "user", content: "I follow him in.", authorName: "Joe", messageId: mintTypeId("message") },
      { role: "assistant", content: "The hall is dark.", authorName: "Aria", messageId: mintTypeId("message") },
      { role: "user", content: "I light a match.", authorName: "Nate", messageId: mintTypeId("message") },
      { role: "assistant", content: "It gutters out.", authorName: "Aria", messageId: mintTypeId("message") },
      { role: "user", content: "I wait.", authorName: "Joe", messageId: mintTypeId("message") },
    ],
    appendUserTurn: null,
    injections: collected.injections,
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    namesBehavior: "default",
    speakers: { user: "Nate", assistant: "Aria" },
    multiHuman: true,
    groupNudge: null,
    convertsToEmptyWireRow,
  });
  const players = `Nate: I open the door.${MERGE_SEPARATOR}Joe: I follow him in.`;
  const message = shaped.history.find((row) => row.content.endsWith(players))?.content ?? "";
  expect(message.endsWith(`${MERGE_SEPARATOR}${players}`)).toBe(true);
  const folded = message.slice(0, message.length - MERGE_SEPARATOR.length - players.length);
  expect(folded.startsWith(open)).toBe(true);
  expect(folded.endsWith(close)).toBe(true);
  // The model-authored guidance rides whole and verbatim between the delimiters.
  expect(folded.slice(open.length, folded.length - close.length)).toBe(GUIDANCE);
});

test("the frame is the preset's slot: a host override replaces the delimiter around the same guidance", async () => {
  const { db, host, chatId } = await setup();
  const ruleId = await seedAnalysisRule(db, { id: "automation_rule_tch5", ownerId: host, chatId, enabled: true });
  await upsertRuleState(db, { ruleId, state: EMPTY_ANALYSIS_STATE, guidance: GUIDANCE, nowMs: NOW });

  const tctx = { ...tctxFor(chatId, host), prose: { "automation.guidance.frame": { text: "<<{{guidance}}>>", baseVersion: 1 } } };
  const collected = await collectTeaching(createAutomationTeachingContributions({ db }), tctx);

  expect(collected.injections.map((i) => i.content)).toEqual([`<<${GUIDANCE}>>`]);
});
