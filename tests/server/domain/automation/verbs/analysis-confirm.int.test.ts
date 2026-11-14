// A lore card an analysis pass raised runs on the host's yes: the entries land in the attached book under the rule's
// own titles and only then does the settled span count as covered, so the next pass skips it. A book detached since the
// card was raised refuses the write, records the failed confirm and leaves the span for the next pass to read again.
// @subject packages/server/src/domain/automation/verbs/confirm-suggestion.ts
// @subject packages/server/src/domain/automation/engine/analysis-confirm.ts

import type { AutomationBusEvent, RunRuleNowResult } from "@orb/contracts/automation";
import { createBookSchema } from "@orb/contracts/world-info";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { WireOf } from "../../chat/scenario-physical.ts";
import { wireOf } from "../../chat/scenario-physical.ts";

const OPENING = "The opening oath is sworn at the old gate.";
// Well past the fresh window plus the protect tail, so only the settled span can carry the opening row.
// The automation constants have no package door for tests to import them through.
const ROWS = 100;
const LORE = { key: "gate-oath", keys: ["oath", "gate"], content: "The gate's oath binds every traveller who crosses it." };
const RAISE_WAIT_MS = 20_000;

type RaisedCard = Extract<AutomationBusEvent, { type: "suggestionRaised" }>;

type Services = ChatRoot["root"]["services"];

interface LoreRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly book: Awaited<ReturnType<Services["worldInfo"]["createBook"]>>;
  readonly rule: Awaited<ReturnType<Services["automation"]["createRule"]>>;
  /** The next lore card raised in the room, as the host receives it. */
  readonly nextRaised: () => Promise<RaisedCard>;
}

async function loreRoom(): Promise<LoreRoom> {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  replies.set("run_analysis", JSON.stringify({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], lore: [LORE] }));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused reply",
    structuredReplies: replies,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await createChatRoot({ providerFetch: physical.execute, memoryEnabled: false }));
  for (let index = 0; index < ROWS; index += 1) {
    await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content: index === 0 ? OPENING : `Beat ${index} at the gate.` });
  }
  const book = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "Gate lore" }) });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  const rule = await h.root.services.automation.createRule({
    principal: h.owner,
    chatId: h.chatId,
    name: "Gate lore",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Record the gate's lore.", routes: { lore: { apply: "confirm", bookId: book.id } } }],
  });
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  const cancellation = new AbortController();
  const stream = h.root.app.liveBuses.automation
    .subscribeAutomation(h.chatId, AbortSignal.any([cancellation.signal, AbortSignal.timeout(RAISE_WAIT_MS)]))
    [Symbol.asyncIterator]();
  construction.defer(async () => {
    cancellation.abort();
    await stream.return?.();
  });
  const nextRaised = async (): Promise<RaisedCard> => {
    for (;;) {
      const next = await stream.next();
      if (next.done === true) {
        throw new Error("the automation stream ended before a card");
      }
      if (next.value.type === "suggestionRaised") {
        return next.value;
      }
    }
  };
  const lifetime = construction.move();
  return { h, book, rule, nextRaised, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** One pass of the rule, with the provider bodies it sent. */
function pass({ h, rule }: LoreRoom): Promise<WireOf<RunRuleNowResult>> {
  return wireOf(h, () => h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id }));
}

const sentOpening = (bodies: readonly unknown[]): boolean => bodies.some((body) => JSON.stringify(body).includes(OPENING));

function bookEntries({ h, book }: LoreRoom): ReturnType<Services["worldInfo"]["listEntries"]> {
  return h.root.services.worldInfo.listEntries({ principal: h.owner, bookId: book.id });
}

test("a confirmed lore card writes its entries under the rule and covers the span it distilled", { tags: ["slow"] }, async () => {
  await using r = await loreRoom();
  const raised = r.nextRaised();
  const first = await pass(r);
  expect(first.outcome.outcome).toBe("suggested");
  expect(sentOpening(first.bodies)).toBe(true);
  const card = await raised;
  expect(card.kind).toBe("confirm");
  // A raised card writes nothing: the book stays empty until the host says yes.
  expect(await bookEntries(r)).toEqual([]);

  await r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId: card.suggestionId });

  const written = await bookEntries(r);
  expect(written).toHaveLength(1);
  expect(written[0]).toMatchObject({ keys: LORE.keys, content: LORE.content, title: expect.stringContaining(r.rule.id) });
  expect(await r.h.root.services.automation.listFires({ principal: r.h.owner, ruleId: r.rule.id })).toContainEqual(
    expect.objectContaining({ outcome: "fired", detail: expect.objectContaining({ analysisAct: "lore", confirmedByUserId: r.h.owner.userId }) }),
  );
  // The span the confirmed card covered is not read again; before the yes the same pass read it.
  const next = await pass(r);
  expect(sentOpening(next.bodies)).toBe(false);
});

test("a book detached since the card was raised refuses the confirm, records it and leaves the span uncovered", { tags: ["slow"] }, async () => {
  await using r = await loreRoom();
  const raised = r.nextRaised();
  await pass(r);
  const card = await raised;
  await r.h.root.services.worldInfo.detachFromChat({ principal: r.h.owner, chatId: r.h.chatId, bookId: r.book.id });

  await expect(r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId: card.suggestionId })).rejects.toMatchObject({
    code: "automation_suggestion_act_failed",
  });

  expect(await bookEntries(r)).toEqual([]);
  expect(await r.h.root.services.automation.listFires({ principal: r.h.owner, ruleId: r.rule.id })).toContainEqual(
    expect.objectContaining({
      outcome: "action_error",
      detail: expect.objectContaining({ analysisAct: "lore", error: expect.stringContaining(r.book.id) }),
    }),
  );
  // The refused write moved no watermark, so the next pass distills the same span again.
  const next = await pass(r);
  expect(sentOpening(next.bodies)).toBe(true);
});
